#!/usr/bin/env python3
"""Genererar dashboardens bakgrundsbilder (egna, inga externa källor).

5 väderlekar × 3 tider på dygnet, i två format (JPEG < 100 kB):
liggande 1280×720 för plattan (huvudskärm) i apps/web/public/bg/<väder>-<tid>.jpg
och stående 720×1280 för mobil i <väder>-<tid>-p.jpg. Mörka med avsikt så att text på
glaskorten klarar WCAG AA. Deterministiska (fast slumpfrö per bild).

Kör: python3 scripts/gen-backgrounds.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SIZES = {"": (1280, 720), "-p": (720, 1280)}
W, H = 1280, 720
OUT = Path(__file__).resolve().parent.parent / "apps/web/public/bg"
CONDITIONS = ["clear", "cloudy", "rain", "snow", "fog"]
PHASES = ["day", "dusk", "night"]

# Himmel uppifrån och ner (RGB 0–1), redan mörka.
SKY = {
    "day": [(0.07, 0.17, 0.33), (0.13, 0.30, 0.48), (0.24, 0.40, 0.52)],
    "dusk": [(0.06, 0.06, 0.18), (0.30, 0.13, 0.30), (0.62, 0.30, 0.22)],
    "night": [(0.01, 0.02, 0.06), (0.03, 0.05, 0.13), (0.06, 0.08, 0.18)],
}
# Ljuskälla: (x, y, radie, färg, styrka) i relativa koordinater.
GLOW = {
    "day": (0.72, 0.16, 0.30, (1.0, 0.92, 0.70), 0.35),
    "dusk": (0.35, 0.62, 0.45, (1.0, 0.55, 0.30), 0.55),
    "night": (0.75, 0.14, 0.10, (0.80, 0.85, 1.0), 0.30),
}
CLOUDINESS = {"clear": 0.0, "cloudy": 0.75, "rain": 0.95, "snow": 0.8, "fog": 0.5}



def set_size(w: int, h: int) -> None:
    global W, H, yy, xx, ny, nx
    W, H = w, h
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ny, nx = yy / H, xx / W


set_size(W, H)


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Gaussisk oskärpa per kanal via Pillow (snabbt, inga fler beroenden)."""
    if a.ndim == 2:
        img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), "L")
        return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255
    return np.stack([blur(a[..., c], radius) for c in range(a.shape[2])], -1)


def gradient(stops):
    t = ny[..., None] * (len(stops) - 1)
    i = np.clip(t.astype(int), 0, len(stops) - 2)
    f = t - i
    s = np.array(stops, np.float32)
    return s[i[..., 0]] * (1 - f) + s[i[..., 0] + 1] * f


