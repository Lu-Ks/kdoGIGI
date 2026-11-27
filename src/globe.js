// ACTES 2 & 3 — globe nocturne, avion, train, touche belge, vue d'ensemble
import * as THREE from 'three';
import gsap from 'gsap';
import { ll, frame, glowTexture, D2R, getEnv, PR } from './util.js';
import { PLACES } from './config.js';
import { buildMapTextures, mapMaterial, patchGeometry, FINE, MID } from './map.js';

const P = PLACES;

// ------------------------------------------------------------------ shaders points
const dotVert = `
  attribute float aSize; attribute float aPhase;
  uniform float uScale; uniform float uTime; uniform float uMax;
  varying float vTw;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.);
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, uMax);
    vTw = 0.7 + 0.3 * sin(uTime * (1.0 + aPhase) + aPhase * 30.0);
    gl_Position = projectionMatrix * mv;
  }`;
const dotFrag = `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTwinkle;
  varying float vTw;
  void main(){
    vec2 c = gl_PointCoord - .5; float d = length(c);
    if(d > .5) discard;
    float a = smoothstep(.5, .15, d);
    float tw = mix(1.0, vTw, uTwinkle);
    gl_FragColor = vec4(uColor * tw, a * uOpacity * tw);
  }`;

function pointsMaterial({ color, opacity = 1, twinkle = 0, max = 6, additive = false }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTwinkle: { value: twinkle },
      uScale: { value: 500 },
      uTime: { value: 0 },
      uMax: { value: max },
    },
    vertexShader: dotVert,
    fragmentShader: dotFrag,
  });
}

// ------------------------------------------------------------------ routes
class Route {
  constructor(points, radius, color, segments = 200) {
    this.curve = new THREE.CatmullRomCurve3(points);
    this.segments = segments;
    this.radial = 6;
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segments, radius, this.radial, false), this.mat);
    this.setProgress(0);
  }
  setProgress(p) {
    this.progress = p;
    this.mesh.geometry.setDrawRange(0, Math.floor(p * this.segments) * this.radial * 6);
  }
}

// arc grand cercle surélevé
function arcPoints(a, b, height, n = 120) {
  const A = ll(a.lat, a.lon).normalize(), B = ll(b.lat, b.lon).normalize();
  const om = Math.acos(A.dot(B));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = A.clone().multiplyScalar(Math.sin((1 - t) * om) / Math.sin(om)).add(B.clone().multiplyScalar(Math.sin(t * om) / Math.sin(om)));
    pts.push(v.normalize().multiplyScalar(1.0008 + height * Math.sin(Math.PI * t)));
  }
  return pts;
}
// trajet au sol lissé (courbe passant par chaque étape, sans angle)
function groundPoints(list, r = 1.0007, n = 160) {
  const ctrl = list.map((p) => ll(p.lat, p.lon, r));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return curve.getSpacedPoints(n).map((v) => v.normalize().multiplyScalar(r));
}

