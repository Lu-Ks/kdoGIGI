// Moteur audio 100 % synthétisé (Web Audio API) + piste mp3 optionnelle pour le drop.
import { MUSIC } from './config.js';

// ~0.1 s de silence en WAV, joué en <audio> pour que l'iPhone ne coupe pas le son en mode silencieux
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.track = null; // AudioBuffer du drop (optionnel)
    this.loops = [];
  }

  // Pré-chargement (peut être appelé avant le tap : on décode plus tard)
  async preloadTrack() {
    try {
      const res = await fetch(MUSIC.src);
      if (!res.ok || !(res.headers.get('content-type') || '').includes('audio')) return;
      this._trackData = await res.arrayBuffer();
    } catch {
      /* pas de piste : on synthétise */
    }
  }

  // À appeler DANS le handler du tap (obligatoire sur iOS)
  unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    const el = new Audio(SILENT_WAV);
    el.loop = true;
    el.setAttribute('playsinline', '');
    el.play().catch(() => {});
    this._silent = el;

    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    ctx.resume();
    // tick muet pour débloquer
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.12;
    this.master = ctx.createGain();
    this.master.gain.value = this._level();
    this.master.connect(this.comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.6;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.noiseBuf = this._noise(2);
    this.distCurve = this._distCurve(400);
    this.softCurve = this._distCurve(20);

    if (this._trackData) {
      ctx.decodeAudioData(this._trackData.slice(0)).then((buf) => (this.track = buf)).catch(() => {});
    }
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------------------------------------------------------------- utils
  _noise(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  _distCurve(k) {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return c;
  }
  _out(node, wet = 0) {
    node.connect(this.musicBus || this.master);
    if (wet) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.reverbSend);
    }
  }

  // ---------------------------------------------------------------- sons
  // Ambiance du voyage : neutre et douce (accords majeurs + petit arpège), puis bascule en suspense (drone mineur).
  // Même interface que pad() : fade / bright / stop, + suspense(durée).
  ambient() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const neutral = ctx.createGain();
    neutral.gain.value = 1;
    neutral.connect(out);
    this._out(out, 0.7);

    // nappe : 4 voix x 2 triangles désaccordés, filtre doux
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.5;
    lp.connect(neutral);
    const CH = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]; // Cmaj7 Am7 Fmaj7 G6
    const voices = [];
    for (let v = 0; v < 4; v++)
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = this._mtof(CH[0][v]);
        o.detune.value = d;
        const g = ctx.createGain();
        g.gain.value = 0.045;
        o.connect(g).connect(lp);
        o.start();
        voices.push({ o, v });
      }
    let chord = 0;
    const CHORD_S = 4.2;
    const changer = setInterval(() => {
      chord = (chord + 1) % CH.length;
      const t = ctx.currentTime;
      voices.forEach(({ o, v }) => o.frequency.setTargetAtTime(this._mtof(CH[chord][v]), t, 0.35));
    }, CHORD_S * 1000);

    // arpège cristallin, très doux
    const arpSeq = this._sequence({
      interval: CHORD_S / 8,
      step: (t, i) => {
        const notes = CH[chord];
        const m = notes[[0, 2, 3, 1, 2, 3, 1, 2][i % 8]] + 24;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = this._mtof(m);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g).connect(neutral);
        o.start(t);
        o.stop(t + 1.5);
      },
    });

    // couche suspense (le drone mineur), muette au départ
    const sus = this.pad();
    sus.fade(0, 0.01);

    const api = {
      fade: (v, t = 3) => out.gain.setTargetAtTime(v, ctx.currentTime, t / 3),
      bright: (f, t = 3) => lp.frequency.setTargetAtTime(Math.min(f * 1.6, 3000), ctx.currentTime, t / 3),
      // bascule progressive vers le suspense
      suspense: (dur = 6) => {
        const t = ctx.currentTime;
        neutral.gain.setTargetAtTime(0, t, dur / 3);
        sus.fade(0.5, dur);
        setTimeout(() => (arpSeq.stop(), clearInterval(changer)), dur * 1000 + 500);
      },
      stop: (t = 0.05) => {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0, ctx.currentTime, t);
        arpSeq.stop();
        clearInterval(changer);
        sus.stop(t);
        setTimeout(() => voices.forEach(({ o }) => o.stop()), t * 8000 + 100);
      },
    };
    this.loops.push(api);
    return api;
  }

  // Nappe ambient mystérieuse
  // Nappe d'intrigue (drone en la mineur). intensity(0..1) la rend de plus en plus intrigante :
  // filtre qui s'ouvre, note dissonante, harmoniques aiguës qui frottent, battement sourd qui accélère.
  pad() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    lp.Q.value = 2;
    lp.connect(out);
    this._out(out, 0.9);
    const voice = (f, type, gain, dest = lp) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 14;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(dest);
      o.start();
      return { o, g };
    };
    const base = [voice(55, 'sine', 0.35), ...[82.41, 110, 130.81, 164.81].map((f) => voice(f, 'sawtooth', 0.06))];
    // couches de tension (muettes au départ)
    const tension = voice(116.54, 'sawtooth', 0); // si bémol grave : seconde mineure qui frotte
    const shimmerBus = ctx.createGain();
    shimmerBus.connect(out);
    const shimmer = [voice(659.25, 'triangle', 0, shimmerBus), voice(698.46, 'triangle', 0, shimmerBus)]; // mi / fa aigus
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    // tremolo sur les aigus
    const trem = ctx.createOscillator();
    trem.frequency.value = 3;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.5;
    trem.connect(tremG).connect(shimmerBus.gain);
    trem.start();

    // battement sourd (comme un cœur derrière un mur), intervalle et volume selon l'intensité
    let I = 0;
    const pulse = this._sequence({
      interval: () => 1.4 - I * 0.85,
      step: (t, i) => {
        if (I < 0.15) return;
        const lvl = 0.05 + I * 0.22;
        for (const [dt, k] of [[0, 1], [0.16, 0.6]]) {
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(70, t + dt);
          o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.15);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(lvl * k, t + dt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
          o.connect(g).connect(out);
          o.start(t + dt);
          o.stop(t + dt + 0.3);
        }
      },
    });

    const all = [...base, tension, ...shimmer];
    const api = {
      fade: (v, t = 3) => out.gain.setTargetAtTime(v, ctx.currentTime, t / 3),
      bright: (f, t = 3) => lp.frequency.setTargetAtTime(f, ctx.currentTime, t / 3),
      // 0 = à peine présent, 1 = tension maximale
      intensity: (x, t = 4) => {
        I = x;
        const now = ctx.currentTime, k = t / 3;
        lp.frequency.setTargetAtTime(650 + x * x * 1300, now, k);
        lfo.frequency.setTargetAtTime(0.08 + x * 0.35, now, k);
        tension.g.gain.setTargetAtTime(x > 0.3 ? 0.02 + (x - 0.3) * 0.08 : 0, now, k);
        shimmer.forEach((s) => s.g.gain.setTargetAtTime(x > 0.5 ? (x - 0.5) * 0.05 : 0, now, k));
        trem.frequency.setTargetAtTime(3 + x * 6, now, k);
        out.gain.setTargetAtTime(0.55 + x * 0.2, now, k);
      },
      stop: (t = 0.05) => {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0, ctx.currentTime, t);
        pulse.stop();
        setTimeout(() => [...all.map((v) => v.o), lfo, trem].forEach((o) => o.stop()), t * 1000 * 8 + 100);
      },
    };
    this.loops.push(api);
    return api;
  }


  // Souffle (avion, transitions)
  whoosh(dur = 2, gain = 0.5, from = 200, to = 2500) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(from, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g);
    this._out(g, 0.4);
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  // Scintillement magique (ouverture du cadeau)
  sparkle() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = [880, 1108.73, 1318.51, 1760, 2217.46, 2637.02, 3520];
    notes.forEach((f, i) => {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g);
      this._out(g, 0.8);
      o.start(t);
      o.stop(t + 1.5);
    });
  }

  // Petit "ding" pour les cartes de date
  ding(f = 660) {
    const ctx = this.ctx, t = ctx.currentTime;
    [1, 2.01, 3.03].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g);
      this._out(g, 0.7);
      o.start(t);
      o.stop(t + 2);
    });
  }

  // Impact grave (boum cinématique)
  impact(gain = 1) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    const ws = ctx.createWaveShaper();
    ws.curve = this.softCurve;
    o.connect(ws).connect(g);
    this._out(g, 0.5);
    o.start(t);
    o.stop(t + 2.1);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(100, t + 1);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    n.connect(lp).connect(ng);
    this._out(ng, 0.6);
    n.start(t);
    n.stop(t + 1.3);
  }

  // Riser de bruit (montée de tension)
  riser(dur = 4, gain = 0.35) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.Q.value = 3;
    hp.frequency.setValueAtTime(300, t);
    hp.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    s.connect(hp).connect(g);
    g.connect(this.master); // hors "porte" : la montée reste bien audible
    s.start(t);
    s.stop(t + dur + 0.05);
    // coupe la montée pile à un instant donné (ex. : le drop)
    return {
      stopAt: (at) => {
        at = Math.max(at, ctx.currentTime + 0.01);
        g.gain.cancelScheduledValues(at - 0.005);
        g.gain.setValueAtTime(gain, at - 0.004);
        g.gain.linearRampToValueAtTime(0.0001, at);
        try { s.stop(at + 0.02); } catch {}
      },
    };
  }

  // Kick (hard = gabber distordu)
  kick(t, hard = false, gain = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(hard ? 260 : 150, t);
    o.frequency.exponentialRampToValueAtTime(hard ? 48 : 42, t + (hard ? 0.09 : 0.12));
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(gain, t + (hard ? 0.12 : 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (hard ? 0.28 : 0.35));
    if (hard) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.distCurve;
      ws.oversample = '2x';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      const pre = ctx.createGain();
      pre.gain.value = 4;
      o.connect(pre).connect(ws).connect(lp).connect(g);
    } else {
      o.connect(g);
    }
    this._out(g, hard ? 0.08 : 0.25);
    o.start(t);
    o.stop(t + 0.4);
  }

  _hat(t, gain = 0.12) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g);
    this._out(g);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  _stab(t, freq, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const ws = ctx.createWaveShaper();
    ws.curve = this.softCurve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    ws.connect(lp).connect(g);
    this._out(g, 0.5);
    [-18, -6, 0, 7, 19].forEach((d) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * 1.06, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
      o.detune.value = d;
      o.connect(ws);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // Séquenceur générique : appelle step(time, index) pour chaque pas, et onBeat visuel synchronisé
  // lookahead : avance de programmation (grand = résiste aux saccades du téléphone) ; until : on ne programme rien au-delà
  _sequence({ interval, step, onBeat, count = Infinity, start, lookahead = 0.15, until = Infinity }) {
    const ctx = this.ctx;
    let next = start !== undefined ? Math.max(start, ctx.currentTime + 0.01) : ctx.currentTime + 0.06;
    let i = 0;
    const timers = new Set();
    const tick = () => {
      // si le téléphone a gelé, on saute les pas en retard (sinon ils partent tous en paquet)
      while (next < ctx.currentTime - 0.03 && i < count) {
        next += typeof interval === 'function' ? interval(i) : interval;
        i++;
      }
      while (next < ctx.currentTime + lookahead && i < count && next < until) {
        const t = next, idx = i;
        step(t, idx);
        if (onBeat) {
          const id = setTimeout(() => {
            timers.delete(id);
            onBeat(idx);
          }, Math.max(0, (t - ctx.currentTime) * 1000));
          timers.add(id);
        }
        next += typeof interval === 'function' ? interval(idx) : interval;
        i++;
      }
    };
    const h = setInterval(tick, 25);
    tick();
    const api = {
      next: () => next, // instant du prochain pas (pour enchaîner sans trou)
      nextIndex: () => i,
      setUntil: (t) => (until = t),
      stop: () => {
        clearInterval(h);
        timers.forEach(clearTimeout);
      },
    };
    this.loops.push(api);
    return api;
  }

  // Le kick s'emballe de bpm0 jusqu'au tempo du drop, devient de plus en plus distordu, puis tient ce tempo
  // jusqu'à ce que le drop prenne le relais (même grille : aucun trou).
  runaway(bpm0, dur, onBeat) {
    const bpm1 = MUSIC.bpm;
    const start = this.ctx.currentTime;
    const prog = () => Math.min(1, (this.ctx.currentTime - start) / dur);
    return this._sequence({
      interval: () => 60 / (bpm0 + (bpm1 - bpm0) * Math.pow(prog(), 1.5)),
      step: (t) => {
        const p = prog();
        if (p > 0.45) this._gabberKick(t, 0.6 + p * 0.4);
        else this.kick(t, false, 1);
      },
      onBeat,
      lookahead: 0.8,
    });
  }

  // Battement de cœur qui accélère : bpm0 -> bpm1 en `dur` secondes
  heartbeat(bpm0, bpm1, dur, onBeat) {
    const start = this.ctx.currentTime;
    return this._sequence({
      interval: () => {
        const p = Math.min(1, (this.ctx.currentTime - start) / dur);
        return 60 / (bpm0 + (bpm1 - bpm0) * p * p);
      },
      step: (t) => this.kick(t, false, 0.9),
      onBeat,
    });
  }

  // bus basses (low-shelf) + bus "ducké" par le kick ; créés une seule fois
  _buses() {
    if (this.bassBus) return;
    // bus basses : low-shelf + bosse vers 110 Hz (zone audible sur téléphone)
    const shelf = this.ctx.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = 140;
    shelf.gain.value = 6;
    const peak = this.ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 110;
    peak.Q.value = 1.2;
    peak.gain.value = 5;
    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = 1.25;
    this.bassBus.connect(shelf).connect(peak).connect(this._musicIn());
    // bus "ducké" par le kick pour le lead, les stabs et la basse
    this.duck = this.ctx.createGain();
    this.duck.connect(this._musicIn());
    const dg = this.ctx.createGain();
    dg.gain.value = 0.5;
    this.duck.connect(dg).connect(this.reverbSend);
  }

  // ------------------------------------------------------------ instruments du drop
  _mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // kick gabber : clic + corps distordu + sub propre
  _gabberKick(t, gain = 1) {
    this._buses();
    const ctx = this.ctx;
    // corps distordu
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.012);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.11);
    const pre = ctx.createGain();
    pre.gain.value = 5;
    const ws = ctx.createWaveShaper();
    ws.curve = this.distCurve;
    ws.oversample = '4x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * gain, t);
    g.gain.setValueAtTime(0.9 * gain, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(pre).connect(ws).connect(lp).connect(g);
    g.connect(this.bassBus || this.master);
    o.start(t);
    o.stop(t + 0.38);
    // sub propre
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(55, t + 0.06);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(1.0 * gain, t + 0.005);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    sub.connect(sg);
    sg.connect(this.bassBus || this.master);
    sub.start(t);
    sub.stop(t + 0.36);
    // clic
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * gain, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(hp).connect(ng);
    this._out(ng);
    n.start(t, Math.random());
    n.stop(t + 0.02);
    // ducking (sidechain) des nappes/lead
    if (this.duck) {
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(0.25, t);
      this.duck.gain.linearRampToValueAtTime(1, t + 0.2);
    }
  }

  // basse en contretemps (saturée : ses harmoniques passent même sur un haut-parleur de téléphone)
  _bass(t, midi, dur) {
    const ctx = this.ctx;
    const f = this._mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    g.gain.setValueAtTime(0.45, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const ws = ctx.createWaveShaper();
    ws.curve = this.softCurve;
    ws.connect(lp).connect(g).connect(this.duck);
    for (const [type, mul, lvl] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sine', 0.5, 0.8]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const vg = ctx.createGain();
      vg.gain.value = lvl;
      o.connect(vg).connect(ws);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  _snare(t, gain = 0.4) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    n.connect(bp).connect(g);
    this._out(g, 0.3);
    n.start(t, Math.random());
    n.stop(t + 0.16);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og);
    this._out(og);
    o.start(t);
    o.stop(t + 0.1);
  }

  _crash(t, gain = 0.25) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    n.connect(hp).connect(g);
    this._out(g, 0.5);
    n.start(t);
    n.stop(t + 2.3);
  }

  // "hoover" : scies désaccordées + sous-octave, glissando, distorsion douce
  _hoover(t, midi, dur) {
    const ctx = this.ctx;
    const f = this._mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.015);
    g.gain.setValueAtTime(0.11, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const ws = ctx.createWaveShaper();
    ws.curve = this.softCurve;
    ws.connect(lp).connect(g).connect(this.duck);
    const voices = [[-22, 'sawtooth', 1], [-8, 'sawtooth', 1], [0, 'sawtooth', 1], [9, 'sawtooth', 1], [21, 'sawtooth', 1], [-1200, 'square', 0.6]];
    for (const [det, type, lvl] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * 1.12, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      o.detune.value = det;
      const vg = ctx.createGain();
      vg.gain.value = lvl * 0.5;
      o.connect(vg).connect(ws);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  // stab rave (accord mineur)
  _chordStab(t, notes, dur = 0.16) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    lp.connect(g).connect(this.duck);
    for (const m of notes)
      for (const d of [-10, 10]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this._mtof(m);
        o.detune.value = d;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
  }

  // entrée "musique" : passe par un filtre passe-bas = la "porte" qu'on ouvre au reveal
  _musicIn() {
    if (!this.musicBus) {
      this.doorLP = this.ctx.createBiquadFilter();
      this.doorLP.type = 'lowpass';
      this.doorLP.frequency.value = 20000;
      this.doorLP.Q.value = 0.9;
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.doorLP).connect(this.master);
    }
    return this.musicBus;
  }

  // ------------------------------------------------------------ structure du morceau
  // A = drop 1 (stabs puis hoover), joué 2 fois ; B = variation (kick galopant, nouvelle grille, arpèges) 2 fois ;
  // C = break (sans kick puis remontée) ; puis on reboucle.
  _songStep(t, j, beat, isDrop = false) {
    const SECTIONS = [['A', 16], ['A', 16], ['B', 16], ['B', 16], ['C', 8]];
    const total = SECTIONS.reduce((a, x) => a + x[1], 0);
    const barAbs = Math.floor(j / 16), k16 = j % 16;
    let bar = barAbs % total, sec = 'A', secIdx = 0;
    for (const [name, len] of SECTIONS) {
      if (bar < len) {
        sec = name;
        break;
      }
      bar -= len;
      secIdx++;
    }
    const first = (bar === 0 && k16 === 0) || isDrop;
    const _ = null;

    if (sec === 'A') {
      const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]]; // Am F G Em
      const lead = [69, _, 69, _, 72, _, 69, _, 76, _, 74, _, 72, _, 71, _, 69, _, 69, _, 72, _, 76, _, 79, _, 77, _, 76, _, 74, _];
      const fill = bar === 15;
      if (first) this._crash(t, 0.3);
      if (k16 % 4 === 0 && !(fill && k16 >= 8)) this._gabberKick(t, 1);
      if (k16 % 4 === 2) {
        this._hat(t, 0.1);
        if (!fill || k16 < 8) this._bass(t, chords[bar % 4][0] - 12, beat * 0.42);
      } else if (k16 % 2 === 1) this._hat(t, 0.035);
      if (fill) this._snare(t, 0.12 + (k16 / 16) * 0.35);
      else if (k16 === 4 || k16 === 12) this._snare(t, 0.12);
      if (bar < 8) {
        if (k16 === 2 || k16 === 6 || k16 === 10 || k16 === 14) this._chordStab(t, chords[bar % 4].map((n) => n + 12));
      } else if (!fill) {
        const n = lead[(bar % 2) * 16 + k16];
        if (n) this._hoover(t, n - 12, (beat / 2) * 0.95);
      }
      return;
    }

    if (sec === 'B') {
      // nouvelle grille Dm Bb C Am, kick galopant, hi-hats en doubles, arpèges puis nouveau thème
      const chords = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 60, 64]];
      const lead = [74, _, 74, 77, _, 74, 81, _, 79, _, 77, _, 76, _, 74, _, 74, _, 74, 77, _, 79, 82, _, 81, _, 79, _, 77, 76, 74, _];
      const fill = bar === 15;
      const ch = chords[bar % 4];
      if (first) (this._crash(t, 0.35), this._snare(t, 0.3));
      const gallop = k16 % 4 === 0 || (bar % 2 === 1 && k16 === 14) || (bar % 4 === 3 && k16 === 7);
      if (gallop && !(fill && k16 >= 8)) this._gabberKick(t, 1);
      this._hat(t, k16 % 2 === 0 ? 0.07 : 0.045);
      if (k16 % 4 === 2 && !(fill && k16 >= 8)) this._bass(t, ch[0] - 24, beat * 0.42);
      if (fill) this._snare(t, 0.1 + (k16 / 16) * 0.4);
      else if (k16 === 4 || k16 === 12) this._snare(t, 0.14);
      if (bar < 8) {
        // arpège hoover en doubles croches sur les notes de l'accord
        if (k16 % 2 === 0) this._hoover(t, ch[(k16 / 2) % 3] + (k16 >= 8 ? 0 : -12), (beat / 2) * 0.8);
      } else if (!fill) {
        const n = lead[(bar % 2) * 16 + k16];
        if (n) this._hoover(t, n - 12, (beat / 4) * 1.8);
        if (k16 === 0) this._chordStab(t, ch.map((n2) => n2 + 12), beat * 0.9);
      }
      return;
    }

    // C : break (4 mesures sans kick, nappe + basse longue) puis remontée (kick en croches + roulement)
    const ch = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]][bar % 4];
    if (bar < 4) {
      if (k16 === 0) {
        this._chordStab(t, ch, beat * 4);
        this._chordStab(t, ch.map((n) => n + 12), beat * 4);
        this._bass(t, ch[0] - 24, beat * 3.5);
      }
      if (k16 === 8 && bar % 2 === 1) this._hoover(t, ch[2], beat * 1.5);
    } else {
      const p = (bar - 4 + k16 / 16) / 4; // 0 -> 1 sur la remontée
      if (k16 % (p < 0.5 ? 4 : 2) === 0) this._gabberKick(t, 0.6 + p * 0.4);
      if (p > 0.25) this._snare(t, 0.05 + p * 0.35);
      if (k16 === 0) this._chordStab(t, ch.map((n) => n + 12), beat * 2);
    }
  }

  // Le morceau (UN SEUL, qui ne redémarre jamais) :
  //  - startMusic() : démarre au tempo du drop, porte fermée (kick + basse étouffés), la porte s'entrouvre peu à peu
  //  - release(minDelay) : choisit le prochain temps fort >= maintenant + minDelay, et à cet instant la porte s'ouvre
  //    en grand et toutes les pistes entrent. Renvoie cet instant (pour caler l'image dessus).
  startMusic(onBeat, buildBars = 4) {
    this._buses();
    this.onBeat = onBeat;
    const ctx = this.ctx;
    const beat = 60 / MUSIC.bpm;
    const mus = this._musicIn();
    const t = ctx.currentTime;
    const t0 = t + 0.08; // premier pas
    const fullStep = buildBars * 16; // le drop tombe pile après N mesures de montée
    const fullAt = t0 + fullStep * (beat / 4);
    const buildDur = fullAt - t;
    this.doorLP.frequency.cancelScheduledValues(t);
    this.doorLP.frequency.setValueAtTime(320, t);
    this.doorLP.frequency.exponentialRampToValueAtTime(2400, fullAt - 0.02);
    this.doorLP.frequency.setValueAtTime(20000, fullAt);

    if (this.track) {
      // piste mp3 : on la lance tout de suite derrière la porte, elle continue au reveal
      const src = ctx.createBufferSource();
      src.buffer = this.track;
      src.loop = true;
      src.loopStart = MUSIC.dropAt;
      src.loopEnd = this.track.duration;
      src.connect(mus);
      src.start(t0, Math.max(0, MUSIC.dropAt - (fullAt - t0)));
    }

    // La mineur : Am - F - G - Em
    const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    const _ = null;
    const lead = [69, _, 69, _, 72, _, 69, _, 76, _, 74, _, 72, _, 71, _, 69, _, 69, _, 72, _, 76, _, 79, _, 77, _, 76, _, 74, _];
    const synth = !this.track;
    const seq = this._sequence({
      interval: beat / 4,
      start: t0,
      lookahead: 1.2,
      step: (t, i) => {
        if (!synth) return;
        const s16 = i % 16;
        if (i < fullStep) {
          // montée : kick + basse étouffés, caisse claire qui s'accélère sur la fin
          if (s16 % 4 === 0) this._gabberKick(t, 1);
          if (s16 % 4 === 2) this._bass(t, 45, beat * 0.42);
          const left = fullStep - i;
          if (left <= 16 && left > 0) this._snare(t, 0.08 + (1 - left / 16) * 0.3);
          else if (left <= 32 && s16 % 2 === 0) this._snare(t, 0.06);
          return;
        }
        // morceau complet (les mesures comptent à partir du reveal)
        this._songStep(t, i - fullStep + 8 * 16, beat, i === fullStep); // on attaque direct sur le hoover
      },
      onBeat: (i) => i % 4 === 0 && this.onBeat && this.onBeat(i / 4, i >= fullStep),
    });
    this.music = {
      setOnBeat: (fn) => (this.onBeat = fn),
      // ouvre la porte sur un temps fort, au plus tôt dans minDelay secondes
      fullAt, // instant exact du drop
      release: () => fullAt, // (compat) le drop est déjà programmé
      stop: () => seq.stop(),
    };
    return this.music;
  }

  // compat : démarre et ouvre aussitôt (mode debug ?act=4)
  drop(onBeat) {
    const m = this.startMusic(onBeat, 1);
    return { t0: m.fullAt, ...m };
  }

  _level() {
    return this.muted ? 0 : 0.9 * (this.volume ?? 1);
  }

  setMuted(m) {
    this.muted = m;
    if (this._silent) this._silent.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(this._level(), this.ctx.currentTime, 0.05);
  }

  // volume 0..1 (curseur PC)
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx) this.master.gain.setTargetAtTime(this._level(), this.ctx.currentTime, 0.05);
  }

  stopAll() {
    this.loops.forEach((l) => l.stop());
    this.loops = [];
  }
}