def noise(rng, scale: int, radius: float) -> np.ndarray:
    """Lågfrekvent brus för moln och dis."""
    small = rng.random((H // scale, W // scale)).astype(np.float32)
    big = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
    return blur(big, radius)


def ridge(rng, base: float, amp: float, freq: float) -> np.ndarray:
    """Mjuk silhuett av skogsklädda kullar (1 = mark)."""
    x = np.linspace(0, 1, W)
    phase = rng.random() * 6.28
    line = base + amp * (0.6 * np.sin(x * freq + phase) + 0.4 * np.sin(x * freq * 2.7 + phase * 1.7))
    line += 0.012 * blur(rng.random((1, W)).astype(np.float32).repeat(8, 0), 2)[0]  # trädtoppar
    return blur((ny > line[None, :]).astype(np.float32), 3)


def render(cond: str, phase: str, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = gradient(SKY[phase])

    gx, gy, gr, gc, gs = GLOW[phase]
    d = np.sqrt((nx - gx) ** 2 + ((ny - gy) * H / W) ** 2)
    glow = np.exp(-((d / gr) ** 2)) * gs * (1 - 0.6 * CLOUDINESS[cond])
    img += glow[..., None] * np.array(gc, np.float32)

    if phase == "night" and cond == "clear":  # stjärnor
        stars = (rng.random((H, W)) > 0.9985).astype(np.float32) * (ny < 0.6)
        img += blur(stars, 0.8)[..., None] * 1.6

    c = CLOUDINESS[cond]
    if c:
        clouds = noise(rng, 64, 30) * 0.6 + noise(rng, 16, 10) * 0.4
        clouds = np.clip((clouds - 0.45 + 0.25 * c) * 2.2, 0, 1) * c
        tint = np.array([0.45, 0.48, 0.55] if phase != "dusk" else [0.55, 0.38, 0.40], np.float32)
        tint *= {"day": 0.75, "dusk": 0.6, "night": 0.22}[phase]
        img = img * (1 - clouds[..., None] * 0.7) + clouds[..., None] * tint

    if cond == "fog":
        haze = np.clip(1 - np.abs(ny - 0.72) * 2.4, 0, 1) * (0.6 + 0.4 * noise(rng, 32, 18))
        level = {"day": 0.42, "dusk": 0.36, "night": 0.12}[phase]
        img = img * (1 - haze[..., None] * 0.6) + haze[..., None] * level

    # Bokeh: mjuka ljuspunkter (stadsljus i dis, droppar i regn).
    n = {"clear": 14, "cloudy": 10, "rain": 26, "snow": 8, "fog": 16}[cond]
    bokeh = np.zeros((H, W), np.float32)
    for _ in range(n):
        cx, cy, r = rng.random() * W, (0.45 + 0.5 * rng.random()) * H, 10 + rng.random() * 38
        bokeh += np.clip(1 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r, 0, 1) ** 0.6 * (0.25 + 0.5 * rng.random())
    warm = np.array([1.0, 0.75, 0.45] if phase != "day" else [0.85, 0.9, 1.0], np.float32)
    img += blur(bokeh, 6)[..., None] * warm * {"day": 0.10, "dusk": 0.22, "night": 0.30}[phase]

    if cond == "rain":
        streak = np.zeros((H, W), np.float32)
        for _ in range(int(500 * W * H / (720 * 1280))):
            x0, y0, length = rng.random() * W, rng.random() * H, 40 + rng.random() * 90
            t = np.linspace(0, 1, 40)
            xs = np.clip((x0 + t * length * 0.22).astype(int), 0, W - 1)
            ys = np.clip((y0 + t * length).astype(int), 0, H - 1)
            streak[ys, xs] = 0.5 + 0.5 * rng.random()
        img += blur(streak, 1.2)[..., None] * 0.35
    if cond == "snow":
        flakes = (rng.random((H, W)) > 0.9975).astype(np.float32)
        img += (blur(flakes, 1.6) * 3.0 + blur(flakes, 4) * 2.0)[..., None] * 0.55

    # Silhuetter: två lager kullar, det främre mörkast.
    for base, amp, freq, shade in [(0.74, 0.04, 7, 0.55), (0.84, 0.035, 11, 0.25)]:
        m = ridge(rng, base, amp, freq)
        img = img * (1 - m[..., None]) + img * m[..., None] * shade * 0.35

    # Vinjett, filmkorn och slutlig nedtoning.
    vig = 1 - 0.55 * np.clip(np.sqrt((nx - 0.5) ** 2 + ((ny - 0.45) * 0.8) ** 2) * 1.5, 0, 1) ** 1.6
    img *= vig[..., None]
    img += (rng.standard_normal((H, W)).astype(np.float32) * 0.010)[..., None]
    img = np.clip(img * 0.92, 0, 1)
    return Image.fromarray((img * 255).astype(np.uint8), "RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for suffix, (w, h) in SIZES.items():
        set_size(w, h)
        for i, cond in enumerate(CONDITIONS):
            for j, phase in enumerate(PHASES):
                path = OUT / f"{cond}-{phase}{suffix}.jpg"
                render(cond, phase, seed=100 + i * 10 + j).save(path, "JPEG", quality=72, optimize=True, progressive=True)
                lum = np.asarray(Image.open(path).convert("L"), np.float32) / 255
                print(f"{path.name:20} {path.stat().st_size // 1024:3d} kB  ljusast(p99)={np.percentile(lum, 99):.2f}")


if __name__ == "__main__":
    main()
