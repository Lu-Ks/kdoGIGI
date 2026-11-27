// Textures de carte nocturne dessinées en canvas (terres, côtes lumineuses, frontières, halos des villes)
import * as THREE from 'three';
import { uploadAndFree, isMobile } from './util.js';

// zone haute définition (Toulouse -> Anvers)
export const FINE = { lon0: -1.5, lon1: 7.5, lat0: 42.6, lat1: 52.4 };
// zone Europe intermédiaire
export const MID = { lon0: -14, lon1: 24, lat0: 34, lat1: 62 };

function draw(geo, { W, H, box, landKey, borderKey, coast, border, glow, dust, dotSize }) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sx = W / (box.lon1 - box.lon0), sy = H / (box.lat1 - box.lat0);
  const px = (lon) => (lon - box.lon0) * sx;
  const py = (lat) => (box.lat1 - lat) * sy;
  const path = (line) => {
    g.moveTo(px(line[0]), py(line[1]));
    for (let i = 2; i < line.length; i += 2) g.lineTo(px(line[i]), py(line[i + 1]));
  };

  // océan
  g.fillStyle = '#020409';
  g.fillRect(0, 0, W, H);

  // terres
  g.beginPath();
  for (const ring of geo[landKey]) (path(ring), g.closePath());
  g.fillStyle = '#141d2e';
  g.fill();
  // côtes lumineuses
  // (lueur simulée par 2 traits larges translucides : shadowBlur est trop lent sur iPhone)
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(90,150,255,0.10)';
  g.lineWidth = coast * 5;
  g.stroke();
  g.strokeStyle = 'rgba(110,165,255,0.22)';
  g.lineWidth = coast * 2.2;
  g.stroke();
  g.strokeStyle = 'rgba(170,205,255,0.6)';
  g.lineWidth = coast;
  g.stroke();

  // frontières
  g.beginPath();
  for (const line of geo[borderKey]) path(line);
  g.strokeStyle = 'rgba(200,215,255,0.22)';
  g.lineWidth = border;
  g.setLineDash([border * 4, border * 3]);
  g.stroke();
  g.setLineDash([]);

  // lumières nocturnes : halos des villes + poussière de lumières autour (zones habitées)
  const L = geo.lights;
  const near = [];
  for (let i = 0; i < L.length; i += 3) {
    const lon = L[i], lat = L[i + 1], pop = L[i + 2];
    if (lon < box.lon0 - 2 || lon > box.lon1 + 2 || lat < box.lat0 - 2 || lat > box.lat1 + 2) continue;
    near.push([px(lon), py(lat), pop]);
  }
  g.save();
  g.beginPath();
  for (const ring of geo[landKey]) (path(ring), g.closePath());
  g.clip();
  g.globalCompositeOperation = 'lighter';
  // poussière : points répartis autour des villes (gaussienne), proportionnels à la population
  const rnd = (() => { let x = 1234567; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
  const totalPop = near.reduce((a, c) => a + Math.sqrt(c[2]), 0) || 1;
  const N = dust;
  for (const [x, y, pop] of near) {
    const n = Math.round((N * Math.sqrt(pop)) / totalPop);
    const spread = Math.sqrt(pop) * glow * 0.9;
    for (let k = 0; k < n; k++) {
      const dx = gauss() * spread, dy = gauss() * spread;
      const a = 0.08 + rnd() * 0.35;
      g.fillStyle = `rgba(255,${190 + ((rnd() * 40) | 0)},120,${a})`;
      const s = dotSize * (0.6 + rnd() * 0.9);
      g.fillRect(x + dx, y + dy, s, s);
    }
  }
  // halos
  for (const [x, y, pop] of near) {
    const r = Math.max(2, Math.sqrt(pop) * glow);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,225,170,0.9)');
    grd.addColorStop(0.12, 'rgba(255,190,110,0.45)');
    grd.addColorStop(0.45, 'rgba(255,150,70,0.1)');
    grd.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  return c;
}

function tex(canvas, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = isMobile ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return uploadAndFree(renderer, t);
}

function mapSpecs(renderer) {
  // tailles prudentes sur mobile (mémoire canvas limitée sur iPhone)
  const mobile = matchMedia('(pointer: coarse)').matches || renderer.capabilities.maxTextureSize < 8192;
  const big = mobile ? 2048 : 4096;
  const fineS = mobile ? 2048 : 4096;
  const k = mobile ? 0.45 : 1; // densité de poussière lumineuse
  const rs = fineS / 4096; // échelle des traits/halos de la zone HD
  return {
    world: { W: big, H: big / 2, box: { lon0: -180, lon1: 180, lat0: -90, lat1: 90 }, landKey: 'land', borderKey: 'borders', coast: big / 4096, border: 0.6, glow: 0.12 * (big / 4096), dust: 30000 * k, dotSize: 1 },
    mid: { W: mobile ? 1024 : 2048, H: mobile ? 768 : 1536, box: MID, landKey: 'landEU', borderKey: 'bordersEU', coast: 1.2, border: 0.8, glow: mobile ? 0.18 : 0.35, dust: 40000 * k, dotSize: 1.2 },
    fine: { W: fineS, H: fineS, box: FINE, landKey: 'landEU', borderKey: 'bordersEU', coast: 2.5 * rs, border: 2 * rs, glow: 2.2 * rs, dust: 90000 * k, dotSize: Math.max(1.5, 2.5 * rs) },
  };
}

export function buildMapTextures(geo, renderer) {
  const sp = mapSpecs(renderer);
  const out = {};
  for (const k of Object.keys(sp)) out[k] = tex(draw(geo, sp[k]), renderer);
  return out;
}

// version asynchrone : rend la main au navigateur entre chaque carte (la barre de chargement avance)
export async function buildMapTexturesAsync(geo, renderer, onStep = () => {}) {
  const sp = mapSpecs(renderer);
  const keys = Object.keys(sp);
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    await new Promise((r) => (requestAnimationFrame(() => setTimeout(r, 0)), setTimeout(r, 60)));
    out[keys[i]] = tex(draw(geo, sp[keys[i]]), renderer);
    onStep((i + 1) / keys.length);
  }
  return out;
}

