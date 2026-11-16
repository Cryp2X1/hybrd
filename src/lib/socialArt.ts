// Drawn (SVG) artwork for the Friends & Stories demo: sample avatars are initials, sample photos are simple illustrations.
// No real people or photos are used anywhere in the demo.
const enc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const tag = '<text x="388" y="490" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,.55)" letter-spacing="1.5">SAMPLE ILLUSTRATION</text>';
const wrap = (body: string, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="800" height="1000"><defs>${defs}</defs>${body}${tag}</svg>`;

const SCENES: Record<string, () => string> = {
  trail: () => wrap(
    '<rect width="400" height="500" fill="url(#s)"/><circle cx="300" cy="150" r="42" fill="#ffd36b"/>'
    + '<path d="M0 300 L90 190 L160 260 L240 160 L330 250 L400 200 L400 500 L0 500Z" fill="#3b2a4d"/>'
    + '<path d="M0 360 L70 300 L150 340 L230 280 L320 330 L400 300 L400 500 L0 500Z" fill="#241a33"/>'
    + '<path d="M180 500 C 200 440, 150 420, 210 380 S 260 330, 230 300" stroke="#e8c9a0" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>',
    '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset=".6" stop-color="#b8577a"/><stop offset="1" stop-color="#4a2c5e"/></linearGradient>'),
  sunrise: () => wrap(
    '<rect width="400" height="500" fill="url(#g)"/><circle cx="200" cy="300" r="70" fill="#FFE600" opacity=".95"/>'
    + '<rect y="300" width="400" height="200" fill="#121212"/>'
    + '<path d="M0 360 Q200 330 400 360 M0 400 Q200 365 400 400 M0 445 Q200 400 400 445" stroke="#ff6a3d" stroke-width="6" fill="none"/>'
    + '<text x="200" y="120" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="46" fill="#0a0a0a">5:30 AM</text>',
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5e62"/></linearGradient>'),
  bike: () => wrap(
    '<rect width="400" height="500" fill="#151515"/><rect x="0" y="380" width="400" height="120" fill="#1f1f1f"/>'
    + '<g stroke="#FFE600" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="110" cy="330" r="62"/><circle cx="290" cy="330" r="62"/>'
    + '<path d="M110 330 L170 230 L270 230 L290 330 M170 230 L200 330 L270 230 M200 330 L110 330 M160 205 L195 205 M270 230 L262 190 L292 186"/></g>'
    + '<text x="200" y="110" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#fff">INDOOR RIDE</text>'),
  kettlebell: () => wrap(
    '<rect width="400" height="500" fill="#202020"/><circle cx="200" cy="300" r="105" fill="#FFE600"/>'
    + '<path d="M135 225 C 120 120, 280 120, 265 225" stroke="#FFE600" stroke-width="28" fill="none"/>'
    + '<rect x="160" y="290" width="80" height="34" rx="8" fill="#0a0a0a"/><text x="200" y="316" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="22" font-weight="700" fill="#FFE600">24KG</text>'),
  track: () => wrap(
    '<rect width="400" height="500" fill="#b5432c"/>'
    + '<g stroke="#fff" stroke-width="3" fill="none" opacity=".9"><ellipse cx="200" cy="250" rx="170" ry="220"/><ellipse cx="200" cy="250" rx="140" ry="190"/><ellipse cx="200" cy="250" rx="110" ry="160"/></g>'
    + '<ellipse cx="200" cy="250" rx="80" ry="130" fill="#2f7d3a"/><text x="200" y="262" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="34" fill="#fff">8 × 400</text>'),
  sled: () => wrap(
    '<rect width="400" height="500" fill="#121212"/><rect y="360" width="400" height="140" fill="#2a2a2a"/>'
    + '<path d="M110 360 L150 270 L300 270 L300 360Z" fill="#FFE600"/><rect x="170" y="240" width="22" height="30" fill="#ccc"/><rect x="250" y="240" width="22" height="30" fill="#ccc"/>'
    + '<path d="M150 270 L95 190" stroke="#ccc" stroke-width="10" stroke-linecap="round"/><path d="M40 380 h40 M20 410 h60" stroke="#555" stroke-width="5" stroke-linecap="round"/>'
    + '<text x="200" y="110" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#fff">SLED PUSH</text>'),
};
const cache = new Map<string, string>();
export function artUrl(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let u: string;
  if (name.startsWith('av:')) {
    const [, ini, hue] = name.split(':');
    u = enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(+hue + 40) % 360},70%,35%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#a)"/><text x="50" y="62" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#fff">${ini}</text></svg>`);
  } else u = enc((SCENES[name] || SCENES.trail)());
  cache.set(name, u);
  return u;
}
export const ART_NAMES = Object.keys(SCENES);
/** Story background presets (text stories). */
export const STORY_BGS = ['#FFE600', '#ff5e62', '#4f7cff', '#22c55e', '#a855f7', '#141414'];