// ------------------------------------------------------------------ objets 3D
function makePlane() {
  // avion de ligne stylisé : nez vers +Z, dessus vers +Y, longueur ~2
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xaeb5be, metalness: 0.2, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.5, roughness: 0.2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xfff200, metalness: 0.2, roughness: 0.35, emissive: 0x332f00, side: THREE.DoubleSide });

  // fuselage (profil tourné)
  const prof = [
    [0, -1.0], [0.03, -0.97], [0.06, -0.9], [0.085, -0.75], [0.11, -0.5], [0.12, -0.3], [0.12, 0.55],
    [0.115, 0.7], [0.1, 0.82], [0.075, 0.91], [0.045, 0.97], [0, 1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), white);
  fus.rotation.x = Math.PI / 2; // y -> z (nez à +Z)
  g.add(fus);
  // cockpit
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), dark);
  cock.scale.set(1.15, 0.6, 1.4);
  cock.position.set(0, 0.06, 0.86);
  cock.rotation.x = 0.35;
  g.add(cock);
  // hublots + liseré jaune Thunderdome
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 1.15), dark);
    w.position.set(s * 0.118, 0.04, 0.1);
    const y = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 1.4), yellow);
    y.position.set(s * 0.119, -0.012, 0.02);
    g.add(w, y);
  }

  // aile en flèche (forme dans le plan XZ)
  const wingShape = (span, rootLE, rootTE, tipLE, tipTE, s) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -rootLE);
    sh.lineTo(s * span, -tipLE);
    sh.lineTo(s * span, -tipTE);
    sh.lineTo(0, -rootTE);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2); // y(forme) -> -z ; on a mis -z dans la forme donc nez vers +Z
    return geo;
  };
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingShape(0.95, 0.28, -0.08, -0.22, -0.36, s), white);
    w.position.set(0, -0.06, 0);
    w.rotation.z = s * 0.06; // dièdre
    g.add(w);
    // winglet jaune
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.1), yellow);
    wl.position.set(s * 0.95, 0.0, -0.3);
    wl.rotation.z = s * -0.25;
    g.add(wl);
    // réacteur
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.26, 20, 1, true), grey);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 0.33, -0.13, 0.17);
    g.add(eng);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), dark);
    intake.position.set(s * 0.33, -0.13, 0.3);
    g.add(intake);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.16), grey);
    pylon.position.set(s * 0.33, -0.085, 0.14);
    g.add(pylon);
    // stabilisateur
    const st = new THREE.Mesh(wingShape(0.33, -0.66, -0.86, -0.86, -0.96, s), white);
    st.position.set(0, 0.03, 0);
    g.add(st);
  }
  // dérive (forme dans le plan YZ)
  const fin = new THREE.Shape();
  fin.moveTo(-0.6, 0.08);
  fin.lineTo(-0.88, 0.45);
  fin.lineTo(-0.98, 0.45);
  fin.lineTo(-0.97, 0.08);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.018, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2); // x(forme) -> z
  const finMesh = new THREE.Mesh(finGeo, yellow);
  finMesh.position.x = 0.009;
  g.add(finMesh);

  // feux de navigation
  const navMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), navMat(0xff2020));
  red.position.set(-0.95, -0.02, -0.25);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), navMat(0x20ff60));
  green.position.set(0.95, -0.02, -0.25);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), navMat(0xffffff));
  strobe.position.set(0, 0.13, -0.2);
  g.add(red, green, strobe);
  g.userData.strobe = strobe;
  // traînées de condensation
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  for (const s of [-1, 1]) {
    const tg = new THREE.ConeGeometry(0.025, 2.2, 8, 1, true);
    tg.rotateX(-Math.PI / 2);
    tg.translate(0, 0, -1.1);
    const tr = new THREE.Mesh(tg, trailMat);
    tr.position.set(s * 0.33, -0.13, 0.03);
    g.add(tr);
  }
  return g;
}

function makeTrain() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x6a5200, metalness: 0.3, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.9), mat);
    car.position.set(0, 0.1, -i * 0.95);
    g.add(car);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.05, 0.75), new THREE.MeshBasicMaterial({ color: 0xfff1c0, toneMapped: false }));
    win.position.set(0, 0.14, -i * 0.95);
    g.add(win);
  }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,1)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  head.scale.set(0.45, 0.45, 1);
  head.position.set(0, 0.1, 0.5);
  g.add(head);
  return g;
}