// Matériau carte : texture + fresnel + bascule "chaos" (noir & jaune) + fondu des bords pour les patchs
export function mapMaterial(map, { edge = 0, transparent = false } = {}) {
  return new THREE.ShaderMaterial({
    transparent,
    depthWrite: !transparent,
    uniforms: { map: { value: map }, uFres: { value: 1 }, uChaos: { value: 0 }, uEdge: { value: edge } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float uFres; uniform float uChaos; uniform float uEdge;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        float f = pow(1.0 - max(dot(vN,vV),0.0), 3.0);
        c += vec3(0.05,0.12,0.3) * f * uFres;
        float l = dot(c, vec3(0.3,0.59,0.11));
        vec3 chaos = vec3(1.0,0.95,0.0) * pow(l, 0.8) * 1.6;
        c = mix(c, chaos, uChaos);
        float a = 1.0;
        if (uEdge > 0.0) {
          a = smoothstep(0.0, uEdge, vUv.x) * smoothstep(0.0, uEdge, 1.0 - vUv.x) * smoothstep(0.0, uEdge, vUv.y) * smoothstep(0.0, uEdge, 1.0 - vUv.y);
        }
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// portion de sphère couvrant une boîte lat/lon (même convention que ll())
export function patchGeometry(box, r, seg = 128) {
  const D = Math.PI / 180;
  return new THREE.SphereGeometry(r, seg, seg, (box.lon0 + 180) * D, (box.lon1 - box.lon0) * D, (90 - box.lat1) * D, (box.lat1 - box.lat0) * D);
}
