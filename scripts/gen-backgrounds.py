#!/usr/bin/env python3
"""Genererar dashboardens bakgrundsbilder (egna, inga externa källor).

6 väderlekar × 3 tider på dygnet, i två format (JPEG < 100 kB):
liggande 1280×720 för plattan (huvudskärm) i apps/web/public/bg/<väder>-<tid>.jpg
och stående 720×1280 för mobil i <väder>-<tid>-p.jpg.

Motiv (inspirerade av fotografier, helt procedurella):
  rain   – regndroppar på fönsterglas framför suddiga stadsljus (bokeh)
  snow   – snötäckt granskog; natt med stjärnhimmel och Vintergatan
  clear  – solnedgång/sol över ett hav av moln; natt med stjärnhimmel
  cloudy – långa rosa/violetta molnstråk
  fog    – granskog i lager som försvinner i dis
  storm  – lila ovädersmoln med blixtar

Högdagrar tonas ner mjukt så att text på glaskort klarar WCAG AA.
Kör: python3 scripts/gen-backgrounds.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "apps/web/public/bg"
SIZES = {"": (1280, 720), "-p": (720, 1280)}
CONDITIONS = ["clear", "cloudy", "rain", "snow", "fog", "storm"]
PHASES = ["day", "dusk", "night"]

W = H = 0
yy = xx = ny = nx = None


def set_size(w: int, h: int) -> None:
    global W, H, yy, xx, ny, nx
    W, H = w, h
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ny, nx = yy / H, xx / W


# ---------- verktyg ----------

def _box(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussisk oskärpa approximerad med tre boxfilter (flyttal, valfri kanal)."""
    r = int(round((np.sqrt(4 * sigma * sigma + 1) - 1) / 2))
    if r < 1:
        return a.astype(np.float32)
    for _ in range(3):
        a = _box(_box(a, r, 0), r, 1)
    return a


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), Image.BICUBIC), np.float32)


