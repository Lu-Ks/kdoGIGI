// ACTE 0 — le paquet cadeau 3D
import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowTexture, getEnv } from './util.js';

export class GiftScene {
  constructor(renderer) {
    this.bloom = { strength: 0.8, radius: 0.7, threshold: 0.7 };
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x020203);
    scene.fog = new THREE.Fog(0x020203, 6, 14);
    scene.environment = getEnv(renderer);
    scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    this.camera.position.set(0, 1.1, 6.2);
    this.camera.lookAt(0, 0.15, 0);

    // lumières
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    const key = new THREE.SpotLight(0xfff1dd, 60, 20, 0.45, 0.6, 1.5);
    key.position.set(-2.5, 5, 3);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const rim = new THREE.PointLight(0xc23b4f, 12, 10, 1.6);
    rim.position.set(2.5, 1.5, -2.5);
    scene.add(rim);
    this.inner = new THREE.PointLight(0xffd9a0, 0, 8, 1.4);
    this.inner.position.set(0, 0.6, 0);
    scene.add(this.inner);

    // --- le paquet ---
    const gift = (this.gift = new THREE.Group());
    scene.add(gift);
    const paper = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.55, metalness: 0.15 });
    const ribbon = new THREE.MeshStandardMaterial({ color: 0x9b0f1e, roughness: 0.28, metalness: 0.55, emissive: 0x2a0005 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.0, 1.2, 4, 0.03), paper);
    body.position.y = 0;
    gift.add(body);
    // intérieur lumineux (visible quand le couvercle part)
    const innerGlow = (this.innerGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.12, 1.12),
      new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, toneMapped: false })
    ));
    innerGlow.rotation.x = -Math.PI / 2;
    innerGlow.position.y = 0.502;
    gift.add(innerGlow);

    const rb1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.01, 1.215), ribbon);
    const rb2 = new THREE.Mesh(new THREE.BoxGeometry(1.215, 1.01, 0.2), ribbon);
    gift.add(rb1, rb2);

    const lid = (this.lid = new THREE.Group());
    lid.position.y = 0.55;
    gift.add(lid);
    lid.add(new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.24, 1.3, 4, 0.04), paper));
    lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.245, 1.315), ribbon));
    lid.add(new THREE.Mesh(new THREE.BoxGeometry(1.315, 0.245, 0.21), ribbon));

    // noeud
    const bow = (this.bow = new THREE.Group());
    bow.position.y = 0.14;
    lid.add(bow);
    const loopGeo = new THREE.TorusGeometry(0.2, 0.055, 12, 32);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(loopGeo, ribbon);
      l.scale.set(1.25, 0.7, 0.6);
      l.position.set(s * 0.2, 0.1, 0);
      l.rotation.set(0, 0, s * 0.45);
      bow.add(l);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.32), ribbon);
      tail.position.set(s * 0.12, 0.0, 0.18);
      tail.rotation.set(0, s * 0.5, 0);
      bow.add(tail);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), ribbon);
    knot.position.y = 0.08;
    knot.scale.set(1, 0.8, 0.9);
    bow.add(knot);

    // halo au sol
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture('rgba(180,40,60,0.6)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    halo.scale.set(4, 4, 1);
    halo.position.set(0, -0.6, -0.5);
    scene.add(halo);

    // faisceau de lumière (caché)
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uOpacity; uniform float uTime; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.y, 1.5) * (0.75 + 0.25*sin(vUv.x*40.0 + uTime*3.0));
          gl_FragColor = vec4(vec3(1.0,0.88,0.65)*a*uOpacity, a*uOpacity); }`,
    });
    this.beamMat = beamMat;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.56, 6, 48, 1, true), beamMat);
    beam.position.y = 3.5;
    gift.add(beam);

    // poussières
    const N = 400;
    const pos = new Float32Array(N * 3);
    this.dustSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
      this.dustSpeed[i] = 0.05 + Math.random() * 0.1;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({
        size: 0.025,
        map: glowTexture(),
        color: 0xffe6c8,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(this.dust);

    // éclats (burst à l'ouverture)
    const M = 260;
    const sp = new Float32Array(M * 3);
    this.sparkVel = [];
    for (let i = 0; i < M; i++) this.sparkVel.push(new THREE.Vector3());
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.06,
        map: glowTexture(),
        color: 0xffd28a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.sparks.visible = false;
    gift.add(this.sparks);

    this.idle = true;
    this.waiting = false; // frémit tant que le chargement n'est pas fini
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // en portrait on recule pour que le cadeau tienne
    this.camera.fov = w / h < 0.8 ? 46 : 35;
    this.camera.updateProjectionMatrix();
  }

  update(dt, t) {
    if (this.idle) {
      this.gift.rotation.y = t * 0.35 + Math.sin(t * 0.7) * 0.15;
      this.gift.position.y = Math.sin(t * 1.3) * 0.06;
      this.gift.rotation.z = this.waiting ? Math.sin(t * 40) * 0.01 : Math.sin(t * 0.9) * 0.02;
    }
    this.beamMat.uniforms.uTime.value = t;
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.dustSpeed[i] * dt;
      if (y > 3) y = -3;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    if (this.sparks.visible) {
      const sp = this.sparks.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const v = this.sparkVel[i];
        v.y -= 1.2 * dt;
        sp.setXYZ(i, sp.getX(i) + v.x * dt, sp.getY(i) + v.y * dt, sp.getZ(i) + v.z * dt);
      }
      sp.needsUpdate = true;
    }
  }

  // Ouverture : renvoie une promesse résolue quand la caméra a plongé dans la boîte
  open(audio) {
    this.idle = false;
    const g = this.gift;
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      // le cadeau se remet face caméra et tremble
      tl.to(g.rotation, { y: Math.round(g.rotation.y / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4, z: 0, duration: 0.6, ease: 'power2.out' });
      tl.to(g.position, { y: 0, duration: 0.6, ease: 'power2.out' }, '<');
      tl.to(g.rotation, { z: 0.05, duration: 0.05, yoyo: true, repeat: 9, ease: 'none' });
      tl.to(g.scale, { x: 1.04, y: 0.96, z: 1.04, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '<');
      // le noeud se défait
      tl.to(this.bow.scale, { x: 0, y: 0, z: 0, duration: 0.4, ease: 'back.in(2)' });
      tl.call(() => audio.sparkle());
      // le couvercle s'envole
      tl.to(this.lid.position, { y: 4.5, x: 1.6, z: -1.5, duration: 1.4, ease: 'power3.in' });
      tl.to(this.lid.rotation, { x: -1.8, z: -1.2, duration: 1.4, ease: 'power2.in' }, '<');
      tl.call(() => this._burst(), null, '<0.15');
      tl.to(this.innerGlow.material, { opacity: 1, duration: 0.4 }, '<0.1');
      tl.to(this.inner, { intensity: 40, duration: 0.8 }, '<');
      tl.to(this.beamMat.uniforms.uOpacity, { value: 0.9, duration: 1 }, '<');
      tl.call(() => audio.whoosh(2.6, 0.35, 300, 4000), null, '<0.5');
      // la caméra monte et plonge dans la boîte
      const cam = this.camera;
      const look = { y: 0.15 };
      tl.to(cam.position, { x: 0, y: 3.6, z: 2.4, duration: 1.6, ease: 'power2.inOut', onUpdate: () => cam.lookAt(0, look.y, 0) }, '<0.2');
      tl.to(look, { y: 0, duration: 1.6 }, '<');
      tl.to(cam.position, { y: 0.55, z: 0.001, duration: 1.3, ease: 'power3.in', onUpdate: () => cam.lookAt(0, -1, 0) });
      tl.to(this.bloom, { strength: 3, duration: 1.3, ease: 'power2.in' }, '<');
    });
  }

  _burst() {
    const sp = this.sparks.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      sp.setXYZ(i, (Math.random() - 0.5) * 0.9, 0.5, (Math.random() - 0.5) * 0.9);
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 1.2;
      this.sparkVel[i].set(Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s);
    }
    sp.needsUpdate = true;
    this.sparks.visible = true;
    this.sparks.material.opacity = 1;
    gsap.to(this.sparks.material, { opacity: 0, duration: 2.5, delay: 0.5 });
  }
}
