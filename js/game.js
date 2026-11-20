/* ============================================================
   METRO RUSH 3D — game controller
   ============================================================ */
(function () {
  'use strict';

  const U = MR.Utils;
  const BASE_SPEED = 19;
  const MAX_SPEED = 47;
  const SPEED_RAMP = 0.0125;      // per metre
  const BOOST_MULT = 1.55;
  const BOOST_TIME = 5.5;
  const MAGNET_TIME = 8.0;
  const START_GRACE = 1.1;
  const FORCE_HQ = /[?&]hq=1/.test(location.search);

  const $ = function (id) { return document.getElementById(id); };

  class Game {
    constructor() {
      this.canvas = $('game-canvas');
      this.state = 'boot';
      this.time = 0;
      this.last = 0;
      this.acc = 0;

      this.score = 0;
      this.meters = 0;
      this.coins = 0;
      this.powerupCount = 0;
      this.speed = BASE_SPEED;
      this.distance = 0;
      this.boost = 0;
      this.magnet = 0;
      this.shake = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.crashT = 0;
      this.startT = 0;

      this.best = U.store.get('best', { score: 0, coins: 0, meters: 0 });
      this.audio = new MR.AudioEngine();
      this.soundOn = this.audio.enabled;

      this._initRenderer();
      this._initScene();
      this._initCamera();

      this.world = new MR.World(this.scene, this.renderer);
      this.player = new MR.Player(this.scene);
      this.chase = new MR.Chase(this.scene);
      this.particles = new MR.Particles(this.scene, 260);

      this.heat = 0.45;          // 0 = escaped, 1 = caught
      this.stumbleT = 0;
      this._sirenT = 0;

      this._initUI();
      this._initInput();
      this._applySoundState();

      this._perfAccum = 0;
      this._perfFrames = 0;
      this._perfTimer = 0;

      this._loop = this._loop.bind(this);
      this.last = performance.now();
      requestAnimationFrame(this._loop);

      this._boot();
    }

    /* ============================================================
       renderer / scene
       ============================================================ */
    /** reads the GPU name; software rasterizers (SwiftShader / llvmpipe) get a lite profile */
    _detectGPU() {
      let name = '';
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        }
      } catch (e) { /* ignore */ }
      return name;
    }

    _initRenderer() {
      const gpu = this._detectGPU();
      const soft = /swiftshader|llvmpipe|softpipe|software rasterizer|basic render/i.test(gpu);
      const lite = soft || /[?&]lite=1/.test(location.search);
      const hq = FORCE_HQ;

      // 2 = full, 1 = no shadows, 0 = no shadows + low resolution
      this.quality = hq ? 2 : (lite ? 0 : 2);
      this._dprCap = this.quality === 0 ? 0.7 : 2;
      this.gpuName = gpu;

      const r = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: this.quality !== 0,
        powerPreference: 'high-performance',
        stencil: false
      });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._dprCap));
      r.setSize(window.innerWidth, window.innerHeight, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.08;
      r.shadowMap.enabled = this.quality === 2;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer = r;
    }

    _initScene() {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x3b2350, 55, 235);
      this.scene = scene;

      /* ---- sky dome ---- */
      const skyGeo = new THREE.SphereGeometry(420, 32, 20);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          c0: { value: new THREE.Color(0x05060f) },
          c1: { value: new THREE.Color(0x241a4d) },
          c2: { value: new THREE.Color(0x8c3b7a) },
          c3: { value: new THREE.Color(0xff9a5c) }
        },
        vertexShader: [
          'varying vec3 vP;',
          'void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;',
          'varying vec3 vP;',
          'void main(){',
          '  float h = normalize(vP).y;',
          '  vec3 col = mix(c3, c2, smoothstep(-0.04, 0.20, h));',
          '  col = mix(col, c1, smoothstep(0.14, 0.52, h));',
          '  col = mix(col, c0, smoothstep(0.46, 1.0, h));',
          '  gl_FragColor = vec4(col, 1.0);',
          '}'
        ].join('\n')
      });
      const sky = new THREE.Mesh(skyGeo, skyMat);
      sky.frustumCulled = false;
      scene.add(sky);

      /* ---- stars ---- */
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(260 * 3);
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2;
        const el = 0.18 + Math.random() * 0.8;
        const r = 390;
        starPos[i * 3] = Math.cos(a) * Math.cos(el) * r;
        starPos[i * 3 + 1] = Math.sin(el) * r;
        starPos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xdfefff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false
      }));
      scene.add(stars);

      /* ---- moon ---- */
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: MR.Textures.glow(), color: 0xffe6c0, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9
      }));
      moon.scale.set(70, 70, 1);
      moon.position.set(-120, 96, -300);
      scene.add(moon);

      /* ---- lights ---- */
      const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x241a2e, 1.25);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xffd2a8, 2.35);
      key.position.set(16, 26, 12);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 90;
      key.shadow.camera.left = -24;
      key.shadow.camera.right = 24;
      key.shadow.camera.top = 24;
      key.shadow.camera.bottom = -24;
      key.shadow.bias = -0.0007;
      key.shadow.normalBias = 0.03;
      scene.add(key);
      scene.add(key.target);
      this.keyLight = key;

      const fill = new THREE.DirectionalLight(0x35d6ff, 0.75);
      fill.position.set(-14, 9, -18);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xff3d8b, 0.5);
      rim.position.set(6, 5, -30);
      scene.add(rim);

      /* ---- cheap environment reflections for metals ---- */
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const envScene = new THREE.Scene();
        const envSky = new THREE.Mesh(
          new THREE.SphereGeometry(10, 16, 12),
          new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x2a2048 })
        );
        envScene.add(envSky);
        const band1 = new THREE.Mesh(new THREE.SphereGeometry(9.6, 16, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), new THREE.MeshBasicMaterial({ color: 0xff8a5c, side: THREE.BackSide }));
        envScene.add(band1);
        const band2 = new THREE.Mesh(new THREE.SphereGeometry(9.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.2), new THREE.MeshBasicMaterial({ color: 0x0a0c1c, side: THREE.BackSide }));
        envScene.add(band2);
        const envTex = pmrem.fromScene(envScene, 0.05).texture;
        scene.environment = envTex;
        pmrem.dispose();
      } catch (e) { /* environment is optional */ }
    }

    _initCamera() {
      this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
      this.camera.position.set(0, 4.6, 9.4);
      this.camera.lookAt(0, 1.5, -8);
      this.camPos = this.camera.position.clone();
      this.camLook = new THREE.Vector3(0, 1.5, -8);
      this.camFov = 62;
      this.menuCamT = 0;
    }

    /* ============================================================
       UI wiring
       ============================================================ */
    _initUI() {
      this.el = {
        hud: $('hud'),
        score: $('hud-score'),
        coins: $('hud-coins'),
        dist: $('hud-dist'),
        best: $('hud-best'),
        mult: $('hud-mult'),
        menu: $('screen-menu'),
        menuBest: $('menu-best'),
        menuCoins: $('menu-coins'),
        howto: $('screen-howto'),
        pause: $('screen-pause'),
        over: $('screen-over'),
        overScore: $('over-score'),
        overDist: $('over-dist'),
        overCoins: $('over-coins'),
        overBest: $('over-best'),
        overNew: $('over-newbest'),
        overCause: $('over-cause'),
        boot: $('boot'),
        bootFill: $('boot-fill'),
        bootMsg: $('boot-msg'),
        speedlines: $('speedlines'),
        flash: $('flash'),
        go: $('go-flash'),
        powerups: $('hud-powerups'),
        chase: $('hud-chase'),
        chaseFill: $('hud-chase-fill'),
        danger: $('danger'),
        caught: $('caught'),
        soundLabel: $('sound-label')
      };

      this.el.best.textContent = U.fmt(this.best.score);
      this.el.menuBest.textContent = U.fmt(this.best.score);
      this.el.menuCoins.textContent = U.fmt(this.best.coins);

      const self = this;
      const click = function (id, fn) {
        const el = $(id);
        if (!el) return;
        el.addEventListener('click', function (e) {
          e.preventDefault();
          self.audio.init();
          self.audio.click();
          fn();
        });
      };

      click('btn-play', function () { self.startRun(); });
      click('btn-howto', function () { self.el.howto.classList.remove('is-hidden'); });
      click('btn-howto-close', function () { self.el.howto.classList.add('is-hidden'); });
      click('btn-sound', function () { self.toggleSound(); });
      click('btn-sound2', function () { self.toggleSound(); });
      click('btn-pause', function () { self.pause(); });
      click('btn-resume', function () { self.resume(); });
      click('btn-restart', function () { self.startRun(); });
      click('btn-restart-pause', function () { self.startRun(); });
      click('btn-menu', function () { self.toMenu(); });
      click('btn-menu-pause', function () { self.toMenu(); });

      this.el.howto.addEventListener('click', function (e) {
        if (e.target === self.el.howto) self.el.howto.classList.add('is-hidden');
      });

      // power-up pills
      this.pills = {};
      ['magnet', 'turbo'].forEach(function (type) {
        const div = document.createElement('div');
        div.className = 'power power--' + type + ' is-hidden';
        const icon = type === 'magnet'
          ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 4v9a6 6 0 0012 0V4h-4v9a2 2 0 01-4 0V4H6z" fill="currentColor"/><rect x="6" y="2" width="4" height="3" fill="#fff"/><rect x="14" y="2" width="4" height="3" fill="#fff"/></svg>'
          : '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/></svg>';
        div.innerHTML =
          '<span class="power__dot">' + icon + '</span>' +
          '<span class="power__meta">' +
          '<span class="power__name">' + (type === 'magnet' ? 'MAGNET' : 'TURBO') + '</span>' +
          '<span class="power__bar"><i></i></span>' +
          '</span>';
        self.el.powerups.appendChild(div);
        self.pills[type] = { root: div, bar: div.querySelector('.power__bar i') };
      });
    }

    _applySoundState() {
      document.body.classList.toggle('is-muted', !this.soundOn);
      if (this.el.soundLabel) this.el.soundLabel.textContent = this.soundOn ? 'SOUND ON' : 'SOUND OFF';
      this.audio.setEnabled(this.soundOn);
    }

    toggleSound() {
      this.soundOn = !this.soundOn;
      this._applySoundState();
      if (this.soundOn) {
        this.audio.init();
        this.audio.resume();
        if (this.state === 'playing') this.audio.startMusic();
      }
      this.audio.click();
    }

    /* ============================================================
       input
       ============================================================ */
    _initInput() {
      const self = this;

      window.addEventListener('keydown', function (e) {
        const code = e.code;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(code) >= 0) e.preventDefault();

        if (code === 'KeyM') { self.toggleSound(); return; }
        if (code === 'Enter') {
          if (self.state === 'menu') { self.audio.init(); self.startRun(); }
          else if (self.state === 'gameover') { self.startRun(); }
          return;
        }
        if (code === 'KeyP' || code === 'Escape') {
          if (self.state === 'playing') self.pause();
          else if (self.state === 'paused') self.resume();
          return;
        }
        if (self.state !== 'playing') return;
        if (e.repeat) return;

        if (code === 'ArrowLeft' || code === 'KeyA') self.inputLeft();
        else if (code === 'ArrowRight' || code === 'KeyD') self.inputRight();
        else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') self.inputJump();
        else if (code === 'ArrowDown' || code === 'KeyS') self.inputSlide();
      }, { passive: false });

      /* ---- touch ---- */
      let tx = 0, ty = 0, tt = 0, tracking = false;
      const THRESH = 26;

      this.canvas.addEventListener('touchstart', function (e) {
        if (self.state !== 'playing') return;
        const t = e.changedTouches[0];
        tx = t.clientX; ty = t.clientY; tt = performance.now();
        tracking = true;
        e.preventDefault();
      }, { passive: false });

      this.canvas.addEventListener('touchmove', function (e) {
        if (tracking) e.preventDefault();
      }, { passive: false });

      this.canvas.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - tx;
        const dy = t.clientY - ty;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (Math.max(adx, ady) < THRESH) {
          if (performance.now() - tt < 320) self.inputJump();
          return;
        }
        if (adx > ady) {
          if (dx > 0) self.inputRight(); else self.inputLeft();
        } else {
          if (dy < 0) self.inputJump(); else self.inputSlide();
        }
        e.preventDefault();
      }, { passive: false });

      /* ---- mouse drag (desktop parity) ---- */
      let mx = 0, my = 0, down = false;
      this.canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse') return;
        mx = e.clientX; my = e.clientY; down = true;
      });
      this.canvas.addEventListener('pointerup', function (e) {
        if (e.pointerType !== 'mouse' || !down) return;
        down = false;
        if (self.state !== 'playing') return;
        const dx = e.clientX - mx, dy = e.clientY - my;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
        if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? self.inputRight() : self.inputLeft(); }
        else { dy < 0 ? self.inputJump() : self.inputSlide(); }
      });

      window.addEventListener('resize', function () { self.resize(); });
      window.addEventListener('orientationchange', function () { setTimeout(function () { self.resize(); }, 120); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && self.state === 'playing') self.pause();
      });
    }

    inputLeft() {
      if (this.player.moveLeft()) {
        this.audio.lane();
        this.particles.burst({ x: this.player.x, y: 0.12, z: 0.2 }, { count: 5, colors: [0x9fe8ff], speed: 2.4, size: 0.1, life: 0.35, gravity: -4 });
      }
    }

    inputRight() {
      if (this.player.moveRight()) {
        this.audio.lane();
        this.particles.burst({ x: this.player.x, y: 0.12, z: 0.2 }, { count: 5, colors: [0x9fe8ff], speed: 2.4, size: 0.1, life: 0.35, gravity: -4 });
      }
    }

    inputJump() {
      if (this.player.jump()) {
        this.audio.jump();
        this.particles.burst({ x: this.player.x, y: 0.06, z: 0 }, { count: 7, colors: [0xcfd8ff, 0x8fa8d8], speed: 2.8, size: 0.08, life: 0.3, gravity: -9, up: 0.5 });
      }
    }

    inputSlide() {
      if (this.player.slide()) {
        this.audio.slide();
        this.particles.burst({ x: this.player.x, y: 0.08, z: 0 }, { count: 8, colors: [0xffd08a, 0xfff3d0], speed: 2.8, size: 0.09, life: 0.32, gravity: -6, up: 0.4 });
      }
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, this._dprCap || 2);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camFov = this._fovBase();
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    /* ============================================================
       state transitions
       ============================================================ */
    _boot() {
      const self = this;
      const steps = [
        [12, 'Laying track…'],
        [38, 'Welding the rails…'],
        [62, 'Lighting the city…'],
        [86, 'Waking up Nova…'],
        [100, 'Ready to run']
      ];
      let i = 0;
      const advance = function () {
        if (i < steps.length) {
          self.el.bootMsg.textContent = steps[i][1];
          self.el.bootFill.style.width = steps[i][0] + '%';
          i++;
          setTimeout(advance, i === 1 ? 220 : 170);
        } else {
          self.el.boot.classList.add('is-done');
          self.state = 'menu';
          self._syncMenuScores();
          self._orbitMenuCam(0.016, true);
        }
      };
      setTimeout(advance, 120);
    }

    startRun() {
      this.audio.init();
      this.audio.resume();

      this.el.menu.classList.add('is-hidden');
      this.el.over.classList.add('is-hidden');
      this.el.pause.classList.add('is-hidden');
      this.el.howto.classList.add('is-hidden');
      this.el.hud.classList.remove('is-hidden');

      this.world.reset();
      this.player.reset();
      this.particles.reset();
      this.chase.start();

      this.heat = 0.45;
      this.stumbleT = 0;
      this._sirenT = 0;
      this.el.chase.classList.add('is-live');
      this.el.chase.classList.remove('is-pressed', 'is-caught');
      this.el.danger.classList.remove('is-on');
      this.el.caught.classList.remove('is-on');
      this._syncChaseUI();

      this.score = 0;
      this.meters = 0;
      this.coins = 0;
      this.powerupCount = 0;
      this.distance = 0;
      this.speed = 0;
      this.boost = 0;
      this.magnet = 0;
      this.combo = 0;
      this.shake = 0;
      this._lastHit = null;
      this.crashT = 0;
      this.startT = START_GRACE;
      this.state = 'playing';

      this.el.speedlines.classList.remove('is-on');
      this.el.flash.classList.remove('is-hit');
      this._updatePowerPills();

      this.el.go.classList.remove('is-on');
      void this.el.go.offsetWidth;
      this.el.go.classList.add('is-on');

      this.audio.startMusic();
      this.audio.duck(false);
      this.audio.whistle();
      this._updateHUD(true);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.el.pause.classList.remove('is-hidden');
      this.audio.duck(true);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.el.pause.classList.add('is-hidden');
      this.audio.duck(false);
      this.last = performance.now();
    }

    toMenu() {
      this.state = 'menu';
      this.el.pause.classList.add('is-hidden');
      this.el.over.classList.add('is-hidden');
      this.el.hud.classList.add('is-hidden');
      this.el.menu.classList.remove('is-hidden');
      this.el.speedlines.classList.remove('is-on');
      this.world.reset();
      this.player.reset();
      this.player.state = 'idle';
      this.chase.reset();
      this.el.chase.classList.remove('is-live', 'is-pressed', 'is-caught');
      this.el.danger.classList.remove('is-on');
      this._syncMenuScores();
      this.audio.stopMusic(0.4);
      this.audio.duck(false);
      this.speed = 7;
    }

    gameOver() {
      if (this.state === 'dying') return;
      this.state = 'dying';
      this.crashT = 0;
      this.player.kill();
      this.boost = 0;
      this.magnet = 0;
      this.el.speedlines.classList.remove('is-on');
      this.el.flash.classList.remove('is-hit');
      void this.el.flash.offsetWidth;
      this.el.flash.classList.add('is-hit');
      this.shake = 1.2;
      this.audio.crash();
      this.audio.stopMusic(0.25);

      // the unit closes in for the tag
      this.chase.beginCatch();
      this.audio.whistle();
      this.el.chase.classList.add('is-caught');
      this._tagged = false;

      const p = this.player;
      this.particles.burst({ x: p.x, y: 0.9, z: -0.2 }, {
        count: 26, colors: [0xffc93c, 0xff5c5c, 0xffffff, 0x25e5ff],
        speed: 7, size: 0.16, life: 0.9, gravity: -16, jitter: 0.6
      });
      this._pendingBest = this._commitBest();
    }

    _commitBest() {
      const score = this._finalScore();
      const prev = this.best || { score: 0, coins: 0, meters: 0 };
      const isNew = score > prev.score;
      const next = {
        score: Math.max(prev.score, score),
        coins: prev.coins + this.coins,
        meters: Math.max(prev.meters, Math.floor(this.meters))
      };
      this.best = next;
      U.store.set('best', next);
      return isNew;
    }

    _finalScore() {
      return Math.floor(this.score) + this.coins * 10 + this.powerupCount * 50;
    }

    _showGameOver() {
      this.state = 'gameover';
      const score = this._finalScore();
      this.el.overScore.textContent = U.fmt(score);
      this.el.overDist.textContent = U.fmt(this.meters) + ' m';
      this.el.overCoins.textContent = U.fmt(this.coins);
      this.el.overBest.textContent = U.fmt(this.best.score);
      this.el.overNew.classList.toggle('is-hidden', !this._pendingBest);

      let cause = 'You met a train. It did not move.';
      if (this._lastHit) {
        if (this._lastHit === 'barrier') cause = 'Clipped a barrier at full speed.';
        else if (this._lastHit === 'overhead') cause = 'That sign was lower than it looked.';
        else if (this._lastHit === 'block') cause = 'Solid concrete always wins.';
      }
      this.el.overCause.textContent = cause;

      this.el.over.classList.remove('is-hidden');
      this.el.hud.classList.add('is-hidden');
      this.el.chase.classList.remove('is-live');
      this.el.danger.classList.remove('is-on');
      this.el.caught.classList.remove('is-on');
      this._syncMenuScores();
      this.audio.click();
    }

    _syncMenuScores() {
      this.el.menuBest.textContent = U.fmt(this.best.score);
      this.el.menuCoins.textContent = U.fmt(this.best.coins);
      this.el.best.textContent = U.fmt(this.best.score);
    }

    /* ============================================================
       main loop
       ============================================================ */
    _loop(now) {
      requestAnimationFrame(this._loop);
      let raw = (now - this.last) / 1000;
      this.last = now;
      if (!isFinite(raw) || raw < 0) raw = 0.016;
      const dt = Math.min(raw, 0.05);

      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      if (raw < 0.4) this._watchPerformance(raw);
    }

    /** drops shadows / resolution on devices that can't hold a smooth frame rate */
    _watchPerformance(dt) {
      if (FORCE_HQ || this.quality === 0) return;
      this._perfAccum += dt;
      this._perfFrames++;
      this._perfTimer += dt;
      if (this._perfTimer < 5) return;

      const avg = this._perfAccum / Math.max(1, this._perfFrames);
      this._perfTimer = 0;
      this._perfAccum = 0;
      this._perfFrames = 0;

      if (avg > 1 / 26) {
        if (this.quality === 2) {
          this.quality = 1;
          this.renderer.shadowMap.enabled = false;
          this.scene.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
        } else {
          this.quality = 0;
          this._dprCap = 0.7;
          this.resize();
        }
      }
    }

    update(dt) {
      this.time += dt;
      const p = this.player;

      switch (this.state) {
        case 'menu':
          this.speed = U.damp(this.speed, 7.5, 2, dt);
          this.world.update(dt, this.speed, true);
          p.state = 'run';
          p.update(dt, this.speed);
          this._orbitMenuCam(dt);
          this._updateLights(dt);
          break;

        case 'playing':
          this._updatePlaying(dt);
          break;

        case 'paused':
          break;

        case 'dying':
          this.crashT += dt;
          if (!this._tagged && this.crashT > 1.0) {
            this._tagged = true;
            this._captureTag();
          }
          this.speed = U.damp(this.speed, 0, 4.5, dt);
          this.world.update(dt, this.speed, true);
          p.update(dt, this.speed);
          this._updateChase(dt);
          this._deathCam(dt);
          this.particles.update(dt);
          this._updateLights(dt);
          if (this.crashT > 1.95) this._showGameOver();
          break;

        case 'gameover':
          this.speed = U.damp(this.speed, 0, 3, dt);
          this.world.update(dt, this.speed, true);
          p.update(dt, 0);
          this._updateChase(dt);
          this._deathCam(dt);
          this.particles.update(dt);
          this._updateLights(dt);
          break;

        default:
          break;
      }

      this.particles.update(dt);
    }

    _updatePlaying(dt) {
      const p = this.player;

      // intro grace: ramp up
      if (this.startT > 0) {
        this.startT -= dt;
        this.speed = U.lerp(0, BASE_SPEED, U.clamp(1 - this.startT / START_GRACE, 0, 1));
      } else {
        const target = Math.min(MAX_SPEED, BASE_SPEED + this.meters * SPEED_RAMP);
        this.speed = U.damp(this.speed, target * (this.boost > 0 ? BOOST_MULT : 1), 3.5, dt);
      }

      // power-up timers
      if (this.boost > 0) {
        this.boost -= dt;
        if (this.boost <= 0) { this.boost = 0; this.el.speedlines.classList.remove('is-on'); }
      }
      if (this.magnet > 0) {
        this.magnet -= dt;
        if (this.magnet <= 0) this.magnet = 0;
      }
      p.boost = this.boost;
      p.magnet = this.magnet;

      // world scroll (a stumble costs a little ground)
      if (this.stumbleT > 0) this.stumbleT = Math.max(0, this.stumbleT - dt);
      const stumbleK = this.stumbleT > 0 ? 0.86 : 1;
      const dz = this.speed * dt * stumbleK;
      this.world.update(dt, this.speed, false);

      p.update(dt, this.speed);

      // scoring
      const mult = this.boost > 0 ? 2 : 1;
      this.meters += dz * 0.5;
      this.score += dz * 0.5 * mult;
      this.distance += dz;

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      this._collectCoins(dt);
      this._collectPowerups();
      this._checkObstacles();
      this._updateChase(dt);
      this._updateCamera(dt);
      this._updateLights(dt);
      this._updateHUD();
      this._updatePowerPills();

      // trailing dust while running
      if (p.onGround && !p.sliding && Math.random() < dt * 18) {
        this.particles.burst({ x: p.x + (Math.random() - 0.5) * 0.4, y: 0.05, z: 0.4 }, {
          count: 1, colors: [0x7f93bb, 0x4a5678], speed: 1.3, size: 0.055, life: 0.3, gravity: -2, up: 0.4
        });
      }
      if (this.boost > 0 && Math.random() < dt * 40) {
        this.particles.burst({ x: p.x + (Math.random() - 0.5) * 0.6, y: 0.6 + Math.random() * 0.9, z: 0.5 }, {
          count: 1, colors: [0x25e5ff, 0x9ff8ff], speed: 2.5, size: 0.13, life: 0.45, gravity: 2, up: 0.6
        });
      }
    }

    /* ---------------- pickups ---------------- */
    _collectCoins(dt) {
      const p = this.player;
      const magnetR = 7.5;
      const chestY = p.y + 0.85;

      for (let i = 0; i < this.world.coinPool.length; i++) {
        const c = this.world.coinPool[i];
        if (!c.active) continue;

        // magnet attraction
        if (this.magnet > 0 && c.z > -magnetR - 6 && c.z < 4 && Math.abs(c.x - p.x) < magnetR) {
          c.magnet = true;
          const dx = p.x - c.x, dy = chestY - c.y, dz = 0 - c.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const pull = Math.min(1, dt * (7 + 26 / Math.max(1, dist)));
          c.x += dx * pull;
          c.y += dy * pull;
          c.z += dz * pull;
        } else if (c.magnet) {
          c.magnet = false;
        }

        const dx = Math.abs(c.x - p.x);
        const dy = Math.abs(c.y - chestY);
        const zPrev = (c.pz === undefined ? c.z : c.pz);
        if (dx < 0.98 && dy < 1.2 && zPrev <= 0.98 && c.z >= -0.98) {
          c.active = false;
          this.coins++;
          this.combo++;
          this.comboTimer = 1.4;
          this.score += 0;
          this.audio.coin(Math.min(12, this.combo));
          this.particles.burst({ x: c.x, y: c.y, z: c.z }, {
            count: 6, colors: [0xffd23f, 0xfff3b0, 0xffffff], speed: 3.0, size: 0.085, life: 0.36, gravity: -6
          });
        }
      }
    }

    _collectPowerups() {
      const p = this.player;
      const chestY = p.y + 0.9;
      for (let i = this.world.powerups.length - 1; i >= 0; i--) {
        const pw = this.world.powerups[i];
        if (!pw.active) continue;
        if (Math.abs(pw.z) < 1.25 && Math.abs(pw.x - p.x) < 1.2 && Math.abs(pw.y - chestY) < 2.0) {
          pw.active = false;
          pw.group.visible = false;
          pw.group.position.set(0, -999, 0);
          if (!this.world.pools[pw.type]) this.world.pools[pw.type] = [];
          this.world.pools[pw.type].push(pw.group);
          this.world.powerups.splice(i, 1);

          this.powerupCount++;
          this.audio.powerup();
          this.particles.burst({ x: pw.x, y: pw.y, z: pw.z }, {
            count: 20, colors: pw.type === 'magnet' ? [0xff2e88, 0xff9ccb, 0xffffff] : [0x25e5ff, 0x9ff8ff, 0xffffff],
            speed: 5.5, size: 0.14, life: 0.7, gravity: -8
          });

          if (pw.type === 'magnet') {
            this.magnet = MAGNET_TIME;
            this.heat = U.clamp(this.heat - 0.14, 0, 0.96);
            this._toast('MAGNET ONLINE');
          } else {
            this.boost = BOOST_TIME;
            this.heat = U.clamp(this.heat - 0.34, 0, 0.96);
            this.el.speedlines.classList.add('is-on');
            this._toast('TURBO ENGAGED');
          }
        }
      }
    }

    _toast(text) {
      // lightweight floating text on the HUD
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-family:var(--font-display);font-weight:900;letter-spacing:.22em;font-size:clamp(14px,2.4vw,22px);color:#eaf8ff;text-shadow:0 0 24px rgba(37,229,255,.9),0 4px 18px rgba(0,0,0,.8);pointer-events:none;transition:opacity .6s ease, transform .6s ease;z-index:12';
      document.getElementById('app').appendChild(el);
      requestAnimationFrame(function () {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%,-140%) scale(1.15)';
      });
      setTimeout(function () { el.remove(); }, 900);
    }

    /* ---------------- pursuit ---------------- */
    _updateChase(dt) {
      const c = this.chase;
      if (!c.active) return;
      const p = this.player;

      if (this.state === 'playing') {
        // clean running lets the gap open again; turbo really shakes them off.
        // raw speed works against you, so the unit creeps back in late in a run
        let heat = this.heat - dt * 0.014;
        if (this.speed > 24) heat += dt * (this.speed - 24) * 0.0016;
        if (this.boost > 0) heat -= dt * 0.20;
        this.heat = U.clamp(heat, 0, 0.96);
        c.setHeat(this.heat);
      }

      c.update(dt, { px: p.x, speed: this.speed, particles: this.particles });
      this._syncChaseUI();

      if (this.state === 'playing') {
        this._sirenT -= dt;
        if (this.heat > 0.66 && this._sirenT <= 0) {
          this.audio.siren();
          this._sirenT = 5.5;
        }
      }
    }

    /** the moment the unit reaches the runner */
    _captureTag() {
      const p = this.player;
      this.audio.bark();
      this.audio.whistle();
      this.shake = Math.max(this.shake, 0.5);
      this.particles.burst({ x: p.x - 0.35, y: 1.05, z: 0.15 }, {
        count: 20, colors: [0x8fd4ff, 0xffffff, 0xffc93c], speed: 4.4, size: 0.1, life: 0.62, gravity: -4
      });
      this.el.caught.classList.add('is-on');
    }

    _syncChaseUI() {
      const h = this.heat;
      this.el.chaseFill.style.transform = 'scaleX(' + Math.max(0.04, h).toFixed(3) + ')';
      this.el.chase.classList.toggle('is-pressed', h > 0.62);
      this.el.chase.classList.toggle('is-caught', this.chase.mode === 'catch');
      const hot = h > 0.74 && this.state === 'playing';
      this.el.danger.classList.toggle('is-on', hot);
    }

    _closeCall(o) {
      this.heat = U.clamp(this.heat + 0.13, 0, 0.96);
      this.chase.stumble();
      this.player.stumble();
      this.stumbleT = 0.38;
      this.score += 15;
      this.shake = Math.max(this.shake, 0.26);
      this.audio.whoosh();
      if (Math.random() < 0.45) this.audio.bark();
      this.particles.burst({ x: (o.x + this.player.x) * 0.5, y: 0.85, z: -0.35 }, {
        count: 5, colors: [0xffd23f, 0xffffff], speed: 3.4, size: 0.07, life: 0.32, gravity: -7
      });
    }

    /* ---------------- collisions ---------------- */
    _checkObstacles() {
      const p = this.player;
      if (!p.alive) return;
      const halfW = p.halfW;
      const halfD = p.halfD;
      const ph = p.height;
      const py0 = p.y;
      const py1 = p.y + ph;

      for (let i = 0; i < this.world.obstacles.length; i++) {
        const o = this.world.obstacles[i];
        if (!o.alive) continue;

        // close call: track how much room the escape actually had
        const latOverlap = Math.abs(o.x - p.x) <= o.w / 2 + halfW;
        if (latOverlap && o.z < 0.4 && o.z > -3.0) {
          const vGap = Math.max(o.y0 - py1, py0 - (o.y0 + o.h));
          if (o._maxGap === undefined || vGap > o._maxGap) o._maxGap = vGap;
        }
        if (!o._passed && o.z - o.d / 2 > 0.7) {
          o._passed = true;
          const gapX = Math.abs(o.x - p.x) - (o.w / 2 + halfW);
          const brushed = gapX > 0 && gapX < 0.5 && (py1 >= o.y0) && (py0 <= o.y0 + o.h);
          const tight = latOverlap && o._maxGap !== undefined && o._maxGap < 0.50;
          if (brushed || tight) this._closeCall(o);
        }

        // swept test on Z: obstacles move fast, never let them tunnel through
        const zPrev = (o.pz === undefined ? o.z : o.pz);
        if (o.z + o.d / 2 < -halfD || zPrev - o.d / 2 > halfD) continue;
        if (Math.abs(o.x - p.x) > o.w / 2 + halfW) continue;
        if (py1 < o.y0 || py0 > o.y0 + o.h) continue;

        if (this.boost > 0) {
          this._smash(o, i);
          i--;
          continue;
        }

        this._lastHit = o.type;
        this.gameOver();
        return;
      }
    }

    _smash(o, index) {
      o.alive = false;
      this.world._release(o);
      this.world.obstacles.splice(index, 1);
      this.audio.smash();
      this.shake = Math.max(this.shake, 0.55);
      this.particles.burst({ x: o.x, y: Math.min(1.6, o.y0 + o.h / 2), z: o.z }, {
        count: o.type === 'train' ? 34 : 18,
        colors: [0xffc93c, 0xff7a3c, 0xffffff, 0x25e5ff],
        speed: o.type === 'train' ? 9 : 6, size: 0.17, life: 0.75, gravity: -14, jitter: 0.8
      });
      this.score += 25;
    }

    /* ---------------- camera ---------------- */
    /** keeps roughly the same horizontal coverage on tall phone screens */
    _fovBase() {
      const a = this.camera.aspect || 1.6;
      const t = U.clamp((1.2 - a) / 0.74, 0, 1);
      return 62 + t * 20;
    }

    _updateCamera(dt) {
      const p = this.player;
      const boostK = this.boost > 0 ? 1 : 0;

      const aspect = this.camera.aspect || 1.6;
      const narrow = U.clamp((1.25 - aspect) / 0.85, 0, 1);

      const targetX = p.x * 0.30;
      const targetY = 3.78 + narrow * 0.35 + p.y * 0.30 + boostK * 0.22;
      const targetZ = 7.05 + boostK * 1.15;

      this.camPos.x = U.damp(this.camPos.x, targetX, 6.5, dt);
      this.camPos.y = U.damp(this.camPos.y, targetY, 5.5, dt);
      this.camPos.z = U.damp(this.camPos.z, targetZ, 4.5, dt);

      const lookX = p.x * 0.55;
      const lookY = 1.24 - narrow * 0.30 + p.y * 0.42;
      this.camLook.x = U.damp(this.camLook.x, lookX, 7, dt);
      this.camLook.y = U.damp(this.camLook.y, lookY, 6, dt);
      this.camLook.z = U.damp(this.camLook.z, -12 + narrow * 2.5, 5, dt);

      const targetFov = this._fovBase() + boostK * 10;
      this.camFov = U.damp(this.camFov, targetFov, 4, dt);
      if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
        this.camera.fov = this.camFov;
        this.camera.updateProjectionMatrix();
      }

      // shake
      let sx = 0, sy = 0;
      if (this.shake > 0.001) {
        this.shake = Math.max(0, this.shake - dt * 2.4);
        const amp = this.shake * 0.55;
        sx = (Math.random() - 0.5) * amp;
        sy = (Math.random() - 0.5) * amp;
      }

      this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
      this.camera.lookAt(this.camLook.x + sx * 0.4, this.camLook.y + sy * 0.4, this.camLook.z);
    }

    _orbitMenuCam(dt, instant) {
      this.menuCamT += dt;
      const t = this.menuCamT;
      const aspect = this.camera.aspect || 1.6;
      const narrow = U.clamp((1.25 - aspect) / 0.85, 0, 1);
      const a = Math.sin(t * 0.22) * 0.5 - 0.30;
      const r = 5.3 - narrow * 0.3;
      const px = 0;
      const x = px + Math.sin(a) * r - 0.55;
      const y = 2.62 + Math.sin(t * 0.5) * 0.10 - narrow * 0.25;
      const z = Math.cos(a) * r + 0.9;
      const lx = px - 2.15 * (1 - narrow * 0.62);
      const ly = 1.28 - narrow * 0.22;
      const lz = -0.6;

      if (instant) {
        this.camPos.set(x, y, z);
        this.camLook.set(lx, ly, lz);
      } else {
        this.camPos.x = U.damp(this.camPos.x, x, 3, dt);
        this.camPos.y = U.damp(this.camPos.y, y, 3, dt);
        this.camPos.z = U.damp(this.camPos.z, z, 3, dt);
        this.camLook.x = U.damp(this.camLook.x, lx, 3, dt);
        this.camLook.y = U.damp(this.camLook.y, ly, 3, dt);
        this.camLook.z = U.damp(this.camLook.z, lz, 3, dt);
      }

      this.camFov = U.damp(this.camFov, this._fovBase() - 7, 2, dt);
      if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
        this.camera.fov = this.camFov;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }

    _deathCam(dt) {
      const p = this.player;
      const k = Math.min(1, this.crashT / 1.1);
      // pushes in and drops low so the unit and the runner fill the frame
      const targetX = p.x + 1.45 * k;
      const targetY = 3.78 - 1.76 * k;
      const targetZ = 7.05 - 3.72 * k;

      this.camPos.x = U.damp(this.camPos.x, targetX, 3.2, dt);
      this.camPos.y = U.damp(this.camPos.y, targetY, 3.2, dt);
      this.camPos.z = U.damp(this.camPos.z, targetZ, 3.2, dt);
      this.camLook.x = U.damp(this.camLook.x, p.x - 0.35, 4, dt);
      this.camLook.y = U.damp(this.camLook.y, 1.02, 4, dt);
      this.camLook.z = U.damp(this.camLook.z, 0.45, 4, dt);

      this.camFov = U.damp(this.camFov, this._fovBase() - 11, 3, dt);
      if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
        this.camera.fov = this.camFov;
        this.camera.updateProjectionMatrix();
      }

      let sx = 0, sy = 0;
      if (this.shake > 0.001) {
        this.shake = Math.max(0, this.shake - dt * 2.4);
        sx = (Math.random() - 0.5) * this.shake * 0.6;
        sy = (Math.random() - 0.5) * this.shake * 0.6;
      }
      this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
      this.camera.lookAt(this.camLook.x, this.camLook.y, this.camLook.z);
    }

    _updateLights(dt) {
      const p = this.player;
      const k = this.keyLight;
      k.position.set(p.x + 16, 26, 12);
      k.target.position.set(p.x * 0.6, 0, -6);
      k.target.updateMatrixWorld();
    }

    /* ---------------- HUD ---------------- */
    _updateHUD(force) {
      const score = this._finalScore();
      const sScore = U.fmt(score);
      if (force || this._lastScoreStr !== sScore) {
        this.el.score.textContent = sScore;
        this._lastScoreStr = sScore;
      }
      const sCoins = U.fmt(this.coins);
      if (force || this._lastCoinStr !== sCoins) {
        this.el.coins.textContent = sCoins;
        this._lastCoinStr = sCoins;
      }
      const sDist = U.fmt(this.meters) + ' m';
      if (force || this._lastDistStr !== sDist) {
        this.el.dist.textContent = sDist;
        this._lastDistStr = sDist;
      }
      const multOn = this.boost > 0;
      this.el.mult.textContent = multOn ? '×2 TURBO' : '';
      this.el.mult.classList.toggle('is-on', multOn);
    }

    _updatePowerPills() {
      const map = { magnet: this.magnet, turbo: this.boost };
      const max = { magnet: MAGNET_TIME, turbo: BOOST_TIME };
      for (const key in this.pills) {
        const v = map[key];
        const pill = this.pills[key];
        if (v > 0) {
          pill.root.classList.remove('is-hidden');
          pill.bar.style.transform = 'scaleX(' + Math.max(0, v / max[key]) + ')';
        } else {
          pill.root.classList.add('is-hidden');
        }
      }
    }
  }

  /* ---------------- boot the game ---------------- */
  function start() {
    try {
      const game = new Game();
      window.MRGame = game;
      window.__MR_READY__ = true;
    } catch (err) {
      console.error('[METRO RUSH] failed to start', err);
      const msg = document.getElementById('boot-msg');
      if (msg) msg.textContent = 'WebGL failed to start: ' + (err && err.message ? err.message : err);
      window.__MR_ERROR__ = String(err && err.stack ? err.stack : err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
