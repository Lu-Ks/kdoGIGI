import './style.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';

import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { TEXTS, PLACES, TIMELINE, HOLE_TEXT, MUSIC, PROGRAMME } from './config.js';

let runawayHB = null; // kick qui s'emballe à la fin de l'acte 3 et enchaîne sur le drop
let riserH = null; // montée de bruit, coupée pile au drop
import { AudioEngine } from './audio.js';
import { GiftScene } from './gift.js';
import { GlobeScene, disposeScene } from './globe.js';
import { buildMapTexturesAsync } from './map.js';
import { RevealScene } from './reveal.js';
import { wait, tween, params, bearing, ll, isMobile, PR } from './util.js';

const $ = (s) => document.querySelector(s);
const START_ACT = parseInt(params.get('act') || '0', 10);

// ================================================================ rendu
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(PR);
// perte / restauration du contexte WebGL (mémoire graphique saturée sur iPhone)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.warn('[surprise] contexte WebGL perdu');
});
canvas.addEventListener('webglcontextrestored', () => {
  console.warn('[surprise] contexte WebGL restauré');
  try {
    globe?.rebuildMaps?.();
    reveal?.rebuildTickets?.();
  } catch (e) {
    window.__err?.('restauration : ' + e.message);
  }
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0.5);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

let W = 1, H = 1;
let current = null;
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  const pr = PR;
  bloomPass.resolution.set((W * pr) / 2, (H * pr) / 2);
  current && current.resize(W, H);
}
addEventListener('resize', resize);

function setScene(s) {
  current = s;
  renderPass.scene = s.scene;
  renderPass.camera = s.camera;
  s.resize(W, H);
}

const audio = new AudioEngine();
const gift = new GiftScene(renderer);
let globe, reveal;
setScene(gift);
resize();

// ================================================================ étiquettes de villes
const labels = [];
const LABEL_SIDE = { toulouse: 'right', bruxelles: 'down', malines: 'right', anvers: 'up' }; // les autres : au-dessus du repère
const LABEL_DEFAULT = 'up';
function addLabel(key, text) {
  const el = document.createElement('div');
  el.className = 'lbl ' + (LABEL_SIDE[key] || LABEL_DEFAULT);
  el.innerHTML = `<i></i><span>${text}</span>`;
  $('#labels').appendChild(el);
  const p = PLACES[key];
  const l = { el, pos: ll(p.lat, p.lon, LABEL_SIDE[key] ? 1.001 : 1.0016), on: false };
  labels.push(l);
  return l;
}
const lbl = {};
const showLabel = (k, on = true) => {
  lbl[k].on = on;
  gsap.to(lbl[k].el, { opacity: on ? 1 : 0, duration: 0.8 });
};
const tmpV = new THREE.Vector3();
function updateLabels() {
  const cam = current.camera;
  for (const l of labels) {
    if (!l.on) continue;
    tmpV.copy(l.pos).project(cam);
    const facing = l.pos.clone().normalize().dot(cam.position.clone().sub(l.pos)) > 0;
    const vis = facing && tmpV.z < 1 && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
    l.el.style.visibility = vis ? 'visible' : 'hidden';
    l.el.style.transform = `translate(${((tmpV.x + 1) / 2) * W}px, ${((1 - tmpV.y) / 2) * H}px)`;
  }
}

// ================================================================ boucle
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  current.update(dt, t);
  bloomPass.strength = current.bloom.strength;
  bloomPass.radius = current.bloom.radius;
  bloomPass.threshold = current.bloom.threshold;
  composer.render();
  if (current === globe) updateLabels();
});

// ================================================================ helpers UI
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : Array.from(s));

async function story(text, { hold = 2.2, cls = '' } = {}) {
  const el = $('#story');
  el.className = cls;
  el.innerHTML = '';
  // découpe en mots pour éviter les coupures au milieu d'un mot
  for (const word of text.split(/(\s+)/)) {
    if (/^\s+$/.test(word)) {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const w = document.createElement('span');
    w.style.whiteSpace = 'nowrap';
    w.style.display = 'inline-block';
    for (const g of graphemes(word)) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = g;
      w.appendChild(s);
    }
    el.appendChild(w);
  }
  const chars = el.querySelectorAll('.ch');
  gsap.set(el, { opacity: 1 });
  await tween(chars, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.9, stagger: 0.035, ease: 'power2.out' });
  await wait(hold);
  await tween(el, { opacity: 0, duration: 0.8, ease: 'power1.in' });
}

// texte qui « bugue » d'une phrase vers une autre
async function scramble(el, from, to, dur = 1.2) {
  const chars = '!<>-_/[]{}=+*^?#$%&01';
  const n = Math.max(from.length, to.length);
  const steps = Math.round(dur * 30);
  for (let k = 0; k <= steps; k++) {
    const p = k / steps;
    let out = '';
    for (let i = 0; i < n; i++) {
      const settled = i / n < p * 1.2 - 0.2;
      out += settled ? to[i] || '' : Math.random() < 0.5 ? from[i] || '' : chars[(Math.random() * chars.length) | 0];
    }
    el.textContent = out;
    if (k % 3 === 0) audio.ding(200 + Math.random() * 1600);
    await new Promise((r) => setTimeout(r, 33));
  }
  el.textContent = to;
}

