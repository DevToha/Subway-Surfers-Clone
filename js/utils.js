/* ============================================================
   METRO RUSH 3D — helpers
   ============================================================ */
window.MR = window.MR || {};

(function () {
  'use strict';

  const U = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** frame-rate independent exponential smoothing */
    damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
    easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; },
    store: {
      get(key, fallback) {
        try {
          const raw = localStorage.getItem('metrorush3d.' + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem('metrorush3d.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
      }
    }
  };

  MR.Utils = U;

  /* ------------------------------------------------------------
     Procedural canvas textures (no external assets)
     ------------------------------------------------------------ */
  const T = {};

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function toTexture(canvas, repeatX, repeatY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** dark ballast with sleepers — one tile spans 4 x 8 world units */
  T.ballast = function () {
    const c = makeCanvas(256, 512), x = c.getContext('2d');
    x.fillStyle = '#2b2c38'; x.fillRect(0, 0, 256, 512);
    // gravel speckle
    for (let i = 0; i < 5200; i++) {
      const g = 46 + Math.random() * 52;
      x.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 8) + ',' + (0.25 + Math.random() * 0.55) + ')';
      const s = 1 + Math.random() * 2.6;
      x.fillRect(Math.random() * 256, Math.random() * 512, s, s);
    }
    // sleepers (perpendicular to travel = horizontal bands)
    for (let i = 0; i < 8; i++) {
      const y = i * 64 + 10;
      x.fillStyle = '#3d3226';
      x.fillRect(0, y, 256, 20);
      x.fillStyle = 'rgba(150,122,90,.38)';
      x.fillRect(0, y, 256, 3);
      x.fillStyle = 'rgba(0,0,0,.35)';
      x.fillRect(0, y + 17, 256, 4);
    }
    // oil stain down the middle of each track
    const grad = x.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad; x.fillRect(0, 0, 256, 512);
    return toTexture(c, 1, 1);
  };

  /** station platform tiles */
  T.platform = function () {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#cfc7b6'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const g = 196 + Math.random() * 26;
        x.fillStyle = 'rgb(' + g + ',' + (g - 8) + ',' + (g - 24) + ')';
        x.fillRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
      }
    }
    x.strokeStyle = 'rgba(90,84,74,.35)'; x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke();
    }
    return toTexture(c, 1, 1);
  };

  /** city building facade with lit windows */
  T.facade = function (hue) {
    const c = makeCanvas(128, 256), x = c.getContext('2d');
    x.fillStyle = '#141a2e'; x.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 8; col++) {
        const lit = Math.random();
        let color;
        if (lit > 0.62) color = hue === 0 ? '#ffd98a' : (hue === 1 ? '#9ff4ff' : '#ffb3d8');
        else if (lit > 0.5) color = 'rgba(120,150,190,.32)';
        else color = 'rgba(40,52,80,.7)';
        x.fillStyle = color;
        x.fillRect(col * 16 + 3, row * 16 + 4, 9, 8);
      }
    }
    // structural mullions
    x.fillStyle = 'rgba(6,9,18,.9)';
    for (let col = 0; col < 8; col++) x.fillRect(col * 16, 0, 2, 256);
    for (let row = 0; row < 16; row++) x.fillRect(0, row * 16, 128, 2);
    return toTexture(c, 1, 1);
  };

  /** hazard stripes */
  T.hazard = function () {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#ffc93c'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#15161c';
    x.save(); x.translate(0, 0); x.rotate(-Math.PI / 4);
    for (let i = -6; i < 12; i++) x.fillRect(i * 32, -160, 16, 320);
    x.restore();
    return toTexture(c, 1, 1);
  };

  /** soft radial glow sprite */
  T.glow = function () {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,.72)');
    g.addColorStop(0.55, 'rgba(255,255,255,.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /** station name board */
  T.sign = function (title, sub, accent) {
    const c = makeCanvas(512, 160), x = c.getContext('2d');
    x.fillStyle = '#0b1222'; x.fillRect(0, 0, 512, 160);
    x.fillStyle = accent || '#25e5ff';
    x.fillRect(0, 0, 512, 8);
    x.fillRect(0, 152, 512, 8);
    x.fillStyle = '#ffffff';
    x.font = '900 58px Orbitron, Arial Black, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(title, 256, 70);
    x.fillStyle = accent || '#25e5ff';
    x.font = '700 26px Rajdhani, Arial, sans-serif';
    x.fillText(sub, 256, 122);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  /** in-world advertising poster (original METRO RUSH branding) */
  T.poster = function (o) {
    const c = makeCanvas(512, 320), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 320);
    g.addColorStop(0, o.c1); g.addColorStop(1, o.c2);
    x.fillStyle = g; x.fillRect(0, 0, 512, 320);

    x.save();
    x.globalAlpha = 0.14;
    x.fillStyle = '#ffffff';
    for (let i = -6; i < 16; i++) {
      x.save();
      x.translate(i * 48, 0);
      x.rotate(-0.32);
      x.fillRect(0, -100, 16, 560);
      x.restore();
    }
    x.restore();

    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(0, 0, 512, 320);

    x.textAlign = 'center';
    x.fillStyle = '#ffffff';
    x.font = '900 62px Orbitron, Arial Black, sans-serif';
    x.fillText(o.title, 256, 138);

    x.fillStyle = o.accent;
    x.font = '700 26px Rajdhani, Arial, sans-serif';
    x.fillText(o.sub, 256, 186);

    x.fillStyle = o.accent;
    x.fillRect(196, 214, 120, 4);
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.font = '600 20px Rajdhani, Arial, sans-serif';
    x.fillText(o.tag, 256, 262);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  MR.Textures = T;

  /* ------------------------------------------------------------
     Merge many transformed geometries into one BufferGeometry.
     Big win: a whole station chunk collapses to ~15 draw calls.
     ------------------------------------------------------------ */
  const _nMat = new THREE.Matrix3();
  const _vec = new THREE.Vector3();

  MR.mergeGeometries = function (entries) {
    let vTotal = 0, iTotal = 0;
    for (let i = 0; i < entries.length; i++) {
      const g = entries[i].geo;
      vTotal += g.attributes.position.count;
      iTotal += g.index ? g.index.count : g.attributes.position.count;
    }

    const pos = new Float32Array(vTotal * 3);
    const nor = new Float32Array(vTotal * 3);
    const uv = new Float32Array(vTotal * 2);
    const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);

    let vo = 0, io = 0;
    for (let e = 0; e < entries.length; e++) {
      const g = entries[e].geo;
      const m = entries[e].matrix;
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const u = g.attributes.uv;
      _nMat.getNormalMatrix(m);

      for (let i = 0; i < p.count; i++) {
        _vec.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
        pos[(vo + i) * 3] = _vec.x;
        pos[(vo + i) * 3 + 1] = _vec.y;
        pos[(vo + i) * 3 + 2] = _vec.z;

        if (n) {
          _vec.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_nMat).normalize();
          nor[(vo + i) * 3] = _vec.x;
          nor[(vo + i) * 3 + 1] = _vec.y;
          nor[(vo + i) * 3 + 2] = _vec.z;
        }
        if (u) {
          uv[(vo + i) * 2] = u.getX(i);
          uv[(vo + i) * 2 + 1] = u.getY(i);
        }
      }

      if (g.index) {
        for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
        io += g.index.count;
      } else {
        for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
        io += p.count;
      }
      vo += p.count;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  };
})();
