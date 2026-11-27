// Pré-calcule les données géo (Natural Earth, domaine public) en un JSON compact.
// Usage : npm run geo   (lit data-raw/*.geojson, écrit public/geo/geo.json)
import fs from 'node:fs';

const raw = (f) => JSON.parse(fs.readFileSync(new URL(`../data-raw/${f}.geojson`, import.meta.url)));

// ---------- helpers ----------
function polysOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function bbox(ring) {
  let a = 180, b = 90, c = -180, d = -90;
  for (const [x, y] of ring) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function makeLandTester(fc) {
  const polys = [];
  for (const f of fc.features) for (const p of polysOf(f.geometry)) polys.push({ p, bb: bbox(p[0]) });
  return (x, y) => {
    for (const { p, bb } of polys) {
      if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
      if (inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h))) return true;
    }
    return false;
  };
}
const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// Zone Europe détaillée
const EU = { lon0: -6, lon1: 14, lat0: 40, lat1: 56 };
const inEU = (x, y) => x >= EU.lon0 && x <= EU.lon1 && y >= EU.lat0 && y <= EU.lat1;

// ---------- 1. polygones de terre ----------
// Sutherland–Hodgman : découpe un anneau [ [x,y], ... ] par un rectangle
function clipRing(ring, b) {
  const edges = [
    (p) => p[0] >= b.lon0, (p) => p[0] <= b.lon1, (p) => p[1] >= b.lat0, (p) => p[1] <= b.lat1,
  ];
  const inter = (a, c, k) => {
    const [ax, ay] = a, [cx, cy] = c;
    if (k < 2) { const x = k === 0 ? b.lon0 : b.lon1; const t = (x - ax) / (cx - ax); return [x, ay + t * (cy - ay)]; }
    const y = k === 2 ? b.lat0 : b.lat1; const t = (y - ay) / (cy - ay); return [ax + t * (cx - ax), y];
  };
  let out = ring;
  for (let k = 0; k < 4 && out.length; k++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[k](cur), pi = edges[k](prev);
      if (ci) { if (!pi) out.push(inter(prev, cur, k)); out.push(cur); }
      else if (pi) out.push(inter(prev, cur, k));
    }
  }
  return out;
}
function flat(ring, dec) {
  const out = []; let px = null, py = null;
  for (const [x, y] of ring) { const a = r(x, dec), b = r(y, dec); if (a === px && b === py) continue; out.push(a, b); px = a; py = b; }
  return out;
}
const land = [];
for (const f of raw('ne_50m_land').features) for (const p of polysOf(f.geometry)) {
  const fl = flat(p[0], 2); if (fl.length >= 8) land.push(fl);
}
const EUC = { lon0: -14, lon1: 24, lat0: 34, lat1: 62 };
const landEU = [];
for (const f of raw('ne_10m_land').features) for (const p of polysOf(f.geometry)) {
  const bb = bbox(p[0]);
  if (bb[2] < EUC.lon0 || bb[0] > EUC.lon1 || bb[3] < EUC.lat0 || bb[1] > EUC.lat1) continue;
  const c = clipRing(p[0], EUC); if (c.length < 4) continue;
  const fl = flat(c, 3); if (fl.length >= 8) landEU.push(fl);
}
console.log('land polys', land.length, 'europe', landEU.length);

// ---------- 2. frontières ----------
function ringsToLines(fc, filter, dec, minPts) {
  const out = [];
  for (const f of fc.features) {
    if (!filter(f)) continue;
    for (const p of polysOf(f.geometry)) {
      const ring = p[0];
      const line = [];
      let px = null, py = null;
      for (const [x, y] of ring) {
        const a = r(x, dec), b = r(y, dec);
        if (a === px && b === py) continue;
        line.push(a, b); px = a; py = b;
      }
      if (line.length / 2 >= minPts) out.push(line);
    }
  }
  return out;
}
const c50 = raw('ne_50m_admin_0_countries');
const c10 = raw('ne_10m_admin_0_countries');
const iso = (f) => f.properties.ADM0_A3 || f.properties.ISO_A3;
const EU_SET = new Set(['FRA', 'BEL', 'NLD', 'DEU', 'LUX', 'ESP', 'GBR', 'CHE', 'ITA', 'AND', 'AUT', 'DNK', 'MCO', 'LIE', 'CZE', 'POL', 'IRL']);
const borders = ringsToLines(c50, (f) => !EU_SET.has(iso(f)), 2, 6);
const bordersEU = ringsToLines(c10, (f) => EU_SET.has(iso(f)), 3, 4);
const belgium = ringsToLines(c10, (f) => iso(f) === 'BEL', 3, 4);
console.log('border lines', borders.length, 'belgium', belgium.length);

// ---------- 3. lumières des villes ----------
const lights = [];
for (const f of raw('ne_10m_populated_places_simple').features) {
  const pop = f.properties.pop_max || 0;
  const [x, y] = f.geometry.coordinates;
  if (pop > 40000 || (inEU(x, y) && pop > 8000)) lights.push(r(x, 3), r(y, 3), Math.round(pop / 1000));
}
console.log('city lights', lights.length / 3);

fs.writeFileSync(new URL('../public/geo/geo.json', import.meta.url), JSON.stringify({ land, landEU, borders, bordersEU, belgium, lights }));
console.log('written', fs.statSync(new URL('../public/geo/geo.json', import.meta.url)).size, 'bytes');
