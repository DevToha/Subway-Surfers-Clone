/* ============================================================
   METRO RUSH 3D — procedural world: station, track, trains,
   obstacles, coins, power-ups, endless generation.
   ============================================================ */
(function () {
  'use strict';

  const LANES = [-2.6, 0, 2.6];
  const CHUNK_LEN = 40;
  const CHUNK_COUNT = 8;
  const SPAWN_AHEAD = 170;
  const DESPAWN_Z = 26;
  const MAX_COINS = 170;

  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
  const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _e = new THREE.Euler();

  function box(w, h, d, material) {
    const m = new THREE.Mesh(UNIT_BOX, material);
    m.scale.set(w, h, d);
    return m;
  }


  class ChunkBuilder {
    constructor() { this.map = new Map(); }
    _add(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
      let arr = this.map.get(mat);
      if (!arr) { arr = []; this.map.set(mat, arr); }
      _e.set(rx || 0, ry || 0, rz || 0);
      _q.setFromEuler(_e);
      _v.set(x, y, z);
      _s.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
      arr.push({ geo: geo, matrix: new THREE.Matrix4().compose(_v, _q, _s) });
    }
    box(w, h, d, mat, x, y, z, rx, ry, rz) { this._add(UNIT_BOX, mat, x, y, z, rx, ry, rz, w, h, d); }
    plane(w, h, mat, x, y, z, rx, ry, rz) { this._add(UNIT_PLANE, mat, x, y, z, rx, ry, rz, w, h, 1); }
    build(noShadow) {
      const g = new THREE.Group();
      const skip = noShadow || [];
      this.map.forEach(function (entries, mat) {
        const geo = MR.mergeGeometries(entries);
        const mesh = new THREE.Mesh(geo, mat);
        const flat = mat.isMeshBasicMaterial || skip.indexOf(mat) >= 0;
        mesh.castShadow = !flat;
        mesh.receiveShadow = !mat.isMeshBasicMaterial;
        g.add(mesh);
      });
      return g;
    }
  }

  class World {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.root = new THREE.Group();
      scene.add(this.root);

      this.chunks = [];
      this.obstacles = [];
      this.coins = [];
      this.powerups = [];
      this.pools = {};

      this.row = 0;
      this.corridor = 1;
      this.spawnCursor = -SPAWN_AHEAD;
      this.lastHazardRow = -9;
      this.rowsSinceTrain = 0;
      this.rowsSincePower = 0;
      this.spawnEnabled = true;
      this.coinSpawnEnabled = true;
      this.time = 0;
      this.speedNow = 0;

      this._initAssets();
      this._buildChunks();
      this._initCoinInstances();
      this.reset();
    }

    /* ============================================================
       shared materials & textures
       ============================================================ */
    _initAssets() {
      const T = MR.Textures;
      const ballastTex = T.ballast();
      ballastTex.repeat.set(2.4, 5);

      const platformTex = T.platform();
      platformTex.repeat.set(1.7, 12.5);

      const hazardTex = T.hazard();
      hazardTex.repeat.set(3, 1);

      this.tex = { ballast: ballastTex, platform: platformTex, hazard: hazardTex, glow: T.glow() };

      const M = this.mat = {
        ground: new THREE.MeshStandardMaterial({ color: 0x191b25, roughness: 1, metalness: 0 }),
        ballast: new THREE.MeshStandardMaterial({ map: ballastTex, roughness: 0.92, metalness: 0.08, color: 0xc8ccdd }),
        rail: new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.34, metalness: 0.78, emissive: 0x1b2636, emissiveIntensity: 0.4 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x6d7285, roughness: 0.9, metalness: 0.05, envMapIntensity: 0.35 }),
        concreteDark: new THREE.MeshStandardMaterial({ color: 0x2c3142, roughness: 0.9, metalness: 0.08, envMapIntensity: 0.22 }),
        platform: new THREE.MeshStandardMaterial({ map: platformTex, roughness: 0.9, metalness: 0.04, color: 0x9d978c, envMapIntensity: 0.3 }),
        yellow: new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.5, metalness: 0.1, emissive: 0x6b4b00, emissiveIntensity: 0.55 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x2c3346, roughness: 0.45, metalness: 0.75 }),
        metalLight: new THREE.MeshStandardMaterial({ color: 0x8f9bb3, roughness: 0.35, metalness: 0.8 }),
        neonCyan: new THREE.MeshBasicMaterial({ color: 0x5df3ff, toneMapped: false }),
        neonWarm: new THREE.MeshBasicMaterial({ color: 0xfff0c4, toneMapped: false }),
        ceilingGlow: new THREE.MeshStandardMaterial({ color: 0x14141c, emissive: 0xffd6a2, emissiveIntensity: 1.05, roughness: 1, metalness: 0 }),
        platformNeon: new THREE.MeshBasicMaterial({ color: 0xff2e88, toneMapped: false }),
        neonMagenta: new THREE.MeshBasicMaterial({ color: 0xff5cae, toneMapped: false }),
        hazard: new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.65, metalness: 0.2, emissive: 0x2a1c00, emissiveIntensity: 0.6 }),
        hazardDark: new THREE.MeshStandardMaterial({ color: 0x24262f, roughness: 0.8, metalness: 0.25 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.12, metalness: 0.9, emissive: 0x0a4b63, emissiveIntensity: 0.8 }),
        windowWarm: new THREE.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false }),
        windowCool: new THREE.MeshBasicMaterial({ color: 0x9ff4ff, toneMapped: false }),
        building: new THREE.MeshStandardMaterial({ color: 0x232c46, roughness: 0.9, metalness: 0.05 }),
        silhouette: new THREE.MeshStandardMaterial({ color: 0x0e1224, roughness: 1, metalness: 0 }),
        redLight: new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false }),
        greenLight: new THREE.MeshBasicMaterial({ color: 0x5cff9d, toneMapped: false })
      };

      // facade textures (cached variants)
      this._facades = [];
      for (let i = 0; i < 6; i++) {
        const tex = T.facade(i % 3);
        tex.repeat.set(1.7 + (i % 3) * 0.8, 1.9 + (i % 3) * 0.75);
        this._facades.push(new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.7,
          color: 0xd7e0f2, roughness: 0.88, metalness: 0.05
        }));
      }

      // station sign textures
      this._signs = [
        T.sign('NEO PARK', 'PLATFORM 2  ·  CITY LINE', '#25e5ff'),
        T.sign('CENTRAL', 'PLATFORM 1  ·  EXPRESS', '#ffc93c'),
        T.sign('DOCKSIDE', 'PLATFORM 3  ·  HARBOUR', '#ff5cae'),
        T.sign('ORBIT ST', 'PLATFORM 2  ·  NIGHT LINE', '#9d7bff')
      ];
      this._gantrySign = T.sign('METRO RUSH', 'CITY TRANSIT AUTHORITY', '#25e5ff');
      this._posters = [
        T.poster({ title: 'METRO', sub: 'RUSH 3D', tag: 'RIDE THE NIGHT LINE', c1: '#0b2b46', c2: '#1b0b2e', accent: '#25e5ff' }),
        T.poster({ title: 'NIGHT', sub: 'EXPRESS', tag: 'NO STOPS · NO LIMITS', c1: '#3a0b2a', c2: '#12061c', accent: '#ff2e88' }),
        T.poster({ title: 'CITY', sub: 'LINE 03', tag: 'EVERY 4 MINUTES', c1: '#2a1a06', c2: '#140d04', accent: '#ffc93c' })
      ];
      this._posterMats = this._posters.map(function (tex) {
        return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      });
      this._signMats = this._signs.map(function (tex) {
        return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      });
      this._gantryMat = new THREE.MeshBasicMaterial({ map: this._gantrySign, toneMapped: false });
    }

    /* ============================================================
       environment chunks
       ============================================================ */
    _buildChunks() {
      for (let i = 0; i < CHUNK_COUNT; i++) {
        const g = this._buildChunk(i);
        g.position.z = 40 - i * CHUNK_LEN;
        this.root.add(g);
        this.chunks.push({ group: g, z: g.position.z });
      }
    }

    _buildChunk(index) {
      const M = this.mat;
      const B = new ChunkBuilder();

      /* ---- ground + ballast ---- */
      B.plane(90, CHUNK_LEN, M.ground, 0, -0.03, 0, -Math.PI / 2);
      B.plane(9.6, CHUNK_LEN, M.ballast, 0, 0, 0, -Math.PI / 2);

      /* ---- rails ---- */
      for (let l = 0; l < 3; l++) {
        for (const s of [-1, 1]) {
          B.box(0.13, 0.16, CHUNK_LEN, M.rail, LANES[l] + s * 0.72, 0.09, 0);
        }
      }

      /* ---- platforms + roofs ---- */
      for (const side of [-1, 1]) {
        const px = side * 6.4;

        B.box(5.2, 0.9, CHUNK_LEN, M.concrete, px, 0.45, 0);
        B.plane(5.2, CHUNK_LEN, M.platform, px, 0.918, 0, -Math.PI / 2);
        B.box(0.3, 0.02, CHUNK_LEN, M.yellow, side * 3.95, 0.938, 0);
        B.box(0.06, 0.10, CHUNK_LEN, M.platformNeon, side * 3.82, 0.62, 0);

        // roof canopy (kept high + narrow so the sky stays visible)
        B.box(4.6, 0.26, CHUNK_LEN, M.concreteDark, side * 6.95, 6.45, 0);
        B.box(0.16, 0.42, CHUNK_LEN, M.metal, side * 4.68, 6.32, 0);
        B.box(0.07, 0.11, CHUNK_LEN, M.neonCyan, side * 4.60, 6.10, 0);
        for (let li = -2; li <= 2; li++) {
          B.box(1.05, 0.07, 1.5, M.ceilingGlow, side * 7.35, 6.28, li * 8);
        }

        // pillar + neon + capital
        B.box(0.40, 5.55, 0.40, M.concrete, side * 8.35, 3.68, 0);
        B.box(0.06, 3.2, 0.10, M.neonCyan, side * 8.14, 3.4, 0);
        B.box(0.58, 0.20, 0.58, M.metal, side * 8.35, 6.35, 0);

        // lamp arm
        B.box(0.09, 0.09, 1.25, M.metal, side * 8.35, 5.15, 0);
        B.box(0.52, 0.10, 0.28, M.neonWarm, side * 7.82, 5.10, 0);

        // station sign board
        B.plane(2.6, 0.8, this._signMats[(index + (side > 0 ? 1 : 0)) % this._signMats.length],
          side * 7.30, 3.05, -3, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        B.box(0.06, 2.2, 0.06, M.metalLight, side * 7.34, 2.2, -3);

        // branded billboard
        B.plane(3.4, 2.1, this._posterMats[(index + (side > 0 ? 2 : 0)) % this._posterMats.length],
          side * 8.62, 3.55, 12, 0, side > 0 ? -(Math.PI / 2 - 0.30) : (Math.PI / 2 - 0.30));
        B.box(0.1, 3.0, 0.1, M.metal, side * 8.68, 1.9, 10.4);
        B.box(0.1, 3.0, 0.1, M.metal, side * 8.68, 1.9, 13.6);

        // trackside signal
        B.box(0.10, 1.5, 0.10, M.metal, side * 4.35, 0.75, 8.5);
        B.box(0.22, 0.22, 0.22, side > 0 ? M.redLight : M.greenLight, side * 4.35, 1.55, 8.5);

        // bench
        if ((index + (side > 0 ? 1 : 0)) % 2 === 0) {
          B.box(1.9, 0.13, 0.6, M.metalLight, side * 8.05, 1.40, 6);
          B.box(1.9, 0.5, 0.1, M.metalLight, side * 8.05, 1.66, 6.26);
          B.box(0.1, 0.5, 0.5, M.metal, side * 7.35, 1.15, 6);
          B.box(0.1, 0.5, 0.5, M.metal, side * 8.75, 1.15, 6);
        }

        // vending machine
        B.box(1.0, 1.9, 0.75, M.concreteDark, side * 8.30, 1.85, -18);
        B.box(0.86, 1.5, 0.06, index % 2 ? M.neonCyan : M.neonMagenta, side * 7.90, 1.90, -18);

        /* ---- city buildings ---- */
        for (let b = 0; b < 2; b++) {
          const bw = 8 + Math.random() * 6;
          const bh = 10 + Math.random() * 17;
          const bd = 9 + Math.random() * 7;
          const bx = side * (16.5 + b * 7.5 + Math.random() * 4);
          const bz = (b === 0 ? -11 : 15) + (Math.random() - 0.5) * 7;
          const facade = this._facades[Math.floor(Math.random() * this._facades.length)];

          B.box(bw, bh, bd, facade, bx, bh / 2 - 0.4, bz);
          B.box(bw * 1.04, 0.45, bd * 1.04, M.concreteDark, bx, bh - 0.22, bz);

          if (Math.random() < 0.5) {
            B.box(0.1, 3 + Math.random() * 4, 0.1, M.metalLight, bx, bh + 1.6, bz);
            B.box(0.3, 0.3, 0.3, M.redLight, bx, bh + 3.4, bz);
          }
        }

        // far skyline
        B.box(12 + Math.random() * 12, 28 + Math.random() * 34, 14, M.silhouette,
          side * (40 + Math.random() * 22), 15, (Math.random() - 0.5) * 40);
      }

      /* ---- overhead gantry ---- */
      for (const side of [-1, 1]) {
        B.box(0.5, 7.2, 0.5, M.metal, side * 9.9, 3.6, 0);
        B.box(0.9, 0.18, 0.9, M.concreteDark, side * 9.9, 0.1, 0);
      }
      B.box(20.3, 0.55, 0.6, M.metal, 0, 6.95, 0);
      B.box(19.6, 0.10, 0.12, M.neonCyan, 0, 6.66, 0.30);
      B.box(6.6, 2.2, 0.14, M.metal, 0, 5.62, 0.42);
      B.plane(6.4, 2.0, this._gantryMat, 0, 5.62, 0.56);

      // catenary wires
      for (const x of [-2.6, 0, 2.6]) {
        B.box(0.035, 0.035, CHUNK_LEN, M.metalLight, x, 6.45, 0);
      }

      return B.build([M.ground, M.ballast, M.neonCyan, M.neonWarm, M.neonMagenta, M.platformNeon]);
    }

    /* ============================================================
       coins (single InstancedMesh = 1 draw call)
       ============================================================ */
    _initCoinInstances() {
      const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffc93c, metalness: 0.75, roughness: 0.28,
        emissive: 0x7a4a00, emissiveIntensity: 1.15
      });
      this.coinMesh = new THREE.InstancedMesh(geo, mat, MAX_COINS);
      this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.coinMesh.frustumCulled = false;
      this.coinMesh.castShadow = false;
      this.root.add(this.coinMesh);

      this.coinPool = [];
      for (let i = 0; i < MAX_COINS; i++) {
        this.coinPool.push({ active: false, x: 0, y: 0, z: 0, spin: Math.random() * 6, magnet: false });
        _e.set(0, 0, 0);
        _q.setFromEuler(_e);
        _v.set(0, -999, 0);
        _s.setScalar(0);
        _m4.compose(_v, _q, _s);
        this.coinMesh.setMatrixAt(i, _m4);
      }
      _s.setScalar(1);
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }

    _acquireCoin() {
      for (let i = 0; i < this.coinPool.length; i++) {
        const c = this.coinPool[i];
        if (!c.active) { c.active = true; c.magnet = false; return c; }
      }
      return null;
    }

    /* ============================================================
       obstacle factories
       ============================================================ */
    _makeBarrier() {
      const g = new THREE.Group();
      const M = this.mat;

      const base = box(1.95, 0.55, 0.52, M.concreteDark);
      base.position.y = 0.28;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      const band = box(1.97, 0.3, 0.54, M.hazard);
      band.position.y = 0.72;
      band.castShadow = true;
      g.add(band);

      for (const x of [-0.85, 0.85]) {
        const foot = box(0.16, 0.14, 0.8, M.metal);
        foot.position.set(x, 0.07, 0);
        g.add(foot);
      }
      const top = box(1.99, 0.08, 0.56, M.metalLight);
      top.position.y = 0.89;
      g.add(top);
      return g;
    }

    _makeOverhead() {
      const g = new THREE.Group();
      const M = this.mat;

      const bar = box(2.15, 0.86, 0.42, M.hazard);
      bar.position.y = 2.08;
      bar.castShadow = true;
      g.add(bar);

      const frame = box(2.2, 0.12, 0.48, M.metal);
      frame.position.y = 2.55;
      g.add(frame);

      // glowing underside = "slide under me"
      const edge = box(2.18, 0.12, 0.5, M.neonCyan);
      edge.position.y = 1.62;
      g.add(edge);

      for (const x of [-0.78, 0.78]) {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.0, 6), M.metalLight);
        cable.position.set(x, 4.05, 0);
        g.add(cable);
      }

      // down chevrons on the face
      for (const x of [-0.45, 0, 0.45]) {
        const c1 = box(0.1, 0.34, 0.06, M.neonCyan);
        c1.position.set(x - 0.09, 2.12, 0.24);
        c1.rotation.z = 0.7;
        g.add(c1);
        const c2 = box(0.1, 0.34, 0.06, M.neonCyan);
        c2.position.set(x + 0.09, 2.12, 0.24);
        c2.rotation.z = -0.7;
        g.add(c2);
      }

      return g;
    }

    _makeBlock() {
      const g = new THREE.Group();
      const M = this.mat;

      const body = box(2.0, 2.35, 1.0, M.concreteDark);
      body.position.y = 1.18;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const band = box(2.02, 0.34, 1.02, M.hazard);
      band.position.y = 1.7;
      g.add(band);

      const foot = box(2.2, 0.22, 1.2, M.metal);
      foot.position.y = 0.11;
      g.add(foot);

      for (const x of [-0.62, 0.62]) {
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), M.redLight);
        light.position.set(x, 2.42, 0.3);
        g.add(light);
      }

      const brace = box(2.05, 0.12, 0.12, M.metalLight);
      brace.position.set(0, 1.0, 0.52);
      brace.rotation.z = 0.5;
      g.add(brace);

      return g;
    }

    _makeTrain(variant) {
      const M = this.mat;
      const palette = [
        { body: 0xe2513c, stripe: 0xffd23f },
        { body: 0x1fa8a0, stripe: 0xb8f7ff },
        { body: 0xf0a52c, stripe: 0x2b2f45 },
        { body: 0x3d6ee0, stripe: 0xff8ac4 }
      ][variant % 4];

      const bodyMat = new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.42, metalness: 0.45 });
      const stripeMat = new THREE.MeshStandardMaterial({ color: palette.stripe, roughness: 0.4, metalness: 0.35, emissive: palette.stripe, emissiveIntensity: 0.15 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1e2a, roughness: 0.6, metalness: 0.6 });
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x0a2233, roughness: 0.15, metalness: 0.7,
        emissive: 0xffb877, emissiveIntensity: 0.42
      });
      const frontGlass = new THREE.MeshStandardMaterial({
        color: 0x07131f, roughness: 0.08, metalness: 0.95,
        emissive: 0x14607d, emissiveIntensity: 0.85, envMapIntensity: 1.4
      });
      const destMat = new THREE.MeshBasicMaterial({ color: 0xffc93c, toneMapped: false });
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, toneMapped: false });
      const numberMat = new THREE.MeshBasicMaterial({ color: 0x0b1020, toneMapped: false });

      const B = new ChunkBuilder();
      const L = 22;
      const F = L / 2;

      /* ---- body shell ---- */
      B.box(2.3, 2.85, L, bodyMat, 0, 1.85, 0);
      B.box(2.15, 0.22, L - 0.4, darkMat, 0, 3.33, 0);
      B.box(2.0, 0.06, L - 0.8, stripeMat, 0, 3.44, 0);
      for (const z of [-L * 0.28, L * 0.18]) {
        B.box(1.3, 0.26, 2.0, M.metalLight, 0, 3.55, z);
      }

      /* ---- sides ---- */
      for (const side of [-1, 1]) {
        B.box(0.07, 0.95, L - 3.2, winMat, side * 1.16, 2.42, 0);
        for (let i = -4; i <= 4; i++) {
          B.box(0.13, 1.06, 0.22, darkMat, side * 1.19, 2.42, i * 2.15);
        }
        B.box(0.10, 0.05, L - 3.2, M.metalLight, side * 1.20, 1.92, 0);
        B.box(2.34, 0.3, L - 0.6, stripeMat, 0, 1.22, 0);

        for (const z of [-5.5, 5.5]) {
          B.box(0.08, 2.0, 1.5, darkMat, side * 1.16, 1.85, z);
          B.box(0.09, 0.8, 1.2, frontGlass, side * 1.17, 2.35, z);
        }
      }

      /* ---- front cab ---- */
      B.box(2.26, 2.5, 1.4, bodyMat, 0, 1.78, F + 0.55);
      B.box(2.15, 1.0, 0.12, darkMat, 0, 2.48, F + 1.18, -0.16);
      B.box(1.0, 0.86, 0.15, frontGlass, -0.52, 2.48, F + 1.25, -0.16);
      B.box(1.0, 0.86, 0.15, frontGlass, 0.52, 2.48, F + 1.25, -0.16);
      B.box(0.09, 0.9, 0.16, darkMat, 0, 2.48, F + 1.27, -0.16);
      B.box(1.95, 0.06, 0.16, headMat, 0, 2.94, F + 1.26, -0.16);
      B.box(1.55, 0.26, 0.08, destMat, 0, 3.10, F + 1.16);
      B.box(0.9, 0.24, 0.07, numberMat, 0, 2.98, F + 1.24);
      B.box(2.32, 0.42, 0.3, darkMat, 0, 0.60, F + 1.34);
      B.box(2.3, 0.1, 0.06, stripeMat, 0, 0.82, F + 1.48);
      B.box(2.2, 0.55, 0.9, darkMat, 0, 0.72, F + 0.95);
      B.box(2.05, 0.45, 0.7, M.metal, 0, 0.34, F + 1.15, -0.28);

      /* ---- lights ---- */
      B.box(1.5, 0.09, 0.08, headMat, 0, 2.02, F + 1.42);
      B.box(0.26, 0.26, 0.16, headMat, -0.72, 1.02, F + 1.42);
      B.box(0.26, 0.26, 0.16, headMat, 0.72, 1.02, F + 1.42);

      /* ---- undercarriage ---- */
      B.box(2.0, 0.5, L - 1.0, darkMat, 0, 0.42, 0);
      for (const z of [-L * 0.3, 0, L * 0.3]) {
        B.box(2.05, 0.45, 2.4, M.metal, 0, 0.3, z);
      }

      const g = B.build();

      // additive headlight halos (sprites are billboards, can't be merged)
      for (const x of [-0.72, 0.72]) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.tex.glow, color: 0xffe9b0, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.42
        }));
        glow.scale.set(0.85, 0.85, 1);
        glow.position.set(x, 1.02, F + 1.5);
        g.add(glow);
      }

      return g;
    }

    _makePowerup(type) {
      const g = new THREE.Group();
      const color = type === 'magnet' ? 0xff2e88 : 0x25e5ff;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.045, 6, 24),
        new THREE.MeshBasicMaterial({ color: color, toneMapped: false })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      g.userData.ring = ring;

      const coreMat = new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: 1.3,
        metalness: 0.6, roughness: 0.25
      });

      if (type === 'magnet') {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 8, 16, Math.PI), coreMat);
        arc.rotation.z = Math.PI;
        g.add(arc);
        for (const x of [-0.26, 0.26]) {
          const prong = box(0.2, 0.26, 0.2, coreMat);
          prong.position.set(x, -0.26, 0);
          g.add(prong);
          const tip = box(0.21, 0.1, 0.21, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
          tip.position.set(x, -0.4, 0);
          g.add(tip);
        }
      } else {
        // turbo chevrons
        for (let i = 0; i < 2; i++) {
          const c1 = box(0.12, 0.5, 0.12, coreMat);
          c1.position.set(-0.12 + i * 0.28, 0.16, 0);
          c1.rotation.z = 0.7;
          g.add(c1);
          const c2 = box(0.12, 0.5, 0.12, coreMat);
          c2.position.set(-0.12 + i * 0.28, -0.16, 0);
          c2.rotation.z = -0.7;
          g.add(c2);
        }
      }

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.tex.glow, color: color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75
      }));
      glow.scale.set(3.2, 3.2, 1);
      g.add(glow);

      return g;
    }

    /* ============================================================
       pooling
       ============================================================ */
    _acquire(type) {
      const pool = this.pools[type];
      if (pool && pool.length) {
        const g = pool.pop();
        g.visible = true;
        return g;
      }
      let g;
      if (type === 'barrier') g = this._makeBarrier();
      else if (type === 'overhead') g = this._makeOverhead();
      else if (type === 'block') g = this._makeBlock();
      else if (type === 'train') g = this._makeTrain(Math.floor(Math.random() * 4));
      else if (type === 'magnet' || type === 'turbo') g = this._makePowerup(type);
      this.root.add(g);
      return g;
    }

    _release(obj) {
      obj.group.visible = false;
      obj.group.position.set(0, -999, 0);
      if (!this.pools[obj.type]) this.pools[obj.type] = [];
      if (this.pools[obj.type].length < 12) this.pools[obj.type].push(obj.group);
      else this.root.remove(obj.group);
    }

    /* ============================================================
       spawn
       ============================================================ */
    _spawnObstacle(type, lane, z) {
      const dims = {
        barrier: { w: 1.95, h: 0.9, d: 0.6, y0: 0 },
        overhead: { w: 2.15, h: 1.4, d: 0.5, y0: 1.5 },
        block: { w: 2.0, h: 2.45, d: 1.0, y0: 0 }
      }[type];

      const group = this._acquire(type);
      group.position.set(LANES[lane], 0, z);
      const o = {
        type: type, lane: lane, z: z, x: LANES[lane],
        w: dims.w, h: dims.h, d: dims.d, y0: dims.y0,
        group: group, alive: true
      };
      this.obstacles.push(o);
      return o;
    }

    _spawnTrain(lane, z, len) {
      const group = this._acquire('train');
      // scale along z to requested length
      const baseLen = 22;
      group.scale.set(1, 1, len / baseLen);
      group.position.set(LANES[lane], 0, z);
      const o = {
        type: 'train', lane: lane, z: z, x: LANES[lane],
        w: 2.3, h: 3.3, d: len, y0: 0,
        group: group, alive: true
      };
      this.obstacles.push(o);
      return o;
    }

    _spawnCoin(x, y, z) {
      const c = this._acquireCoin();
      if (!c) return;
      c.x = x; c.y = y; c.z = z;
      c.spin = Math.random() * 6.28;
    }

    _spawnPowerup(type, lane, z) {
      const group = this._acquire(type);
      group.position.set(LANES[lane], 1.25, z);
      this.powerups.push({ type: type, lane: lane, x: LANES[lane], y: 1.25, z: z, group: group, active: true, t: Math.random() * 6 });
    }

    _laneClear(lane, zNear, zFar) {
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (o.lane !== lane || !o.alive) continue;
        if (o.z + o.d / 2 > zFar - 1 && o.z - o.d / 2 < zNear + 1) return false;
      }
      return true;
    }

    _spawnRow(z) {
      const r = this.row++;

      // lanes currently occupied by a train at this depth (queried live, so blocks
      // always expire exactly when the train has scrolled past the spawn line)
      const blocked = {};
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (o.type === 'train' && o.alive && z >= o.z - o.d / 2 - 1.2 && z <= o.z + o.d / 2 + 1.2) {
          blocked[o.lane] = true;
        }
      }

      // pick the guaranteed-passable corridor lane (moves max 1 lane per row)
      const self = this;
      let opts = [this.corridor - 1, this.corridor, this.corridor + 1].filter(function (l) {
        return l >= 0 && l < 3 && !blocked[l];
      });
      if (!opts.length) opts = [this.corridor];
      this.corridor = opts[Math.floor(Math.random() * opts.length)];

      if (r < 8) {
        // opening stretch: coins only
        this._coinRun(this.corridor, z, false);
        return;
      }

      // ---- trains ----
      this.rowsSinceTrain++;
      if (this.rowsSinceTrain >= 4 && Math.random() < 0.26) {
        const cands = [0, 1, 2].filter(function (l) {
          return l !== self.corridor && !blocked[l];
        });
        if (cands.length) {
          const lane = cands[Math.floor(Math.random() * cands.length)];
          const len = 16 + Math.random() * 8;
          if (this._laneClear(lane, z + 2, z - len - 2)) {
            this._spawnTrain(lane, z - len / 2, len);
            blocked[lane] = true;
            this.rowsSinceTrain = 0;
          }
        }
      }

      // ---- side obstacles ----
      for (let lane = 0; lane < 3; lane++) {
        if (lane === this.corridor || blocked[lane]) continue;
        if (Math.random() < 0.56) {
          const roll = Math.random();
          const type = roll < 0.42 ? 'barrier' : (roll < 0.78 ? 'block' : 'overhead');
          this._spawnObstacle(type, lane, z);
        }
      }

      // ---- passable hazard in the corridor ----
      let corridorHazard = null;
      if (r - this.lastHazardRow >= 3 && Math.random() < 0.42) {
        corridorHazard = Math.random() < 0.58 ? 'barrier' : 'overhead';
        this._spawnObstacle(corridorHazard, this.corridor, z);
        this.lastHazardRow = r;
      }

      // ---- coins ----
      if (Math.random() < 0.82) {
        this._coinRun(this.corridor, z, corridorHazard !== null);
      }

      // ---- power-up ----
      this.rowsSincePower++;
      if (this.rowsSincePower > 6 && Math.random() < 0.3) {
        this._spawnPowerup(Math.random() < 0.5 ? 'magnet' : 'turbo', this.corridor, z - 3);
        this.rowsSincePower = 0;
      }
    }

    _coinRun(lane, z, arcing) {
      const n = 4 + Math.floor(Math.random() * 4);
      const x = LANES[lane];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const cz = z + 3.4 - i * 1.75;
        let cy = 0.95;
        if (arcing) cy = 0.95 + Math.sin(t * Math.PI) * 1.35;
        this._spawnCoin(x, cy, cz);
      }
    }

    /* ============================================================
       lifecycle
       ============================================================ */
    reset() {
      // clear active objects
      const self = this;
      this.obstacles.forEach(function (o) { self._release(o); });
      this.obstacles.length = 0;

      this.powerups.forEach(function (p) {
        p.group.visible = false;
        p.group.position.set(0, -999, 0);
        if (!self.pools[p.type]) self.pools[p.type] = [];
        self.pools[p.type].push(p.group);
      });
      this.powerups.length = 0;

      this.coinPool.forEach(function (c) { c.active = false; });

      this.row = 0;
      this.corridor = 1;
      this.lastHazardRow = -9;
      this.rowsSinceTrain = 0;
      this.rowsSincePower = 0;
      this.time = 0;

      // pre-fill the track ahead of the player so the run starts with content
      this.spawnCursor = -26;
      let guard = 0;
      while (this.spawnCursor > -SPAWN_AHEAD && guard++ < 24) {
        this._spawnRow(this.spawnCursor);
        this.spawnCursor -= 16;
      }
    }

    /* ============================================================
       per-frame update
       ============================================================ */
    update(dt, speed, showcase) {
      this.time += dt;
      this.speedNow = speed;
      const dz = speed * dt;

      // environment
      for (let i = 0; i < this.chunks.length; i++) {
        const c = this.chunks[i];
        c.z += dz;
        if (c.z > 60) c.z -= CHUNK_COUNT * CHUNK_LEN;
        c.group.position.z = c.z;
      }

      // obstacles
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i];
        o.pz = o.z;
        o.z += dz;
        o.group.position.z = o.z;
        if (o.z - o.d / 2 > DESPAWN_Z) {
          this._release(o);
          this.obstacles.splice(i, 1);
        }
      }

      // power-ups
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.z += dz;
        p.t += dt;
        p.group.position.set(p.x, p.y + Math.sin(p.t * 2.2) * 0.12, p.z);
        p.group.rotation.y += dt * 1.8;
        if (p.group.userData.ring) p.group.userData.ring.rotation.z += dt * 2.6;
        if (p.z > DESPAWN_Z) {
          p.group.visible = false;
          p.group.position.set(0, -999, 0);
          if (!this.pools[p.type]) this.pools[p.type] = [];
          this.pools[p.type].push(p.group);
          this.powerups.splice(i, 1);
        }
      }

      // coins
      for (let i = 0; i < this.coinPool.length; i++) {
        const c = this.coinPool[i];
        if (!c.active) continue;
        c.pz = c.z;
        if (!c.magnet) c.z += dz;
        c.spin += dt * 3.2;
        if (c.z > DESPAWN_Z) { c.active = false; }
      }

      // spawning
      if (this.spawnEnabled && !showcase) {
        this.spawnCursor += dz;
        let guard = 0;
        while (this.spawnCursor > -SPAWN_AHEAD && guard++ < 6) {
          this._spawnRow(this.spawnCursor);
          const spacing = MR.Utils.clamp(13 + speed * 0.16, 13, 22);
          this.spawnCursor -= spacing;
        }
      } else {
        this.spawnCursor += dz;
        if (this.spawnCursor > -SPAWN_AHEAD) this.spawnCursor = -SPAWN_AHEAD;
      }

      this._writeCoins();
    }

    _writeCoins() {
      let dirty = false;
      for (let i = 0; i < this.coinPool.length; i++) {
        const c = this.coinPool[i];
        if (c.active) {
          _e.set(0, c.spin, 0);
          _q.setFromEuler(_e);
          _v.set(c.x, c.y, c.z);
          _s.setScalar(1);
          _m4.compose(_v, _q, _s);
          this.coinMesh.setMatrixAt(i, _m4);
          dirty = true;
        } else if (!c.hidden) {
          _v.set(0, -999, 0);
          _s.setScalar(0);
          _e.set(0, 0, 0);
          _q.setFromEuler(_e);
          _m4.compose(_v, _q, _s);
          this.coinMesh.setMatrixAt(i, _m4);
          c.hidden = true;
          dirty = true;
        }
        if (c.active) c.hidden = false;
      }
      if (dirty) this.coinMesh.instanceMatrix.needsUpdate = true;
    }

    /** collision candidates near the player (z ~ 0) */
    nearby(zRange) {
      const out = [];
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (Math.abs(o.z) < zRange + o.d / 2) out.push(o);
      }
      return out;
    }
  }

  MR.World = World;
  MR.LANES = LANES;
  MR.CHUNK_LEN = CHUNK_LEN;
})();
