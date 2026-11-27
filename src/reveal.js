// ACTE 4 — BIG REVEAL : logo Thunderdome en 3D, lasers, strobes, billets
import * as THREE from 'three';
import gsap from 'gsap';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { glowTexture, getEnv, isMobile, uploadAndFree } from './util.js';

function beamMaterial(color, power = 1.6) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float a = pow(vUv.y, ${power.toFixed(2)}) * uOpacity; gl_FragColor = vec4(uColor*a, a); }`,
  });
}

function ticketTexture(logoImg, n) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 440;
  const g = c.getContext('2d');
  // fond
  const grd = g.createLinearGradient(0, 0, 1024, 440);
  grd.addColorStop(0, '#0b0b08');
  grd.addColorStop(0.5, '#1b1a10');
  grd.addColorStop(1, '#050505');
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(0, 0, 1024, 440, 36);
  g.fill();
  // bord
  g.strokeStyle = '#fff200';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(14, 14, 996, 412, 28);
  g.stroke();
  // trame
  g.globalAlpha = 0.08;
  g.fillStyle = '#fff200';
  for (let x = -440; x < 1024; x += 26) {
    g.beginPath();
    g.moveTo(x, 440);
    g.lineTo(x + 440, 0);
    g.lineTo(x + 452, 0);
    g.lineTo(x + 12, 440);
    g.fill();
  }
  g.globalAlpha = 1;
  // logo
  if (logoImg) g.drawImage(logoImg, 40, 60, 380, 314);
  // talon perforé
  g.setLineDash([10, 12]);
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(800, 30);
  g.lineTo(800, 410);
  g.stroke();
  g.setLineDash([]);
  // textes
  g.fillStyle = '#fff';
  g.font = '64px "Archivo Black", Impact, sans-serif';
  g.fillText('THUNDERDOME', 400, 150);
  g.fillStyle = '#fff200';
  g.font = '40px "Archivo Black", Impact, sans-serif';
  g.fillText('12.12.2026', 400, 220);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '26px "Space Mono", monospace';
  g.fillText('HARDCORE WILL NEVER DIE', 400, 290);
  g.fillText('CHAOS · AFAS DOME · ANVERS', 400, 335);
  g.save();
  g.translate(905, 220);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = '38px "Archivo Black", Impact, sans-serif';
  g.fillText(`N° 00${n}`, 0, 14);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = isMobile ? 1 : 8;
  return t;
}

export class RevealScene {
  constructor(renderer) {
    this.bloom = { strength: 0.9, radius: 0.5, threshold: 0.78 };
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x050503, 0.06);
    scene.environment = getEnv(renderer);
    this.renderer = renderer;
    scene.environmentIntensity = 0.7;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camBase = new THREE.Vector3(0, 0, 9);
    this.camera.position.copy(this.camBase);

    scene.add(new THREE.AmbientLight(0x1a1a12, 1));
    this.redA = new THREE.PointLight(0xfff200, 7, 20, 1.5);
    this.redB = new THREE.PointLight(0xffffff, 6, 20, 1.5);
    this.strobe = new THREE.PointLight(0xffffff, 0, 30, 1.2);
    this.strobe.position.set(0, 1, 6);
    scene.add(this.redA, this.redB, this.strobe);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 4, 8);
    scene.add(key);

    this.root = new THREE.Group();
    scene.add(this.root);

    // projecteurs (cônes) venant d'en haut
    this.beams = [];
    for (let i = 0; i < 6; i++) {
      const mat = beamMaterial(i % 2 ? 0xfff200 : 0xffffff, 2.2);
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.4, 16, 32, 1, true), mat);
      m.geometry.translate(0, -8, 0);
      const pivot = new THREE.Group();
      pivot.position.set((i - 2.5) * 2.4, 9, -4);
      pivot.add(m);
      pivot.userData = { phase: i * 1.1, mat };
      scene.add(pivot);
      this.beams.push(pivot);
    }

    // lasers en éventail derrière le logo
    this.lasers = new THREE.Group();
    this.lasers.position.set(0, -0.5, -6);
    for (let i = 0; i < 14; i++) {
      const mat = beamMaterial(i % 3 === 0 ? 0xffffff : 0xfff200, 0.6);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 30), mat);
      m.geometry.translate(0, 15, 0);
      m.rotation.z = ((i - 6.5) / 6.5) * 1.2;
      m.userData.mat = mat;
      this.lasers.add(m);
    }
    scene.add(this.lasers);

    // étincelles / braises
    const N = 900;
    const pos = new Float32Array(N * 3);
    this.emberVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
      this.emberVel[i] = 0.4 + Math.random() * 1.6;
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(
      eg,
      new THREE.PointsMaterial({ size: 0.05, map: glowTexture('rgba(255,242,80,1)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scene.add(this.embers);

    // onde de choc
    this.shock = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xfff200, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
    );
    this.shock.position.z = -0.5;
    scene.add(this.shock);

    // halo derrière le logo
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture('rgba(255,235,60,0.3)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.halo.scale.set(9, 9, 1);
    this.halo.position.z = -1.5;
    this.root.add(this.halo);

    this.logo = new THREE.Group();
    this.logo.visible = false;
    this.root.add(this.logo);

    this.tickets = new THREE.Group();
    this.tickets.visible = false;
    scene.add(this.tickets);

    this.kick = 0;
    this.time = 0;
    this.active = false;
  }

  // construit le logo 3D à partir du SVG
  buildLogo(svgText) {
    const data = new SVGLoader().parse(svgText);
    const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.28, emissive: 0x111111 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x3a3600, metalness: 0.6, roughness: 0.4, emissive: 0xfff200, emissiveIntensity: 0.35 });
    const back = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.6, roughness: 0.45, emissive: 0x2a2700, emissiveIntensity: 1 });
    const inner = new THREE.Group();
    for (const path of data.paths) {
      const isWhite = path.color.getHex() > 0x808080;
      const shapes = SVGLoader.createShapes(path);
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: isWhite ? 7 : 3,
        bevelEnabled: true,
        bevelThickness: 0.8,
        bevelSize: 0.35,
        bevelSegments: 2,
        curveSegments: 6,
      });
      const mesh = new THREE.Mesh(geo, isWhite ? [metal, edge] : [back, back]);
      mesh.position.z = isWhite ? 0 : -5;
      inner.add(mesh);
    }
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    inner.position.set(-c.x, -c.y, -c.z);
    const holder = new THREE.Group();
    holder.add(inner);
    const s = 4.2 / size.x;
    holder.scale.set(s, -s, s); // SVG : y vers le bas (le déterminant négatif est géré par three)
    this.logo.add(holder);
    this.logoMetal = metal;
    this.logoEdge = edge;
  }

  buildTickets(logoImg) {
    this._logoImg = logoImg;
    for (let i = 0; i < 2; i++) {
      const tex = uploadAndFree(this.renderer, ticketTexture(logoImg, i + 1));
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.08, color: 0xd0d0d0, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.375), mat);
      m.userData.side = i ? 1 : -1;
      this.tickets.add(m);
    }
  }

  // après une perte de contexte WebGL : on redessine les billets
  rebuildTickets() {
    this.tickets.children.forEach((m, i) => {
      const tex = uploadAndFree(this.renderer, ticketTexture(this._logoImg, i + 1));
      m.material.map = m.material.emissiveMap = tex;
      m.material.needsUpdate = true;
    });
  }

  resize(w, h) {
    this.aspect = w / h;
    this.camera.aspect = w / h;
    // en portrait : on recule pour que le logo tienne en largeur
    this.camBase.z = w / h < 0.8 ? 9 / Math.max(0.5, (w / h) * 1.35) : 9;
    this.camera.updateProjectionMatrix();
  }

  // appelé sur chaque temps fort
  beat(i) {
    this.kick = 1;
    if (i % 4 === 0) {
      this.strobe.intensity = 120;
      gsap.to(this.strobe, { intensity: 0, duration: 0.12 });
    }
    this.lasers.children.forEach((l, k) => (l.userData.mat.uniforms.uOpacity.value = (i + k) % 2 ? 1 : 0.25));
  }

  slam() {
    this.active = true;
    this.logo.visible = true;
    this.logo.scale.setScalar(3.5);
    this.logo.position.set(0, 0.6, 4);
    gsap.to(this.logo.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'power4.in' });
    gsap.to(this.logo.position, { z: 0, duration: 0.45, ease: 'power4.in' });
    gsap.to(this.halo.material, { opacity: 0.22, duration: 0.6, delay: 0.4 });
    gsap.to(this.embers.material, { opacity: 0.6, duration: 1, delay: 0.4 });
    this.beams.forEach((b) => gsap.to(b.userData.mat.uniforms.uOpacity, { value: 0.1, duration: 0.8, delay: 0.45 }));
    gsap.delayedCall(0.45, () => {
      this.shock.material.opacity = 1;
      this.shock.scale.setScalar(0.5);
      gsap.to(this.shock.scale, { x: 14, y: 14, z: 14, duration: 1.2, ease: 'power2.out' });
      gsap.to(this.shock.material, { opacity: 0, duration: 1.2, ease: 'power2.out' });
      this.kick = 2.5;
    });
  }

  // le logo monte, les billets arrivent
  showTickets() {
    const portrait = this.aspect < 0.8;
    gsap.to(this.logo.position, { y: portrait ? 2.6 : 1.4, duration: 1.2, ease: 'power3.inOut' });
    gsap.to(this.logo.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 1.2, ease: 'power3.inOut' });
    this.tickets.visible = true;
    this.tickets.children.forEach((t, i) => {
      const s = t.userData.side;
      const target = portrait ? { x: 0, y: 0.4 - i * 1.65 } : { x: s * 1.9, y: -1.6 };
      t.position.set(s * 12, target.y - 3, 2);
      t.rotation.set(0, s * 3, s * 0.6);
      gsap.to(t.position, { x: target.x, y: target.y, z: 0.5, duration: 1.4, delay: 0.3 + i * 0.25, ease: 'power3.out' });
      gsap.to(t.rotation, { y: s * 0.15, z: s * -0.05, duration: 1.6, delay: 0.3 + i * 0.25, ease: 'power3.out' });
      t.userData.base = target;
    });
  }

  update(dt, t) {
    this.time = t;
    this.kick = Math.max(0, this.kick - dt * 5);
    const k = this.kick;
    // caméra : léger orbit + secousse sur le kick
    const cam = this.camera;
    cam.position.set(
      this.camBase.x + Math.sin(t * 0.3) * 0.6 + (Math.random() - 0.5) * k * 0.18,
      this.camBase.y + Math.sin(t * 0.23) * 0.3 + (Math.random() - 0.5) * k * 0.18,
      this.camBase.z - k * 0.25
    );
    cam.lookAt(0, 0, 0);
    if (this.logo.visible) {
      this.logo.rotation.y = Math.sin(t * 0.6) * 0.35;
      this.logo.rotation.x = Math.sin(t * 0.4) * 0.08;
      this.logoEdge.emissiveIntensity = 0.3 + k * 0.6;
    }
    this.halo.scale.setScalar(9 + k * 2);
    this.redA.position.set(Math.cos(t * 1.3) * 5, Math.sin(t * 0.9) * 3, 3);
    this.redB.position.set(Math.cos(t * 0.7 + 2) * 5, -2, 2 + Math.sin(t));
    this.beams.forEach((b) => {
      const ph = b.userData.phase;
      b.rotation.z = Math.sin(t * 0.9 + ph) * 0.6;
      b.rotation.x = Math.cos(t * 0.6 + ph) * 0.3;
    });
    this.lasers.rotation.z = Math.sin(t * 0.5) * 0.3;
    this.lasers.children.forEach((l) => (l.userData.mat.uniforms.uOpacity.value *= 0.92));
    const p = this.embers.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.emberVel[i] * dt * (1 + k * 2);
      if (y > 7) y = -7;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t + i) * dt * 0.2);
    }
    p.needsUpdate = true;
    this.tickets.children.forEach((tk, i) => {
      if (!tk.userData.base) return;
      tk.rotation.y = tk.userData.side * 0.15 + Math.sin(t * 0.8 + i * 1.5) * 0.35;
    });
  }
}
