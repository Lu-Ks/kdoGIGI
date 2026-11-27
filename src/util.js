import * as THREE from 'three';
import gsap from 'gsap';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const D2R = Math.PI / 180;

export const params = new URLSearchParams(location.search);
export const SPEED = parseFloat(params.get('speed') || '1');
gsap.globalTimeline.timeScale(SPEED);

export const wait = (s) => new Promise((r) => setTimeout(r, (s * 1000) / SPEED));
export const tween = (target, vars) => new Promise((r) => gsap.to(target, { ...vars, onComplete: r }));

// lat/lon -> position sur la sphère (rayon r)
export function ll(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * D2R;
  const th = (lon + 180) * D2R;
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

// repère local (normale, est, nord) en un point de la sphère
export function frame(n) {
  const up = n.clone().normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
  const north = up.clone().cross(east);
  return { up, east, north };
}

// cap (radians, 0 = nord, sens horaire) de A vers B
export function bearing(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}

// texture radiale douce (halo)
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = inner.replace(/[\d.]+\)$/, '0)')) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.5)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const isMobile = matchMedia('(pointer: coarse)').matches;
// résolution de rendu (plus basse sur mobile pour ménager la mémoire graphique)
export const PR = Math.min(devicePixelRatio, isMobile ? 1.5 : 2);

// une seule texture d'environnement (reflets) partagée par toutes les scènes ; null si l'appareil ne la supporte pas
let _env;
export function getEnv(renderer) {
  if (_env !== undefined) return _env;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    _env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) {
    console.warn('environnement désactivé', e);
    _env = null;
  }
  return _env;
}

// envoie une texture canvas au GPU puis libère la mémoire du canvas (limite stricte sur iPhone)
export function uploadAndFree(renderer, tex) {
  try {
    renderer.initTexture(tex);
    const c = tex.image;
    if (c && 'width' in c) {
      c.width = 1;
      c.height = 1;
    }
  } catch (e) {
    console.warn(e);
  }
  return tex;
}