def fbm(rng, octaves=5, base=4, stretch=(1.0, 1.0)) -> np.ndarray:
    """Fraktalt brus 0–1. stretch > 1 i x ger långa stråk."""
    out = np.zeros((H, W), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        f = base * 2 ** o
        gw = max(2, int(f * W / max(W, H) / stretch[0]) + 2)
        gh = max(2, int(f * H / max(W, H) / stretch[1]) + 2)
        out += resize(rng.random((gh, gw)), W, H) * amp
        total += amp
        amp *= 0.5
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def shift(a: np.ndarray, dy: int) -> np.ndarray:
    """Förskjut nedåt (dy > 0) utan att rulla runt kanten."""
    out = np.zeros_like(a)
    out[dy:] = a[:-dy] if dy > 0 else a
    return out


def grad(stops) -> np.ndarray:
    """Vertikal toning; stops = [(pos, (r,g,b)), ...]."""
    pos = np.array([p for p, _ in stops], np.float32)
    cols = np.array([c for _, c in stops], np.float32)
    return np.stack([np.interp(ny, pos, cols[:, k]) for k in range(3)], -1)


def glow(cx, cy, r) -> np.ndarray:
    d2 = (nx - cx) ** 2 + ((ny - cy) * H / W) ** 2
    return np.exp(-d2 / (r * r))


def over(img, color, mask):
    m = np.clip(mask, 0, 1)[..., None]
    return img * (1 - m) + np.asarray(color, np.float32) * m


def add(img, color, mask):
    return img + np.clip(mask, 0, None)[..., None] * np.asarray(color, np.float32)


def stars(rng, img, density, region=None, boost=None):
    s = np.zeros((H, W), np.float32)
    n = int(W * H * density)
    ys, xs = rng.integers(0, H, n), rng.integers(0, W, n)
    s[ys, xs] = rng.random(n) ** 3
    if boost is not None:
        s *= 0.3 + 1.7 * boost
    if region is not None:
        s *= region
    return add(img, (0.85, 0.9, 1.0), blur(s, 0.6) * 2.2 + blur(s, 2.5) * 3.0)


def milky_way(rng, img, strength=0.35):
    """Diagonalt band av dis och tätare stjärnor."""
    a, b = (0.15, 0.0), (0.85, 1.0)
    dx, dy = b[0] - a[0], (b[1] - a[1]) * H / W
    dist = np.abs((nx - a[0]) * dy - (ny - a[1]) * H / W * dx) / np.hypot(dx, dy)
    fade = np.clip(1.25 - ny * 1.4, 0, 1)
    band = np.exp(-(dist / 0.13) ** 2) * (0.4 + 0.8 * fbm(rng, 6, 6)) * fade
    img = add(img, (0.45, 0.42, 0.62), band * strength)
    img = add(img, (0.85, 0.65, 0.5), np.exp(-(dist / 0.05) ** 2) * fbm(rng, 5, 10) * strength * 0.4 * fade)
    return img, band


def spruce_layer(rng, ground_y, height, count, snow=False):
    """Mask för en rad granar (triangelstaplar) + snö på grenarna."""
    m, s = Image.new("L", (W, H), 0), Image.new("L", (W, H), 0)
    dm, ds = ImageDraw.Draw(m), ImageDraw.Draw(s)
    dm.rectangle([0, int(ground_y * H), W, H], fill=255)
    for _ in range(count):
        x = rng.random() * W
        h = height * H * (0.6 + 0.8 * rng.random())
        base = ground_y * H + rng.random() * 0.02 * H
        w = h * (0.28 + 0.1 * rng.random())
        tiers = 6
        for t in range(tiers):
            top = base - h + h * t / tiers * 0.9
            bot = top + h / tiers * 1.9
            half = w * (0.25 + 0.75 * (t + 1) / tiers) / 2
            j = lambda: (rng.random() - 0.5) * half * 0.35
            left = [(x - half * f + j(), top + (bot - top) * f + j() * 0.5) for f in (0.35, 0.7, 1.0)]
            right = [(x + half * f + j(), top + (bot - top) * f + j() * 0.5) for f in (1.0, 0.7, 0.35)]
            dm.polygon([(x, top)] + left + [(x, bot - (bot - top) * 0.25)] + right, fill=255)
            if snow:
                ds.line([left[1], left[2], (x, bot - (bot - top) * 0.25), right[0], right[1]], fill=255, width=max(1, int(h / 60)))
    mask = np.asarray(m, np.float32) / 255
    return mask, np.asarray(s, np.float32) / 255 * mask


def lightning(rng, x0, y0, y1) -> np.ndarray:
    """Blixt som förgrenad linje (mittpunktsförskjutning)."""
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)

    def bolt(p, q, disp, width, level):
        pts = [p, q]
        for _ in range(6):
            new = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                new += [((a[0] + b[0]) / 2 + rng.normal() * disp, (a[1] + b[1]) / 2), b]
            pts, disp = new, disp * 0.55
        d.line(pts, fill=int(255 * (1 - 0.3 * level)), width=max(1, int(width)))
        if level < 2:
            for _ in range(rng.integers(1, 4)):
                sx, sy = pts[rng.integers(len(pts) // 5, len(pts) - 2)]
                end = (sx + rng.normal() * W * 0.06, sy + (q[1] - sy) * (0.25 + 0.35 * rng.random()))
                bolt((sx, sy), end, disp * 3, width * 0.6, level + 1)

    bolt((x0 * W, y0 * H), ((x0 + rng.normal() * 0.08) * W, y1 * H), W * 0.05, max(2, W / 400), 0)
    return np.asarray(img, np.float32) / 255


def finish(rng, img, exposure=1.0):
    """Mjuk högdagerkomprimering, vinjett och filmkorn."""
    img = np.clip(img * exposure, 0, None)
    knee = 0.45
    img = np.where(img > knee, knee + (1 - knee) * (1 - np.exp(-(img - knee) / (1 - knee) * 1.2)) * 0.4, img)
    vig = 1 - 0.5 * np.clip(np.hypot(nx - 0.5, (ny - 0.5) * 0.9) * 1.45, 0, 1) ** 1.8
    img *= vig[..., None]
    img += rng.standard_normal((H, W)).astype(np.float32)[..., None] * 0.012
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB")


# ---------- motiv ----------

def sky_for(phase):
    if phase == "day":
        return grad([(0, (0.06, 0.16, 0.34)), (0.55, (0.20, 0.38, 0.58)), (1, (0.42, 0.52, 0.62))])
    if phase == "dusk":
        return grad([(0, (0.10, 0.07, 0.25)), (0.35, (0.42, 0.16, 0.36)), (0.6, (0.85, 0.38, 0.28)),
                     (0.75, (0.98, 0.62, 0.32)), (1, (0.35, 0.18, 0.22))])
    return grad([(0, (0.01, 0.02, 0.06)), (0.6, (0.03, 0.05, 0.13)), (1, (0.06, 0.07, 0.16))])


def clear(rng, phase):
    img = sky_for(phase)
    horizon = 0.62
    if phase == "night":
        img, band = milky_way(rng, img)
        img = stars(rng, img, 0.0022, region=(ny < horizon + 0.05), boost=band)
    sun_x = 0.68 if phase == "day" else 0.42
    sun_y = 0.28 if phase == "day" else horizon - 0.02
    if phase != "night":
        img = add(img, (1.0, 0.75, 0.45) if phase == "dusk" else (1.0, 0.95, 0.8), glow(sun_x, sun_y, 0.35) * 0.55)
        img = add(img, (1.0, 0.9, 0.7), glow(sun_x, sun_y, 0.05) * 0.9)
    # Molnhav nedanför horisonten, upplyst ovanifrån.
    n = fbm(rng, 6, 5, stretch=(2.2, 1.0))
    puff = fbm(rng, 6, 16, stretch=(1.6, 1.0))
    edge = horizon + 0.05 * (n - 0.5) + 0.035 * (puff - 0.5)
    sea = np.clip((ny - edge) * 30, 0, 1)
    top_light = np.clip(1 - (ny - edge) * 4, 0, 1) * sea
    lit = {"day": (0.75, 0.8, 0.88), "dusk": (1.0, 0.62, 0.42), "night": (0.25, 0.3, 0.45)}[phase]
    shade = {"day": (0.22, 0.28, 0.4), "dusk": (0.22, 0.14, 0.24), "night": (0.03, 0.04, 0.09)}[phase]
    body = np.asarray(shade, np.float32) * (0.45 + 0.6 * n[..., None] + 0.5 * puff[..., None])
    img = img * (1 - sea[..., None]) + body * sea[..., None]
    light = glow(sun_x, horizon, 0.9) if phase != "night" else 0.6
    img = add(img, lit, top_light * (0.15 + 0.85 * puff ** 1.5) * 0.9 * light)
    img = add(img, lit, sea * np.clip(puff - 0.55, 0, 1) * 0.6 * (light if phase != 'night' else 0.4))
    return finish(rng, img, 0.95)


def cloudy(rng, phase):
    img = sky_for(phase)
    streak = fbm(rng, 6, 3, stretch=(6, 1))
    detail = fbm(rng, 5, 12, stretch=(3, 1))
    c = np.clip((streak * 0.7 + detail * 0.3 - 0.35) * 2.4, 0, 1)
    lit = {"day": (0.62, 0.66, 0.75), "dusk": (0.95, 0.42, 0.55), "night": (0.16, 0.16, 0.28)}[phase]
    rim = {"day": (0.9, 0.9, 0.95), "dusk": (1.0, 0.7, 0.45), "night": (0.32, 0.3, 0.48)}[phase]
    shadow = np.clip(c - shift(c, int(H * 0.012)), 0, 1)  # molnens undersida
    highlight = np.clip(shift(c, int(H * 0.01)) - c, 0, 1) * 3  # upplyst ovankant
    img = over(img, lit, c * 0.75)
    img = add(img, rim, blur(highlight, 2) * 0.5)
    img = img * (1 - 0.35 * shadow[..., None])
    if phase == "dusk":
        img = add(img, (1.0, 0.55, 0.35), glow(0.5, 0.85, 0.45) * 0.35)
    if phase == "night":
        img = stars(rng, img, 0.0008, region=1 - c)
    return finish(rng, img, 1.0)


def rain(rng, phase):
    # Bakom glaset: suddig stad med varma ljus.
    base = {"day": (0.16, 0.2, 0.26), "dusk": (0.18, 0.12, 0.16), "night": (0.03, 0.035, 0.06)}[phase]
    img = grad([(0, base), (1, tuple(v * 0.6 for v in base))])
    bok = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(bok, "RGBA")
    scale = W / 1280 * (1.6 if H > W else 1)
    for _ in range({"day": 40, "dusk": 90, "night": 140}[phase]):
        x, y = rng.random() * W, (0.25 + 0.7 * rng.random() ** 0.8) * H
        r = (10 + rng.random() ** 2 * 46) * scale
        warm = rng.random() < (0.85 if phase != "day" else 0.4)
        col = (255, 170 + int(rng.random() * 60), 80) if warm else (150, 190, 255)
        a = int(40 + rng.random() * 110)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (a,))
        d.ellipse([x - r, y - r, x + r, y + r], outline=col + (min(255, a + 60),), width=max(1, int(r / 7)))
    bokeh = np.asarray(bok.filter(ImageFilter.GaussianBlur(3.5 * W / 1280)), np.float32) / 255
    bokeh = bokeh * 0.7 + blur(bokeh, 18) * 0.9  # ljussken runt lamporna
    img = blur(img + bokeh * {"day": 0.45, "dusk": 0.8, "night": 1.0}[phase], 1.5)
    # Droppar på glaset: mörk kant, ljus höjdpunkt, rinnspår.
    drops, hl = Image.new("L", (W, H), 0), Image.new("L", (W, H), 0)
    dd, dh = ImageDraw.Draw(drops), ImageDraw.Draw(hl)
    for _ in range(int(900 * W * H / (1280 * 720))):
        x, y = rng.random() * W, rng.random() * H
        r = 2.5 + rng.random() ** 2.5 * 10
        dd.ellipse([x - r, y - r * 1.15, x + r, y + r * 1.15], outline=180, width=max(1, int(r / 3)))
        dh.ellipse([x - r * 0.35, y - r * 0.7, x + r * 0.1, y - r * 0.25], fill=255)
    for _ in range(int(40 * W / 1280)):
        x, y0 = rng.random() * W, rng.random() * H * 0.7
        pts, y = [], y0
        while y < H and y < y0 + H * (0.15 + 0.4 * rng.random()):
            pts.append((x + np.sin(y * 0.05) * 2, y))
            y += 6
        if len(pts) > 1:
            dd.line(pts, fill=140, width=2)
    img = img * (1 - blur(np.asarray(drops, np.float32) / 255, 0.8)[..., None] * 0.5)
    img = add(img, (0.85, 0.9, 1.0), blur(np.asarray(hl, np.float32) / 255, 1.0) * 0.18)
    return finish(rng, img, 1.0)


def snow(rng, phase):
    img = sky_for(phase)
    if phase == "night":
        img, band = milky_way(rng, img, 0.45)
        img = stars(rng, img, 0.0026, region=(ny < 0.75), boost=band)
    else:
        sx, sy = (0.7, 0.45) if phase == "day" else (0.45, 0.66)
        img = add(img, (1.0, 0.8, 0.55), glow(sx, sy, 0.4) * (0.4 if phase == "day" else 0.6))
        img = add(img, (1.0, 0.92, 0.75), glow(sx, sy, 0.04) * 0.9)
    snowcol = np.asarray({"day": (0.62, 0.68, 0.78), "dusk": (0.62, 0.5, 0.58), "night": (0.16, 0.2, 0.32)}[phase], np.float32)
    treecol = np.asarray({"day": (0.05, 0.09, 0.1), "dusk": (0.08, 0.05, 0.08), "night": (0.015, 0.02, 0.035)}[phase], np.float32)
    for gy, hgt, cnt, haze in [(0.72, 0.16, 40, 0.55), (0.8, 0.26, 22, 0.25), (0.9, 0.42, 9, 0.0)]:
        m, s = spruce_layer(rng, gy, hgt, cnt, snow=True)
        m, s = blur(m, 1.2 + haze * 3), blur(s, 1.0)
        far = treecol * (1 - haze) + img.mean(axis=(0, 1)) * haze
        img = over(img, far, m)
        img = over(img, snowcol * (1 - haze * 0.4), s * 0.7)
        ground = np.clip((ny - gy) * 40, 0, 1)
        img = over(img, snowcol * (0.55 + 0.35 * fbm(rng, 4, 8))[..., None], ground * (0.35 + 0.4 * (ny - gy).clip(0, 1)))
    flakes = (rng.random((H, W)) > 0.9985).astype(np.float32)
    img = add(img, (0.9, 0.92, 1.0), blur(flakes, 1.2) * 2.5)
    return finish(rng, img, 0.95)


def fog(rng, phase):
    img = sky_for(phase)
    hazecol = np.asarray({"day": (0.5, 0.56, 0.62), "dusk": (0.7, 0.5, 0.48), "night": (0.1, 0.12, 0.18)}[phase], np.float32)
    img = over(img, hazecol, np.clip(ny * 1.2, 0, 1) * 0.6)
    for i, (gy, hgt, cnt) in enumerate([(0.55, 0.12, 50), (0.63, 0.18, 34), (0.73, 0.26, 20), (0.86, 0.4, 9)]):
        m, _ = spruce_layer(rng, gy, hgt, cnt)
        depth = 1 - i / 4
        img = over(img, hazecol * (0.25 + 0.6 * depth), blur(m, 1 + depth * 4) * (0.95 - 0.1 * depth))
        band = np.clip(1 - np.abs(ny - (gy + 0.02)) * 12, 0, 1) * (0.6 + 0.4 * fbm(rng, 4, 4, (4, 1)))
        img = over(img, hazecol, band * 0.45)
    return finish(rng, img, 1.0)


def storm(rng, phase):
    base = {"day": (0.16, 0.12, 0.28), "dusk": (0.2, 0.08, 0.24), "night": (0.05, 0.03, 0.1)}[phase]
    img = grad([(0, base), (1, tuple(v * 0.5 for v in base))])
    c = fbm(rng, 6, 4)
    bx = 0.35 + rng.random() * 0.3
    cloud = np.clip((c - 0.3) * 1.8, 0, 1)
    img = add(img, (0.55, 0.38, 0.85), cloud * glow(bx, 0.3, 0.35) * 0.9)
    img = add(img, (0.25, 0.2, 0.45), cloud * 0.35)
    bolt = lightning(rng, bx, 0.12, 0.95)
    img = add(img, (0.75, 0.7, 1.0), blur(bolt, 18) * 1.4 + blur(bolt, 5) * 1.2)
    img = add(img, (1.0, 1.0, 1.0), blur(bolt, 0.8) * 1.6)
    hills, _ = spruce_layer(rng, 0.9, 0.08, 30)
    img = over(img, (0.02, 0.015, 0.04), blur(hills, 1.5))
    return finish(rng, img, 0.9)


MOTIFS = {"clear": clear, "cloudy": cloudy, "rain": rain, "snow": snow, "fog": fog, "storm": storm}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    for suffix, (w, h) in SIZES.items():
        set_size(w, h)
        for i, cond in enumerate(CONDITIONS):
            for j, phase in enumerate(PHASES):
                rng = np.random.default_rng(100 + i * 10 + j)
                path = OUT / f"{cond}-{phase}{suffix}.jpg"
                MOTIFS[cond](rng, phase).save(path, "JPEG", quality=74, optimize=True, progressive=True)
                lum = np.asarray(Image.open(path).convert("L"), np.float32) / 255
                print(f"{path.name:22} {path.stat().st_size // 1024:3d} kB  p99={np.percentile(lum, 99):.2f}")


if __name__ == "__main__":
    main()
