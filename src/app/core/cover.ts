/**
 * Deterministic fallback cover art for items without embedded artwork.
 * The same name always yields the same gradient + letter, so a given album
 * looks identical everywhere it appears — no network, no dependency.
 */
export function coverGradient(name: string): string {
  const hue = hash(name) % 360;
  return `linear-gradient(135deg, hsl(${hue} 64% 52%), hsl(${(hue + 42) % 360} 58% 36%))`;
}

/** First letter/number of the name, uppercased (falls back to a note glyph). */
export function coverLetter(name: string): string {
  const m = name.trim().match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : '♪').toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}
