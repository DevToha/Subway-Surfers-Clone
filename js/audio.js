/* ============================================================
   METRO RUSH 3D — procedural audio (WebAudio, zero assets)
   ============================================================ */
(function () {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.noiseBuffer = null;
      this.enabled = MR.Utils.store.get('sound', true);
      this.musicRunning = false;
      this._timer = null;
      this._nextNoteTime = 0;
      this._step = 0;
      this._ducked = false;
    }

    /* must be called from a user gesture */
    init() {
      if (this.ctx) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }

      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.85 : 0.0;
      this.master.connect(this.ctx.destination);

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      comp.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.85;
      this.sfxBus.connect(comp);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.0;
      this.musicBus.connect(comp);

      this._buildNoise();
    }

    _buildNoise() {
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    get now() { return this.ctx ? this.ctx.currentTime : 0; }

    setEnabled(on) {
      this.enabled = !!on;
      MR.Utils.store.set('sound', this.enabled);
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0.0, t, 0.08);
    }

    /* ---------------- low level voices ---------------- */

    _tone(opts) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.now + (opts.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freq, t0);
      if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur);

      const peak = opts.gain === undefined ? 0.18 : opts.gain;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.008));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

      let node = osc;
      if (opts.filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = opts.filter;
        f.frequency.setValueAtTime(opts.filterFreq || 1200, t0);
        if (opts.filterEnd) f.frequency.exponentialRampToValueAtTime(opts.filterEnd, t0 + opts.dur);
        f.Q.value = opts.q || 1;
        node.connect(f); node = f;
      }
      node.connect(gain);
      gain.connect(opts.bus || this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.02);
    }

    _noise(opts) {
      if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
      const t0 = this.now + (opts.delay || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter || 'bandpass';
      f.frequency.setValueAtTime(opts.freq || 1200, t0);
      if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
      f.Q.value = opts.q === undefined ? 0.8 : opts.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.gain || 0.12, t0 + (opts.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      src.connect(f); f.connect(g); g.connect(opts.bus || this.sfxBus);
      src.start(t0);
      src.stop(t0 + opts.dur + 0.02);
    }

    /* ---------------- sfx ---------------- */

    click() {
      this._tone({ freq: 720, freqEnd: 980, dur: 0.06, type: 'square', gain: 0.07 });
    }

    coin(pitch) {
      const base = 1180 * Math.pow(1.0595, pitch || 0);
      this._tone({ freq: base, freqEnd: base * 1.02, dur: 0.07, type: 'triangle', gain: 0.13 });
      this._tone({ freq: base * 1.5, freqEnd: base * 1.52, dur: 0.1, type: 'sine', gain: 0.09, delay: 0.045 });
    }

    jump() {
      this._tone({ freq: 300, freqEnd: 760, dur: 0.16, type: 'sine', gain: 0.16 });
      this._noise({ freq: 900, freqEnd: 2400, dur: 0.12, gain: 0.05, q: 1.4 });
    }

    land() {
      this._tone({ freq: 150, freqEnd: 70, dur: 0.1, type: 'sine', gain: 0.11 });
      this._noise({ freq: 400, freqEnd: 180, dur: 0.09, gain: 0.05, filter: 'lowpass' });
    }

    slide() {
      this._noise({ freq: 2600, freqEnd: 500, dur: 0.34, gain: 0.11, q: 1.1 });
      this._tone({ freq: 220, freqEnd: 120, dur: 0.24, type: 'sawtooth', gain: 0.05, filter: 'lowpass', filterFreq: 900 });
    }

    lane() {
      this._noise({ freq: 1600, freqEnd: 800, dur: 0.1, gain: 0.035, q: 2 });
    }

    powerup() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => {
        this._tone({ freq: n, dur: 0.18, type: 'triangle', gain: 0.13, delay: i * 0.055 });
        this._tone({ freq: n * 2, dur: 0.12, type: 'sine', gain: 0.05, delay: i * 0.055 });
      });
    }

    crash() {
      this._noise({ freq: 1400, freqEnd: 120, dur: 0.7, gain: 0.3, filter: 'lowpass', q: 0.6 });
      this._tone({ freq: 170, freqEnd: 38, dur: 0.6, type: 'sawtooth', gain: 0.22, filter: 'lowpass', filterFreq: 800, filterEnd: 200 });
      this._tone({ freq: 90, freqEnd: 30, dur: 0.9, type: 'sine', gain: 0.28 });
    }

    whoosh() {
      this._noise({ freq: 300, freqEnd: 2600, dur: 0.7, gain: 0.06, q: 0.7, attack: 0.25 });
    }

    smash() {
      this._noise({ freq: 2200, freqEnd: 300, dur: 0.26, gain: 0.16, q: 0.8 });
      this._tone({ freq: 420, freqEnd: 110, dur: 0.2, type: 'square', gain: 0.09, filter: 'lowpass', filterFreq: 1400 });
    }

    /** police whistle — used when the chase begins and on capture */
    whistle() {
      this._tone({ freq: 2050, freqEnd: 2500, dur: 0.16, type: 'sine', gain: 0.10, attack: 0.006 });
      this._tone({ freq: 2500, freqEnd: 1980, dur: 0.20, type: 'sine', gain: 0.09, delay: 0.17, attack: 0.006 });
      this._noise({ freq: 2400, dur: 0.30, gain: 0.03, q: 6, attack: 0.02 });
    }

    /** short, friendly dog bark */
    bark() {
      this._tone({ freq: 300, freqEnd: 150, dur: 0.10, type: 'sawtooth', gain: 0.10, filter: 'lowpass', filterFreq: 1400, filterEnd: 600 });
      this._noise({ freq: 900, freqEnd: 400, dur: 0.10, gain: 0.07, q: 1.2 });
      this._tone({ freq: 210, freqEnd: 120, dur: 0.09, type: 'square', gain: 0.05, delay: 0.11, filter: 'lowpass', filterFreq: 1100 });
    }

    /** low siren swell while the pursuers are close */
    siren() {
      this._tone({ freq: 520, freqEnd: 760, dur: 0.55, type: 'sine', gain: 0.045, attack: 0.18 });
      this._tone({ freq: 760, freqEnd: 520, dur: 0.55, type: 'sine', gain: 0.04, delay: 0.5, attack: 0.16 });
    }

    /* ---------------- music ---------------- */

    startMusic() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(this.enabled ? 0.32 : 0, t, 0.6);
      if (this.musicRunning) return;
      this.musicRunning = true;
      this._step = 0;
      this._nextNoteTime = t + 0.12;
      this._timer = setInterval(() => this._schedule(), 25);
    }

    stopMusic(fade) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(0, t, fade === undefined ? 0.3 : fade);
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.musicRunning = false;
    }

    duck(on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const target = on ? 0.05 : (this.enabled ? 0.32 : 0);
      this.musicBus.gain.setTargetAtTime(target, t, 0.15);
    }

    _schedule() {
      if (!this.ctx || !this.musicRunning) return;
      const spb = 60 / 126 / 4; // 16th note @126bpm
      while (this._nextNoteTime < this.ctx.currentTime + 0.18) {
        this._playStep(this._step, this._nextNoteTime);
        this._nextNoteTime += spb;
        this._step = (this._step + 1) % 64;
      }
    }

    _playStep(step, time) {
      if (!this.enabled) return;
      const CH = [
        { root: 110.00, notes: [220.00, 261.63, 329.63, 440.00] }, // Am
        { root: 87.31, notes: [174.61, 220.00, 261.63, 349.23] },  // F
        { root: 130.81, notes: [261.63, 329.63, 392.00, 523.25] }, // C
        { root: 98.00, notes: [196.00, 246.94, 293.66, 392.00] }   // G
      ];
      const bar = Math.floor(step / 16) % 4;
      const chord = CH[bar];
      const s = step % 16;
      const bus = this.musicBus;

      // kick
      if (s % 4 === 0) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, time);
        o.frequency.exponentialRampToValueAtTime(44, time + 0.14);
        g.gain.setValueAtTime(0.5, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        o.connect(g); g.connect(bus);
        o.start(time); o.stop(time + 0.22);
      }
      // snare / clap
      if (s === 4 || s === 12) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 1400;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.14, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
        src.connect(f); f.connect(g); g.connect(bus);
        src.start(time); src.stop(time + 0.15);
      }
      // hats
      if (s % 2 === 1) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7200;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.045, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
        src.connect(f); f.connect(g); g.connect(bus);
        src.start(time); src.stop(time + 0.06);
      }
      // bass
      if (s === 0 || s === 6 || s === 10) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = chord.root / 2;
        f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 6;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.22, time + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
        o.connect(f); f.connect(g); g.connect(bus);
        o.start(time); o.stop(time + 0.26);
      }
      // arp / pluck
      if (s % 2 === 0) {
        const n = chord.notes[(s / 2) % 4] * 2;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = n;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.055, time + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
        o.connect(g); g.connect(bus);
        o.start(time); o.stop(time + 0.18);
      }
      // pad stab at bar start
      if (s === 0) {
        chord.notes.forEach((n, i) => {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'sine';
          o.frequency.value = n;
          g.gain.setValueAtTime(0.0001, time);
          g.gain.exponentialRampToValueAtTime(0.035, time + 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
          o.connect(g); g.connect(bus);
          o.start(time); o.stop(time + 1.15);
        });
      }
    }
  }

  MR.AudioEngine = AudioEngine;
})();
