/**
 * Minimal MessagePack-avkodare (räcker för Forza): nil, bool, heltal, flyttal, str, bin, array, map och tidsstämpel
 * (ext −1 → Date). Andra ext-typer blir null. Kastar vid okänd byte eller avskuret innehåll.
 */
export function decodeMsgpack(buf: Uint8Array): unknown {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const txt = new TextDecoder();
  let p = 0;
  const num = (get: () => number, n: number) => { const x = get(); p += n; return x; };
  const u8 = () => num(() => v.getUint8(p), 1), u16 = () => num(() => v.getUint16(p), 2), u32 = () => num(() => v.getUint32(p), 4);
  const str = (n: number) => { const s = txt.decode(buf.subarray(p, p + n)); p += n; return s; };
  const bin = (n: number) => { const x = buf.slice(p, p + n); p += n; return x; };
  const arr = (n: number) => Array.from({ length: n }, () => read());
  const map = (n: number) => { const o: Record<string, unknown> = {}; for (let i = 0; i < n; i++) { const k = String(read()); o[k] = read(); } return o; };
  /** Tillägg: n byte data efter typbyten. Tidsstämpel (−1) i 32, 64 eller 96 bitar. */
  const ext = (n: number): unknown => {
    const type = v.getInt8(p); p += 1;
    const at = p; p += n;
    if (type !== -1) return null;
    if (n === 4) return new Date(v.getUint32(at) * 1000);
    if (n === 8) { const hi = v.getUint32(at), lo = v.getUint32(at + 4); return new Date(((hi & 3) * 2 ** 32 + lo) * 1000 + Math.floor((hi >>> 2) / 1e6)); }
    if (n === 12) return new Date(Number(v.getBigInt64(at + 4)) * 1000 + Math.floor(v.getUint32(at) / 1e6));
    return null;
  };
  function read(): unknown {
    if (p >= buf.length) throw new Error('MessagePack: avskuret');
    const b = v.getUint8(p++);
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 256;
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(u8());
      case 0xc5: return bin(u16());
      case 0xc6: return bin(u32());
      case 0xc7: return ext(u8());
      case 0xc8: return ext(u16());
      case 0xc9: return ext(u32());
      case 0xca: return num(() => v.getFloat32(p), 4);
      case 0xcb: return num(() => v.getFloat64(p), 8);
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: return num(() => Number(v.getBigUint64(p)), 8);
      case 0xd0: return num(() => v.getInt8(p), 1);
      case 0xd1: return num(() => v.getInt16(p), 2);
      case 0xd2: return num(() => v.getInt32(p), 4);
      case 0xd3: return num(() => Number(v.getBigInt64(p)), 8);
      case 0xd4: return ext(1);
      case 0xd5: return ext(2);
      case 0xd6: return ext(4);
      case 0xd7: return ext(8);
      case 0xd8: return ext(16);
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return arr(u16());
      case 0xdd: return arr(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
    }
    throw new Error(`MessagePack: okänd byte 0x${b.toString(16)}`);
  }
  return read();
}