// ---------------------------------------------------------------- programme du jour (panneau du bas)
const placeName = (k) => (PLACES[k]?.label || '').toLowerCase().replace(/(^|[\s'’-])\S/g, (m) => m.toUpperCase());
const agenda = {
  el: null,
  n: 0,
  total: 0,
  open(d) {
    const el = (this.el = $('#agenda'));
    this.n = 0;
    this.total = d.items.length;
    el.innerHTML = `
      <div class="ag-head"><b>${d.day}</b><span class="ag-pill">${d.title}</span></div>
      <div class="ag-prog">${d.items.map(() => '<i></i>').join('')}</div>
      <ol></ol>`;
    audio.ding(660);
    gsap.fromTo(el, { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', overwrite: true });
  },
  step(it) {
    const ol = this.el.querySelector('ol');
    ol.querySelectorAll('li.on').forEach((li) => (li.classList.remove('on'), li.classList.add('done')));
    // on garde la liste compacte : 3 étapes passées max
    const done = [...ol.querySelectorAll('li.done')];
    if (done.length > 3) gsap.to(done[0], { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, duration: 0.4, onComplete: () => done[0].remove() });
    const seg = this.el.querySelectorAll('.ag-prog i')[this.n++];
    seg && seg.classList.add('on');
    const li = document.createElement('li');
    li.className = 'on' + (it.big ? ' big' : '');
    let sub = it.place && PLACES[it.place]?.label ? placeName(it.place) : '';
    if (sub && it.what.toLowerCase().includes(sub.toLowerCase())) sub = ''; // pas de redite
    li.innerHTML = `<i></i><div><small>${it.when}</small><span>${it.what}</span>${it.stars ? `<em>${'★'.repeat(it.stars)}</em>` : ''}${sub ? `<u>${sub}</u>` : ''}</div>`;
    ol.appendChild(li);
    gsap.fromTo(li, { opacity: 0, y: 14, height: 0 }, { opacity: 1, y: 0, height: 'auto', duration: 0.55, ease: 'power3.out' });
    audio.ding(880 + this.n * 60);
    return li;
  },
  async close() {
    this.el.querySelectorAll('li.on').forEach((li) => (li.classList.remove('on'), li.classList.add('done')));
    await wait(0.8);
    await tween(this.el, { opacity: 0, y: 30, duration: 0.6 });
  },
};

// une activité : la ligne s'ajoute au programme, la caméra file sur le lieu, un repère lumineux sort de la carte
const pins = [];
let lastPinLabel = null;
async function visit(g, it, { hold = 2.4, alt = 0.007 } = {}) {
  agenda.step(it);
  if (!it.place) return wait(hold);
  const p = PLACES[it.place];
  pins.forEach((x) => x.done());
  if (lastPinLabel) showLabel(lastPinLabel, false);
  gsap.to(g.view, { lat: p.lat - 0.012, lon: p.lon, alt: it.big ? alt * 1.3 : alt, tilt: 1.0, heading: '+=0.35', duration: 1.6, ease: 'power2.inOut' });
  await wait(1.1);
  if (it.place === 'atomium') g.rise(g.atomium);
  else if (it.place === 'grotemarkt' || it.place === 'resto') g.cathedral.visible || g.rise(g.cathedral);
  else if (it.place === 'diamants') g.rise(g.diamond, 2);
  pins.push(g.addPin(p.lat, p.lon, it.big));
  if (lbl[it.place]) showLabel(it.place), (lastPinLabel = it.place);
  if (it.big) g.pulseMarker(it.place);
  gsap.to(g.view, { heading: '+=0.25', duration: hold + 0.5, ease: 'sine.inOut' });
  await wait(hold * (it.big ? 1.5 : 1));
}

// carte "hôtel" en bas de l'écran
async function hotelCard(h, hold = 3.4) {
  const el = $('#hotel');
  el.innerHTML = `<small>${h.kicker}</small><b>${h.name}</b>${h.stars ? `<em>${'★'.repeat(h.stars)}</em>` : ''}<span>${h.info}</span>`;
  audio.ding(740);
  gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'back.out(1.6)' });
  await wait(hold);
  await tween(el, { opacity: 0, y: 12, duration: 0.6 });
}

async function card(d, { hold = 2.6, belge = false } = {}) {
  const el = $('#card');
  el.classList.toggle('belge', belge);
  el.querySelector('.card-day').textContent = d.day;
  el.querySelector('.card-date').textContent = d.date;
  el.querySelector('.card-line').textContent = d.line;
  audio.ding(belge ? 784 : 660);
  gsap.fromTo(el, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out' });
  await wait(hold);
  await tween(el, { opacity: 0, y: 10, duration: 0.7 });
}

function flash(color = '#fff', peak = 1, dur = 0.6) {
  const f = $('#flash');
  f.style.background = color;
  gsap.fromTo(f, { opacity: peak }, { opacity: 0, duration: dur, ease: 'power2.out' });
}
const fade = (o, d = 1) => tween('#fade', { opacity: o, duration: d, overwrite: true });

// bulles d'activités qui surgissent au-dessus de la carte
const BUBBLE_SLOTS = [[28, 31], [70, 39], [28, 63], [70, 71], [50, 80]];
async function bubbles(list, life = 3.2) {
  const box = $('#bubbles');
  list.forEach((txt, i) => {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = `<i></i><span>${txt}</span>`;
    const [x, y] = BUBBLE_SLOTS[i % BUBBLE_SLOTS.length];
    Object.assign(el.style, { left: x + '%', top: y + '%' });
    box.appendChild(el);
    const d = i * 0.6;
    gsap.fromTo(el, { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, delay: d, ease: 'back.out(2.2)' });
    gsap.to(el, { y: -22, duration: life, delay: d, ease: 'none' });
    gsap.to(el, { opacity: 0, scale: 0.85, duration: 0.5, delay: d + life - 0.5, onComplete: () => el.remove() });
    gsap.delayedCall(d, () => audio.ding(990 + i * 110));
  });
  await wait(list.length * 0.6 + 0.6);
}

// ================================================================ chargement
// affiche les erreurs à l'écran (utile pour déboguer sur iPhone)
function showError(e) {
  const h = $('#hint');
  h.classList.remove('pulse');
  h.style.opacity = 1;
  h.style.color = '#ff8080';
  h.textContent = 'Erreur : ' + (e && (e.message || e.reason?.message || e.reason) || e);
}
addEventListener('error', (e) => showError(e.error || e.message));
addEventListener('unhandledrejection', (e) => showError(e.reason));

// --- barre de chargement
const loaderBar = $('#loader i');
const loaderPct = $('#loader span');
let shown = 0;
function progress(p) {
  p = Math.max(shown, Math.min(1, p));
  shown = p;
  loaderBar.style.transform = `scaleX(${p})`;
  loaderPct.textContent = Math.round(p * 100) + ' %';
}
// laisse respirer le navigateur (rAF peut être en pause si l'onglet est caché : on ne l'attend pas plus de 60 ms)
const frame = () => new Promise((r) => {
  const done = () => r();
  requestAnimationFrame(() => setTimeout(done, 0));
  setTimeout(done, 60);
});
// une attente qui ne peut jamais bloquer le chargement
const soft = (p, ms = 2500) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

// télécharge avec suivi de progression
async function fetchProgress(url, onP, guess) {
  const res = await fetch(url);
  const total = +res.headers.get('content-length') || guess;
  if (!res.body || !res.body.getReader) return res.text();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onP(Math.min(1, got / total));
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) all.set(c, o), (o += c.length);
  return new TextDecoder().decode(all);
}

const loading = (async () => {
  const t0 = performance.now();
  progress(0.02);
  // 1. téléchargements (0 → 45 %)
  const [geoText, svg] = await Promise.all([
    fetchProgress('geo/geo.json', (p) => progress(0.02 + p * 0.43), 3000000),
    fetch('logo.svg').then((r) => r.text()),
    audio.preloadTrack(),
  ]);
  const geo = JSON.parse(geoText);
  progress(0.45);
  await frame();
  // 2. dessin de la carte (45 → 75 %)
  const tx = await buildMapTexturesAsync(geo, renderer, (p) => progress(0.45 + p * 0.3));
  await frame();
  // 3. scènes 3D (75 → 90 %)
  globe = new GlobeScene(renderer, geo, tx);
  for (const k of Object.keys(PLACES)) if (PLACES[k].label) lbl[k] = addLabel(k, PLACES[k].label);
  progress(0.82);
  await frame();
  reveal = new RevealScene(renderer);
  reveal.buildLogo(svg);
  progress(0.87);
  await soft(document.fonts.load('64px "Archivo Black"'));
  await soft(document.fonts.load('26px "Space Mono"'));
  const img = new Image();
  const imgReady = new Promise((r) => ((img.onload = r), (img.onerror = r)));
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await soft(imgReady);
  reveal.buildTickets(img);
  progress(0.9);
  await frame();
  // 4. pré-compilation des shaders pour éviter les saccades (90 → 100 %)
  for (const s of [globe, reveal]) {
    s.resize(W, H);
    renderer.compile(s.scene, s.camera);
    progress(shown + 0.05);
    await frame();
  }
  progress(1);
  console.log(`[surprise] chargé en ${Math.round(performance.now() - t0)} ms`);
})();

// bouton mute
const muteBtn = $('#mute');
muteBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  const m = !audio.muted;
  audio.setMuted(m);
  muteBtn.classList.toggle('off', m);
});

// curseur de volume (PC uniquement : masqué sur écran tactile)
const vol = document.createElement('input');
Object.assign(vol, { type: 'range', min: 0, max: 100, id: 'vol', ariaLabel: 'Volume' });
try {
  vol.value = localStorage.getItem('surprise-vol') ?? 100;
} catch {
  vol.value = 100;
}
audio.setVolume(vol.value / 100);
document.body.appendChild(vol);
for (const ev of ['pointerdown', 'pointerup', 'click']) vol.addEventListener(ev, (e) => e.stopPropagation());
vol.addEventListener('input', () => {
  audio.setVolume(vol.value / 100);
  if (audio.muted && vol.value > 0) (audio.setMuted(false), muteBtn.classList.remove('off'));
  try {
    localStorage.setItem('surprise-vol', vol.value);
  } catch {}
});

// ================================================================ ACTE 0 — cadeau
async function act0() {
  const hint = $('#hint');
  gift.waiting = true;
  fade(0, 2);
  gsap.to('#loader', { opacity: 1, duration: 0.6 });
  await loading;
  await tween('#loader', { opacity: 0, duration: 0.4, overwrite: true });
  gift.waiting = false;
  hint.textContent = TEXTS.giftHint;
  hint.classList.add('pulse');
  if (!params.has('auto')) await new Promise((res) => addEventListener('pointerdown', res, { once: true }));
  unlock();
  hint.classList.remove('pulse');
  gsap.killTweensOf(hint);
  gsap.to(hint, { opacity: 0, duration: 0.4 });
  if (START_ACT > 0) return void (await fade(1, 0.3));
  await gift.open(audio);
  flash('#fff4e0', 1, 1.5);
  await fade(1, 0.8);
}

function unlock() {
  audio.unlock();
  gsap.to('#mute, #vol', { opacity: 1, duration: 1, delay: 1 });
  try {
    navigator.wakeLock?.request('screen').catch(() => {});
  } catch {}
}

// ================================================================ ACTE 1 — sobre & mystérieux
let pad;
async function act1() {
  pad = audio.pad(); // l'intrigue, de plus en plus forte au fil du voyage
  pad.fade(0.4, 4);
  pad.intensity(0.05, 1);
  await wait(1.2);
  const lines = TEXTS.intro;
  for (let i = 0; i < lines.length; i++) {
    const last = i === lines.length - 1;
    pad.intensity(0.05 + (i / lines.length) * 0.12, 3);
    if (last) audio.whoosh(3, 0.35, 120, 1500);
    await story(lines[i], { hold: last ? 0.8 : 2.2, cls: lines[i].startsWith('…') ? 'italic' : '' });
  }
}

// ================================================================ ACTE 2 — le voyage
async function act2() {
  if (!pad) {
    pad = audio.pad();
    pad.fade(0.4, 2);
  }
  const g = globe;
  setScene(g);
  const T = PLACES.toulouse, B = PLACES.bruxelles, A = PLACES.anvers;
  Object.assign(g.view, { lat: 18, lon: -38, alt: 3.6, tilt: 0, heading: 0 });
  g.camMode = 'view';
  fade(0, 2.5);
  pad.intensity(0.2, 6); // le voyage commence

  // --- approche de Toulouse
  const headTB = bearing(T, B);
  gsap.to(g.view, { lon: -20, duration: 3, ease: 'none' });
  await wait(2.2);
  gsap.killTweensOf(g.view);
  const approach = { lat: T.lat, lon: T.lon, alt: 0.05, tilt: 1.0, heading: headTB };
  gsap.to(g.view, { lat: approach.lat, lon: approach.lon, duration: 6, ease: 'power2.inOut' });
  gsap.to(g.view, { alt: approach.alt, duration: 6, ease: 'power3.inOut' });
  gsap.to(g.view, { tilt: approach.tilt, heading: approach.heading, duration: 4, delay: 2, ease: 'power2.inOut' });
  await wait(4.5);
  showLabel('toulouse');
  g.pulseMarker('toulouse');
  await wait(1.5);
  const V = PROGRAMME.vendredi;
  agenda.open(V);
  await wait(0.8);
  agenda.step(V.items[0]); // le vol
  await wait(1.2);
  pad.intensity(0.3, 8); // décollage

  // --- le vol
  const c = GlobeScene.chaseFromView(approach.alt, approach.tilt);
  const pr = { t: 0 };
  const PSCALE = 0.0016;
  g.plane.visible = true;
  g.camMode = 'fn';
  g.camFn = () => {
    const st = g.placeVehicle(g.plane, g.routes.flyOut, pr.t, PSCALE);
    g.routes.flyOut.setProgress(pr.t);
    g.chaseCam(st, c);
  };
  const end = { alt: 0.03, tilt: 0.95 };
  const cEnd = GlobeScene.chaseFromView(end.alt, end.tilt);
  audio.whoosh(11, 0.28, 120, 700);
  const fl = gsap.timeline();
  fl.to(pr, { t: 1, duration: 11, ease: 'power1.inOut' }, 0);
  fl.to(c, { back: 0.011, height: 0.0035, ahead: 0.012, duration: 2.5, ease: 'power2.inOut' }, 0);
  fl.to(c, { side: 0.007, back: 0.003, height: 0.0015, ahead: 0.0015, duration: 2.5, ease: 'power2.inOut' }, 3.5);
  fl.call(() => showLabel('toulouse', false), null, 3);
  fl.to(c, { side: -0.003, back: 0.011, height: 0.004, ahead: 0.006, duration: 2, ease: 'power2.inOut' }, 6.2);
  fl.to(c, { ...cEnd, duration: 2.6, ease: 'power2.inOut' }, 8.4);
  fl.call(() => showLabel('bruxelles'), null, 8.5);
  await fl;
  // raccord vue
  const stEnd = g._along(g.routes.flyOut, 1);
  Object.assign(g.view, { lat: B.lat, lon: B.lon, alt: end.alt, tilt: end.tilt, heading: g.headingOf(stEnd.pos, stEnd.fwd) });
  g.camMode = 'view';
  g.pulseMarker('bruxelles');
  gsap.to(g.plane.scale, { x: 0, y: 0, z: 0, duration: 0.8, onComplete: () => (g.plane.visible = false) });

  // --- vendredi soir : l'appart près de l'aéroport
  gsap.to(g.view, { heading: '+=0.7', alt: 0.045, duration: 5, ease: 'sine.inOut' });
  agenda.step(V.items[1]);
  await wait(2.6);
  await agenda.close();

  // --- samedi : la Belgique s'illumine, puis le programme de la journée
  pad.intensity(0.45, 5); // la Belgique
  showLabel('bruxelles', false);
  gsap.to(g.view, { lat: 50.86, lon: 4.38, alt: 0.11, tilt: 0.55, heading: 0.15, duration: 3, ease: 'power2.inOut' });
  await wait(1.2);
  gsap.to(g.beOutlineMat, { opacity: 1, duration: 1.5 });
  gsap.to(g.beFillMat.uniforms.uOpacity, { value: 0.55, duration: 2 });
  const S = PROGRAMME.samedi;
  agenda.open(S);
  await wait(1.6);
  gsap.to(g.beFillMat.uniforms.uOpacity, { value: 0.14, duration: 3 });
  for (const it of S.items) {
    if (it.train) {
      agenda.step(it);
      if (lastPinLabel) showLabel(lastPinLabel, false);
      await trainToAntwerp(g);
      pad.intensity(0.6, 6);
    } else await visit(g, it);
  }
  await agenda.close();

  // --- dimanche
  pad.intensity(0.7, 5);
  const D = PROGRAMME.dimanche;
  for (const m of [g.cathedral, g.diamond]) gsap.to(m.scale, { x: 0.00001, y: 0.00001, z: 0.00001, duration: 1, onComplete: () => (m.visible = false) });
  agenda.open(D);
  await wait(1.2);
  for (const it of D.items) await visit(g, it);
  await agenda.close();

  // --- lundi
  pad.intensity(0.78, 5);
  const L = PROGRAMME.lundi;
  agenda.open(L);
  await wait(1.2);
  for (const it of L.items) {
    if (it.home) {
      agenda.step(it);
      if (lastPinLabel) showLabel(lastPinLabel, false);
      await flyHome(g);
    } else if (it.place) await visit(g, it);
    else {
      agenda.step(it);
      await wait(2.2);
    }
  }
  await agenda.close();
  pins.forEach((x) => x.remove());
}

// samedi après-midi : le train Bruxelles -> Anvers (caméra en poursuite)
async function trainToAntwerp(g) {
  const B = PLACES.bruxelles, A = PLACES.anvers, M = PLACES.malines;
  const tView = { lat: B.lat, lon: B.lon, alt: 0.014, tilt: 1.0, heading: bearing(B, M) };
  await tween(g.view, { ...tView, duration: 2, ease: 'power2.inOut' });
  const ct = GlobeScene.chaseFromView(tView.alt, tView.tilt);
  const tr = { t: 0 };
  const TSCALE = 0.00055;
  g.train.visible = true;
  g.train.scale.setScalar(TSCALE);
  g.camMode = 'fn';
  g.camFn = () => {
    const st = g.placeVehicle(g.train, g.routes.trainOut, tr.t, TSCALE, 0.0001);
    g.routes.trainOut.setProgress(tr.t);
    g.chaseCam(st, ct);
  };
  const aEnd = { alt: 0.016, tilt: 1.05 };
  const tl2 = gsap.timeline();
  audio.whoosh(7, 0.18, 300, 1200);
  tl2.to(tr, { t: 1, duration: 7, ease: 'power1.inOut' }, 0);
  tl2.to(ct, { back: 0.004, height: 0.0018, side: 0.0015, ahead: 0.003, duration: 2, ease: 'power2.inOut' }, 0);
  tl2.to(ct, { ...GlobeScene.chaseFromView(aEnd.alt, aEnd.tilt), duration: 2.2, ease: 'power2.inOut' }, 4.8);
  tl2.call(() => showLabel('anvers'), null, 5);
  await tl2;
  const stA = g._along(g.routes.trainOut, 1);
  Object.assign(g.view, { lat: A.lat, lon: A.lon, alt: aEnd.alt, tilt: aEnd.tilt, heading: g.headingOf(stA.pos, stA.fwd) });
  g.camMode = 'view';
  g.pulseMarker('anvers');
  gsap.to(g.train.scale, { x: 0, y: 0, z: 0, duration: 0.6, onComplete: () => (g.train.visible = false) });
  await wait(0.6);
  showLabel('anvers', false);
}

// lundi : train retour puis avion jusqu'à Toulouse
async function flyHome(g) {
  const A = PLACES.anvers, B = PLACES.bruxelles;
  gsap.to(g.view, { lat: (A.lat + B.lat) / 2, lon: B.lon, alt: 0.045, tilt: 0.6, duration: 2.5, ease: 'power2.inOut' });
  await tween(g.routes.trainBack, { progress: 1, duration: 2.5, ease: 'power1.inOut', onUpdate() { g.routes.trainBack.setProgress(g.routes.trainBack.progress); } });
  const pb = { t: 0 };
  const PB = 0.0034;
  g.plane.visible = true;
  g.plane.scale.setScalar(PB);
  const flyBack = gsap.timeline();
  audio.whoosh(7, 0.22, 120, 600);
  flyBack.to(pb, {
    t: 1,
    duration: 7,
    ease: 'power1.inOut',
    onUpdate: () => {
      g.placeVehicle(g.plane, g.routes.flyBack, pb.t, PB);
      g.routes.flyBack.setProgress(pb.t);
    },
  }, 0);
  flyBack.to(g.view, { lat: 47, lon: 2.9, alt: 0.3, tilt: 0.35, heading: 0, duration: 6.5, ease: 'power2.inOut' }, 0);
  flyBack.call(() => showLabel('toulouse'), null, 5.5);
  await flyBack;
  g.pulseMarker('toulouse');
  gsap.to(g.plane.scale, { x: 0, y: 0, z: 0, duration: 0.6, onComplete: () => (g.plane.visible = false) });
}

// ================================================================ ACTE 3 — dézoom + timeline + le trou
async function act3() {
  const g = globe;
  if (current !== g) {
    // (mode debug : on arrive directement ici)
    setScene(g);
    if (!pad) (pad = audio.pad()), pad.intensity(0.85, 1);
    Object.values(g.routes).forEach((r) => r.setProgress(1));
    g.beOutlineMat.opacity = 1;
    g.beFillMat.uniforms.uOpacity.value = 0.25;
    for (const m of [g.atomium, g.cathedral, g.diamond]) (m.visible = true), m.scale.setScalar(m.userData.baseScale);
    Object.assign(g.view, { lat: 47, lon: 2.9, alt: 0.3, tilt: 0.35, heading: 0 });
    g.camMode = 'view';
    fade(0, 1);
  }
  const portrait = W / H < 0.8;
  // dézoom : tout le voyage d'un coup
  pad?.intensity(0.85, 4);
  ['toulouse', 'bruxelles', 'anvers'].forEach((k) => showLabel(k));
  await tween(g.view, { lat: portrait ? 43.2 : 46.6, lon: 2.9, alt: portrait ? 0.5 : 0.3, tilt: 0.12, heading: 0, duration: 3, ease: 'power2.inOut' });

  // construction du récap (un jour par ligne)
  const list = $('#recap');
  list.innerHTML = '';
  let hole;
  const items = [];
  for (const d of TIMELINE) {
    const row = document.createElement('div');
    row.className = 'rc-row';
    row.innerHTML = `<div class="rc-day"><span>${d.day}</span><b>${d.num}</b></div><div class="rc-items"></div>`;
    const box = row.querySelector('.rc-items');
    for (const it of d.items) {
      const el = document.createElement('div');
      el.className = 'rc-item';
      if (it) el.innerHTML = `<i></i><span>${it}</span>`;
      else {
        // le leurre : il a l'air d'une ligne comme les autres
        el.innerHTML = `<i></i><span>${HOLE_TEXT.decoy}</span>`;
        hole = el;
      }
      box.appendChild(el);
      items.push(el);
    }
    list.appendChild(row);
  }
  gsap.set(list, { opacity: 1 });
  const rows = [...list.querySelectorAll('.rc-row')];
  for (const row of rows) {
    gsap.fromTo(row.querySelector('.rc-day'), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });
    for (const el of row.querySelectorAll('.rc-item:not(.hole)')) {
      gsap.fromTo(el, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' });
      audio.ding(880 + Math.random() * 200);
      await wait(0.42);
    }
  }
  void items;
  await wait(0.6);
  // le temps de bien lire tout le programme
  await wait(4);
  ['toulouse', 'bruxelles', 'anvers'].forEach((k) => showLabel(k, false));
  await story(TEXTS.manque[0], { hold: 1.4, cls: 'italic top' });

  // on assombrit tout sauf le samedi soir… qui se met à glitcher
  pad?.intensity(1, 3);
  hole.closest('.rc-row').classList.add('has-hole');
  list.classList.add('focus');
  gsap.to('#fade', { opacity: 0.72, duration: 1.2 });
  await wait(1.2);
  // la ligne du samedi soir bugue… et se réécrit
  // la ligne du samedi soir s'allume et se met à glitcher (l'intitulé ne change pas)
  hole.classList.add('hole', 'lit', 'glitch');
  hole.innerHTML = `<small>${HOLE_TEXT.label}</small><span>${HOLE_TEXT.decoy}</span>`;
  gsap.fromTo(hole, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: 'power3.out' });
  audio.impact(0.5);
  await wait(1.8);
  await story(TEXTS.manque[1], { hold: 1.2, cls: 'italic top' });
  // silence
  pad.stop(0.05);
  await wait(0.5);
  await story(TEXTS.manque[2], { hold: 0.8, cls: 'red top' });

  // --- l'action : elle tape n'importe où. Chaque tap = un kick ; plus elle tape vite, plus l'énergie monte.
  //     Énergie pleine (= elle spamme) -> ça s'emballe -> drop.
  const T = PLACES.thunderdome;
  const v0 = { ...g.view };
  const tap = document.createElement('div');
  tap.className = 'tap-call';
  tap.innerHTML = `<div class="tcl-label"></div><div class="tcl-bar"><i></i></div>`;
  $('#ui').appendChild(tap);
  const label = tap.querySelector('.tcl-label');
  const bar = tap.querySelector('.tcl-bar i');
  let level = -1;
  const setLabel = (i) => {
    if (i === level) return;
    level = i;
    label.textContent = TEXTS.tapHints[i];
    tap.classList.toggle('hot', i >= 2);
  };
  gsap.to('#fade', { opacity: 0.35, duration: 0.8 });
  setLabel(0);
  gsap.fromTo(tap, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' });
  tap.classList.add('idle');

  let energy = 0, taps = 0, done = false;
  const GAIN = 0.12, DECAY = 0.16; // énergie ajoutée par tap / perdue par seconde
  let lastT = 0;
  await new Promise((resolve) => {
    const onTap = () => {
      if (done) return;
      const now = performance.now();
      if (now - lastT < 50) return; // même tap reçu deux fois
      lastT = now;
      taps++;
      tap.classList.remove('idle');
      energy = Math.min(1, energy + GAIN);
      const hard = energy > 0.55;
      audio.kick(audio.now + 0.005, hard, 0.8 + energy * 0.5);
      gsap.fromTo(label, { scale: 1.25 + energy * 0.3 }, { scale: 1, duration: 0.3, ease: 'power3.out' });
      gsap.fromTo(hole, { scale: 1.1 + energy * 0.15 }, { scale: 1, duration: 0.3, ease: 'power2.out' });
      flash('#fff200', 0.05 + energy * 0.15, 0.25);
      g.shake = 0.4 + energy * 1.2;
      if (energy >= 1) {
        done = true;
        removeEventListener('pointerdown', onTap);
        resolve();
      }
    };
    addEventListener('pointerdown', onTap);
    if (params.has('auto')) {
      let k = 0;
      const id = setInterval(() => (k++ > 40 ? clearInterval(id) : onTap()), 180);
    }
    // boucle : décroissance de l'énergie + effets continus
    let last = performance.now();
    const loop = () => {
      if (done) return;
      const now = performance.now(), dt = (now - last) / 1000;
      last = now;
      energy = Math.max(0, energy - DECAY * dt);
      g.shake = Math.max(energy * 0.6, g.shake - dt * 3);
      g.chaos = energy * 0.6;
      g.view.lat = v0.lat + (T.lat - v0.lat) * energy * 0.6;
      g.view.lon = v0.lon + (T.lon - v0.lon) * energy * 0.6;
      g.view.alt = v0.alt * (1 - energy * 0.55);
      bar.style.transform = `scaleX(${energy})`;
      // 0 tap : « Appuie » ; 1-3 taps : « Encore » ; dès le 4e : « Plus vite » (puis « PLUS VITE !! » si elle spamme)
      setLabel(taps === 0 ? 0 : taps < 4 ? 1 : energy < 0.65 ? 2 : 3);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  label.textContent = '';
  gsap.to(tap, { opacity: 0, scale: 1.6, duration: 0.4, onComplete: () => tap.remove() });

  // ça s'emballe : la caméra fonce sur l'AFAS Dome
  gsap.to('#fade', { opacity: 0, duration: 0.8 });
  const A = PLACES.thunderdome;
  // le morceau démarre MAINTENANT (porte fermée, 4 mesures de montée avec roulement) : c'est lui qui fixe
  // l'instant exact du drop, et toute l'image se cale dessus
  runawayHB = audio.startMusic(() => {
    gsap.fromTo(hole, { scale: 1.15 }, { scale: 1, duration: 0.2, ease: 'power2.out' });
    flash('#fff200', 0.12, 0.2);
  }, 4);
  const dropAt = runawayHB.fullAt;
  const HB = Math.max(1, dropAt - audio.now - 0.9 - 0.6); // montée visuelle, puis plongée (0,9 s), puis 0,6 s de marge
  gsap.to(g.view, { lat: A.lat, lon: A.lon, alt: 0.03, tilt: 0.9, duration: HB + 0.9, ease: 'power3.in' });
  gsap.to(g, { shake: 2, duration: HB, ease: 'power2.in' });
  gsap.to(g, { chaos: 1, duration: HB * 0.7 });
  riserH = audio.riser(dropAt - audio.now, 0.45);
  await new Promise((r) => setTimeout(r, HB * 1000));

  // plongée dans le trou
  const r = hole.getBoundingClientRect();
  const portal = $('#portal');
  Object.assign(portal.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  hole.style.visibility = 'hidden';
  gsap.to('#recap', { opacity: 0, duration: 0.3 });
  ['toulouse', 'bruxelles', 'anvers'].forEach((k) => showLabel(k, false));
  const sc = (Math.max(W / r.width, H / r.height) * 2.2);
  const dx = W / 2 - (r.left + r.width / 2), dy = H / 2 - (r.top + r.height / 2);
  await tween(portal, { x: dx, y: dy, scale: sc, borderRadius: 0, duration: 0.9, ease: 'power4.in' });
  g.shake = 0;
}

// ================================================================ ACTE 4 — BIG REVEAL
async function act4() {
  const rv = reveal;
  setScene(rv);
  // la carte ne sert plus : on libère sa mémoire, mais APRÈS le drop (pour ne pas faire saccader le son)
  const oldGlobe = globe;
  globe = null;
  labels.forEach((l) => (l.on = false));
  setTimeout(() => {
    if (oldGlobe) disposeScene(oldGlobe.scene);
    disposeScene(gift.scene);
  }, 5000);
  $('#fade').style.opacity = 0;
  // le morceau tourne déjà (depuis la fin du spam) : on ouvre la "porte" sur le prochain temps fort
  const music = runawayHB || audio.startMusic(null, 1);
  const t0 = music.fullAt;
  riserH?.stopAt(t0);
  const untilDrop = () => Math.max(0, t0 - audio.now);
  const ui = $('#reveal');
  ui.querySelector('.rv-date').textContent = TEXTS.reveal.date;
  ui.querySelector('.rv-places').textContent = TEXTS.reveal.places;
  ui.querySelector('.rv-nous').textContent = TEXTS.reveal.nous;
  const title = ui.querySelector('.rv-title');

  // à chaque temps : effets visuels du reveal (seulement une fois la porte ouverte)
  music.setOnBeat((i, full) => {
    if (!full) return;
    rv.beat(i);
    if (i % 2 === 0) {
      title.classList.add('glitch');
      setTimeout(() => title.classList.remove('glitch'), 90);
    }
    if (i % 8 === 0) flash('#fff200', 0.16, 0.25);
  });
  // le logo met 0,45 s à s'écraser : on le lance pour que l'impact tombe pile sur le 1er kick du drop
  await new Promise((r) => setTimeout(r, Math.max(0, untilDrop() - 0.45) * 1000));
  $('#portal').style.display = 'none';
  rv.slam();
  setTimeout(() => audio.impact(1.2), untilDrop() * 1000);
  setTimeout(() => flash('#ffffff', 1, 0.9), 450);

  await wait(0.9);
  gsap.fromTo(title, { opacity: 0, scale: 1.8, letterSpacing: '0.3em' }, { opacity: 1, scale: 1, letterSpacing: '-0.01em', duration: 0.5, ease: 'power4.in' });
  await wait(1.6);
  gsap.fromTo('.rv-date', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' });
  flash('#fff200', 0.35, 0.4);
  await wait(1.6);
  gsap.fromTo('.rv-places', { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
  flash('#fff200', 0.35, 0.4);
  await wait(2.4);

  // les billets
  await tween('.rv-title, .rv-date, .rv-places', { opacity: 0, y: 20, duration: 0.5, stagger: 0.05 });
  rv.showTickets();
  ui.style.paddingBottom = 'calc(env(safe-area-inset-bottom) + 5vh + 110px)';
  await wait(2.2);
  gsap.fromTo('.rv-nous', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 1, ease: 'elastic.out(1, 0.5)' });
  await wait(3);
  const end = $('#end');
  end.querySelector('.end-msg').textContent = TEXTS.fin;
  const btn = end.querySelector('.end-replay');
  btn.textContent = TEXTS.replay;
  btn.onclick = () => location.reload();
  gsap.to(end, { opacity: 1, duration: 2 });
}

// ================================================================ go
(async () => {
  await act0();
  if (START_ACT <= 1) await act1();
  if (START_ACT <= 2) await act2();
  if (START_ACT <= 3) await act3();
  await act4();
})();