function makeAtomium() {
  const g = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 1, roughness: 0.28 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x7d8896, metalness: 1, roughness: 0.35 });
  // cube posé sur une pointe : diagonale principale verticale
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  const corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new THREE.Vector3(x, y, z).multiplyScalar(0.5).applyQuaternion(q));
  const center = new THREE.Vector3();
  const lift = new THREE.Vector3(0, 0.866 + 0.25, 0);
  const sGeo = new THREE.SphereGeometry(0.17, 24, 16);
  const nodes = [center, ...corners];
  nodes.forEach((p) => {
    const s = new THREE.Mesh(sGeo, chrome);
    s.position.copy(p).add(lift);
    g.add(s);
    // hublots lumineux
    const win = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.008, 6, 24), new THREE.MeshBasicMaterial({ color: 0x4f86b0 }));
    win.position.copy(s.position);
    win.rotation.x = Math.PI / 2;
    g.add(win);
  });
  const tube = (a, b, r = 0.035) => {
    const d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), tubeMat);
    m.position.copy(a).add(b).multiplyScalar(0.5).add(lift);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(m);
  };
  corners.forEach((c) => tube(center, c));
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (Math.abs(corners[i].distanceTo(corners[j]) - 1) < 0.01) tube(corners[i], corners[j]);
  // pieds
  const bottom = corners.reduce((a, b) => (b.y < a.y ? b : a));
  const foot = bottom.clone().add(lift);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const base = new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    tube(base.clone().sub(lift), foot.clone().sub(lift), 0.04);
  }
  return g;
}

function makeCathedral() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0x8a5a20, roughness: 0.8 });
  const prof = [
    [0.18, 0], [0.18, 0.9], [0.15, 0.95], [0.15, 1.35], [0.12, 1.4], [0.12, 1.75], [0.08, 1.8], [0.06, 2.2], [0.03, 2.5], [0.005, 2.75], [0, 2.8],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const spire = new THREE.Mesh(new THREE.LatheGeometry(prof, 8), stone);
  g.add(spire);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 1.1), stone);
  nave.position.set(0, 0.275, -0.7);
  g.add(nave);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.3, 0.25, 4), stone);
  roof.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  roof.scale.set(1, 4, 1);
  roof.position.set(0, 0.62, -0.7);
  g.add(roof);
  return g;
}

function makeDiamond() {
  const prof = [[0, -0.75], [0.62, 0.05], [0.5, 0.22], [0.28, 0.32], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, metalness: 1, roughness: 0.02, emissive: 0x2a4a66, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(190,235,255,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(1.6, 1.6, 1);
  const g = new THREE.Group();
  g.add(m, halo);
  g.userData.gem = m;
  return g;
}

// place un objet au sol (lat/lon), orienté avec la normale
function placeOn(obj, lat, lon, scale, alt = 0) {
  const n = ll(lat, lon).normalize();
  const f = frame(n);
  obj.position.copy(n).multiplyScalar(1.0006 + alt);
  const m = new THREE.Matrix4().makeBasis(f.east, f.up, f.north.clone().negate());
  obj.quaternion.setFromRotationMatrix(m);
  obj.scale.setScalar(scale);
  obj.userData.baseScale = scale;
}

// ==================================================================
export class GlobeScene {
  constructor(renderer, geo, prebuilt) {
    this.bloom = { strength: 0.9, radius: 0.5, threshold: 0.75 };
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x000000);
    scene.environment = getEnv(renderer);
    scene.environmentIntensity = 0.4;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.0004, 120);
    this.mats = [];

    scene.add(new THREE.AmbientLight(0x8899bb, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-3, 4, 5);
    scene.add(sun);
    this.sun = sun;

    // globe : carte nocturne (monde + Europe + zone HD Toulouse–Anvers)
    const tx = prebuilt || buildMapTextures(geo, renderer);
    this.mapMats = [mapMaterial(tx.world), mapMaterial(tx.mid, { edge: 0.06, transparent: true }), mapMaterial(tx.fine, { edge: 0.08, transparent: true })];
    // si le contexte WebGL est perdu puis restauré, on redessine les cartes (les canvas ont été libérés)
    this.rebuildMaps = () => {
      const t = buildMapTextures(geo, renderer);
      [t.world, t.mid, t.fine].forEach((x, i) => (this.mapMats[i].uniforms.map.value = x));
    };
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), this.mapMats[0]));
    const mid = new THREE.Mesh(patchGeometry(MID, 1.00005, 96), this.mapMats[1]);
    mid.renderOrder = 1;
    const fine = new THREE.Mesh(patchGeometry(FINE, 1.0001, 128), this.mapMats[2]);
    fine.renderOrder = 2;
    scene.add(mid, fine);
    this.chaos = 0;

    // atmosphère
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 0.72 + dot(vN, vV)), 4.0); gl_FragColor = vec4(vec3(0.25,0.5,1.0)*f, f); }`,
      })
    );
    scene.add(atmo);

    // lumières des villes
    {
      const d = geo.lights, n = d.length / 3;
      const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        ll(d[i * 3 + 1], d[i * 3], 1.0004, v).toArray(pos, i * 3);
        size[i] = 0.0006 + 0.0009 * Math.log10(1 + d[i * 3 + 2]);
        ph[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
      this.lightMat = pointsMaterial({ color: 0xffd28a, opacity: 0.9, twinkle: 1, max: 6, additive: true });
      this.mats.push(this.lightMat);
      scene.add(new THREE.Points(g, this.lightMat));
    }

    // Belgique : contour doré + remplissage drapeau (bandes verticales noir/jaune/rouge)
    {
      const ring = geo.belgium[0];
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(ll(ring[i + 1], ring[i], 1.0009));
      this.beOutlineMat = new THREE.LineBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, toneMapped: false });
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.beOutlineMat));

      const contour = [];
      for (let i = 0; i < ring.length - 2; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const pos = [], lon = [];
      for (const t of tris) for (const k of t) {
        const p = ll(contour[k].y, contour[k].x, 1.0012);
        pos.push(p.x, p.y, p.z);
        lon.push(contour[k].x);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aLon', new THREE.Float32BufferAttribute(lon, 1));
      this.beFillMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `attribute float aLon; varying float vLon; void main(){ vLon=aLon; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float uOpacity; uniform float uTime; varying float vLon;
          void main(){ float x = (vLon - 2.55) / (6.41 - 2.55);
            vec3 c = x < 0.333 ? vec3(0.02) : (x < 0.666 ? vec3(0.62,0.5,0.03) : vec3(0.6,0.06,0.09));
            float a = (x < 0.333 ? 0.85 : 0.45) * uOpacity * (0.85 + 0.15*sin(uTime*2.0 + vLon*3.0));
            gl_FragColor = vec4(c, a); }`,
      });
      scene.add(new THREE.Mesh(g, this.beFillMat));
    }

    // étoiles
    {
      const n = 2500, pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20);
        v.toArray(pos, i * 3);
        size[i] = 0.05 + Math.random() * 0.12;
        ph[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
      this.starMat = pointsMaterial({ color: 0xffffff, opacity: 0.9, twinkle: 1, max: 3, additive: true });
      this.mats.push(this.starMat);
      scene.add(new THREE.Points(g, this.starMat));
    }

    // routes
    this.routes = {
      flyOut: new Route(arcPoints(P.toulouse, P.bruxelles, 0.02), 0.00012, 0xfff200),
      trainOut: new Route(groundPoints([P.bruxelles, P.malines, P.anvers]), 0.00007, 0xffd400, 120),
      trainBack: new Route(groundPoints([P.anvers, P.malines, P.bruxelles], 1.0011), 0.00007, 0xff6a3d, 120),
      flyBack: new Route(arcPoints(P.bruxelles, P.toulouse, 0.012), 0.00012, 0xffffff),
    };
    Object.values(this.routes).forEach((r) => scene.add(r.mesh));

    // véhicules
    this.plane = makePlane();
    this.plane.visible = false;
    scene.add(this.plane);
    this.train = makeTrain();
    this.train.visible = false;
    scene.add(this.train);

    // monuments
    this.atomium = makeAtomium();
    placeOn(this.atomium, P.atomium.lat, P.atomium.lon, 0.0012);
    this.cathedral = makeCathedral();
    placeOn(this.cathedral, P.cathedrale.lat, P.cathedrale.lon, 0.0007);
    this.diamond = makeDiamond();
    placeOn(this.diamond, P.anvers.lat, P.anvers.lon + 0.03, 0.0007, 0.0025);
    for (const m of [this.atomium, this.cathedral, this.diamond]) {
      m.scale.setScalar(0.00001);
      m.visible = false;
      scene.add(m);
    }

    // marqueurs de villes (anneaux pulsants)
    this.markers = {};
    for (const k of ['toulouse', 'bruxelles', 'anvers', 'hotel', 'zoo']) {
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), ringMat);
      placeOn(m, P[k].lat, P[k].lon, 0.002, 0.0002);
      m.rotateX(-Math.PI / 2);
      scene.add(m);
      this.markers[k] = m;
    }

    // tout ce qui est posé sur la carte se dessine après les calques de carte
    scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !this.mapMats.includes(o.material)) o.renderOrder = Math.max(o.renderOrder, 5);
    });

    // caméra
    this.view = { lat: 20, lon: -30, alt: 3.4, tilt: 0, heading: 0 };
    this.camMode = 'view';
    this.chase = null;
    this.shake = 0;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 55 : 45;
    this.camera.updateProjectionMatrix();
    const s = (h * PR) / 2 / Math.tan((this.camera.fov * D2R) / 2);
    this.mats.forEach((m) => (m.uniforms.uScale.value = s));
    this.pr = PR;
    this.mats.forEach((m) => (m.uniforms.uMax.value = m === this.starMat ? 3 * this.pr : 6 * this.pr));
  }

  applyView() {
    const { lat, lon, alt, tilt, heading } = this.view;
    const target = ll(lat, lon, 1);
    const f = frame(target);
    const h = f.north.clone().multiplyScalar(Math.cos(heading)).add(f.east.clone().multiplyScalar(Math.sin(heading)));
    const cam = this.camera;
    cam.position.copy(target).addScaledVector(f.up, alt * Math.cos(tilt)).addScaledVector(h, -alt * Math.sin(tilt));
    // "haut" de la caméra = direction du cap quand on regarde à la verticale, la normale quand on est rasant
    cam.up.copy(f.up).multiplyScalar(Math.sin(tilt)).addScaledVector(h, Math.cos(tilt)).normalize();
    cam.lookAt(target);
  }

  // Avance un véhicule le long d'une route (0..1), retourne {pos, fwd, up}
  _along(route, t, lift = 0) {
    const c = route.curve;
    const pos = c.getPointAt(Math.min(t, 1));
    const fwd = c.getTangentAt(Math.min(t, 0.999)).normalize();
    const up = pos.clone().normalize();
    pos.addScaledVector(up, lift);
    return { pos, fwd, up };
  }

  placeVehicle(obj, route, t, scale, lift = 0) {
    const { pos, fwd, up } = this._along(route, t, lift);
    obj.position.copy(pos);
    obj.up.copy(up);
    obj.lookAt(pos.clone().add(fwd));
    obj.scale.setScalar(scale);
    return { pos, fwd, up };
  }

  // Caméra de poursuite : back/height/side en unités monde
  chaseCam({ pos, fwd, up }, c) {
    const h = this.flat(fwd, up);
    const side = h.clone().cross(up).normalize();
    const cam = this.camera;
    cam.position.copy(pos).addScaledVector(h, -c.back).addScaledVector(up, c.height).addScaledVector(side, c.side);
    cam.up.copy(up);
    cam.lookAt(pos.clone().addScaledVector(h, c.ahead));
  }

  // direction projetée sur le plan tangent
  flat(fwd, up) {
    return fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize();
  }

  // cap (radians) d'une direction en un point
  headingOf(pos, fwd) {
    const f = frame(pos);
    const h = this.flat(fwd, f.up);
    return Math.atan2(h.dot(f.east), h.dot(f.north));
  }

  // paramètres de poursuite équivalents à une vue (pour des raccords invisibles)
  static chaseFromView(alt, tilt) {
    return { back: alt * Math.sin(tilt), height: alt * Math.cos(tilt), side: 0, ahead: 0 };
  }

  // repère lumineux d'activité : colonne de lumière + tête brillante + onde au sol
  addPin(lat, lon, big = false) {
    const g = new THREE.Group();
    const h = big ? 1.6 : 1;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 1 }, uColor: { value: new THREE.Color(0xfff2a0) } },
      vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vY; void main(){ float a = (1.0 - vY) * 0.85 * uOpacity; gl_FragColor = vec4(uColor * a, a); }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2 * h, 12, 1, true), beamMat);
    beam.position.y = 1.1 * h;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff200, toneMapped: false, transparent: true }));
    head.position.y = 2.2 * h;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,242,80,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.set(1.4, 1.4, 1);
    halo.position.y = 2.2 * h;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 40), new THREE.MeshBasicMaterial({ color: 0xfff200, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(beam, head, halo, ring);
    placeOn(g, lat, lon, 0.00045 * (big ? 1.4 : 1));
    g.renderOrder = 6;
    g.traverse((o) => (o.renderOrder = 6));
    this.scene.add(g);
    const base = g.userData.baseScale;
    g.scale.set(base, 0.00001, base);
    gsap.to(g.scale, { y: base, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
    gsap.fromTo(ring.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 2.2, y: 2.2, z: 2.2, duration: 1.6, repeat: -1, ease: 'power2.out' });
    gsap.fromTo(ring.material, { opacity: 0.9 }, { opacity: 0, duration: 1.6, repeat: -1, ease: 'power2.out' });
    return {
      group: g,
      // visité : le repère s'atténue mais reste (trace du parcours)
      done: () => {
        gsap.to(beamMat.uniforms.uOpacity, { value: 0.25, duration: 0.8 });
        gsap.to(halo.material, { opacity: 0.35, duration: 0.8 });
        gsap.killTweensOf(ring.scale);
        gsap.killTweensOf(ring.material);
        gsap.to(ring.material, { opacity: 0.25, duration: 0.5 });
        ring.scale.setScalar(0.6);
      },
      remove: () => gsap.to(g.scale, { y: 0.00001, duration: 0.5, onComplete: () => this.scene.remove(g) }),
    };
  }

  // monument qui sort du sol
  rise(obj, d = 1.6) {
    obj.visible = true;
    return gsap.to(obj.scale, { x: obj.userData.baseScale, y: obj.userData.baseScale, z: obj.userData.baseScale, duration: d, ease: 'elastic.out(1, 0.6)' });
  }

  pulseMarker(k) {
    const m = this.markers[k];
    gsap.fromTo(m.material, { opacity: 0.9 }, { opacity: 0, duration: 2, repeat: 2, ease: 'power1.out' });
    gsap.fromTo(m.scale, { x: 0.0005, y: 0.0005, z: 0.0005 }, { x: 0.004, y: 0.004, z: 0.004, duration: 2, repeat: 2, ease: 'power1.out' });
  }

  update(dt, t) {
    this.mats.forEach((m) => (m.uniforms.uTime.value = t));
    this.beFillMat.uniforms.uTime.value = t;
    if (this.camMode === 'view') this.applyView();
    else if (this.camMode === 'fn' && this.camFn) this.camFn(t);
    const cam = this.camera;
    const dist = cam.position.length();
    const fres = THREE.MathUtils.clamp((dist - 1.02) / 1.2, 0, 1);
    this.mapMats.forEach((m) => ((m.uniforms.uFres.value = fres), (m.uniforms.uChaos.value = this.chaos)));
    // plan proche dynamique : précision de profondeur partout (pas de scintillement)
    const near = THREE.MathUtils.clamp((dist - 1) * 0.2, 0.0002, 0.6);
    if (Math.abs(near - cam.near) > cam.near * 0.05) {
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    // le soleil éclaire toujours depuis au-dessus de la caméra
    this.sun.position.copy(cam.position).normalize().multiplyScalar(10).addScaledVector(cam.up, 3);
    if (this.shake > 0) {
      const s = this.shake * this.view.alt * 0.02;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    if (this.plane.visible) this.plane.userData.strobe.visible = Math.sin(t * 12) > 0.6;
    if (this.diamond.visible) this.diamond.userData.gem.rotation.y = t * 0.8;
  }
}

// libère la mémoire GPU d'une scène qui ne sert plus
export function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) v?.isTexture && v.dispose();
      if (m.uniforms) for (const u of Object.values(m.uniforms)) u.value?.isTexture && u.value.dispose();
      m.dispose();
    }
  });
}
