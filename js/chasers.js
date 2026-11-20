/* ============================================================
   METRO RUSH 3D — pursuit system
   Original procedural police officer + police dog, fully animated.
   Added on top of the existing game: nothing here touches the
   player rig, the world generator or the scoring rules.
   ============================================================ */
(function () {
  'use strict';

  const U = MR.Utils;

  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color: color, roughness: 0.6, metalness: 0.08
    }, opts || {}));
  }

  function capsule(r, len, material) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), material);
    m.castShadow = true;
    return m;
  }

  function box(w, h, d, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.castShadow = true;
    return m;
  }

  function sphere(r, material, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) - 2), material);
    m.castShadow = true;
    return m;
  }

  /* ============================================================
     OFFICER — "UNIT 12", heavy build, navy uniform, peaked cap
     ============================================================ */
  class Officer {
    constructor() {
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);

      this.phase = 0;
      this.mode = 'run';
      this.reach = 0;          // 0..1 arm extension (capture)
      this.lookY = 0;

      this._build();
    }

    _build() {
      const M = this.M = {
        uniform: mat(0x2a4877, { roughness: 0.6, metalness: 0.14 }),
        uniformDark: mat(0x1e3252, { roughness: 0.68, metalness: 0.12 }),
        shirt: mat(0xdfe8f6, { roughness: 0.78, metalness: 0.02 }),
        skin: mat(0xe6b389, { roughness: 0.74 }),
        skinDark: mat(0xc99772, { roughness: 0.74 }),
        hair: mat(0x1d1510, { roughness: 0.62 }),
        boot: mat(0x111a2b, { roughness: 0.42, metalness: 0.3 }),
        sole: mat(0x46506a, { roughness: 0.55, metalness: 0.2 }),
        gold: mat(0xffc93c, { roughness: 0.28, metalness: 0.9, emissive: 0x5a3f00, emissiveIntensity: 0.55 }),
        silver: mat(0xc6d5e8, { roughness: 0.3, metalness: 0.88 }),
        reflect: mat(0xdff6ff, { roughness: 0.3, metalness: 0.25, emissive: 0x2f7d96, emissiveIntensity: 0.75 }),
        cap: mat(0x17233d, { roughness: 0.55, metalness: 0.18 }),
        brim: mat(0x090e18, { roughness: 0.3, metalness: 0.55 }),
        radio: mat(0x0e1626, { roughness: 0.5, metalness: 0.4 }),
        eye: mat(0x14161f, { roughness: 0.25, metalness: 0.1 }),
        light: new THREE.MeshBasicMaterial({ color: 0x63b8ff, toneMapped: false })
      };

      const B = this.body;

      /* ---- hips + belt ---- */
      const hips = box(0.37, 0.23, 0.27, M.uniformDark);
      hips.position.y = 0.93;
      B.add(hips);

      const belt = box(0.39, 0.105, 0.29, M.brim);
      belt.position.y = 1.03;
      B.add(belt);

      const buckle = box(0.09, 0.075, 0.03, M.gold);
      buckle.position.set(0, 1.03, -0.155);
      B.add(buckle);

      // belt pouches + radio holster
      [-0.15, 0.15].forEach(function (x) {
        const pouch = box(0.10, 0.13, 0.06, M.uniformDark);
        pouch.position.set(x, 0.97, -0.14);
        B.add(pouch);
        const flap = box(0.10, 0.02, 0.065, M.silver);
        flap.position.set(x, 1.03, -0.14);
        B.add(flap);
      });

      /* ---- torso ---- */
      const torso = capsule(0.245, 0.40, M.uniform);
      torso.position.y = 1.25;
      torso.scale.set(0.95, 1.0, 0.82);
      B.add(torso);

      // vest front panel
      const vest = box(0.285, 0.43, 0.09, M.uniformDark);
      vest.position.set(0, 1.27, -0.155);
      B.add(vest);

      // shirt opening + tie
      const shirtFront = box(0.105, 0.10, 0.03, M.shirt);
      shirtFront.position.set(0, 1.448, -0.212);
      B.add(shirtFront);

      const tieKnot = box(0.056, 0.045, 0.03, M.brim);
      tieKnot.position.set(0, 1.44, -0.218);
      B.add(tieKnot);

      const tie = box(0.046, 0.115, 0.025, M.brim);
      tie.position.set(0, 1.372, -0.218);
      B.add(tie);

      // reflective bands
      [-0.10, 0.10].forEach(function (y) {
        const band = box(0.292, 0.026, 0.095, M.reflect);
        band.position.set(0, 1.27 + y, -0.155);
        B.add(band);
      });

      // badge (chest, left side)
      const badge = box(0.058, 0.07, 0.014, M.gold);
      badge.position.set(0.112, 1.405, -0.212);
      badge.rotation.z = -0.1;
      B.add(badge);
      const badgeStar = box(0.032, 0.04, 0.01, M.silver);
      badgeStar.position.set(0.112, 1.407, -0.219);
      badgeStar.rotation.z = -0.1;
      B.add(badgeStar);

      // name bar
      const nameBar = box(0.078, 0.02, 0.01, M.silver);
      nameBar.position.set(-0.10, 1.398, -0.212);
      B.add(nameBar);

      // shoulder radio
      const radio = box(0.075, 0.13, 0.055, M.radio);
      radio.position.set(-0.185, 1.47, -0.12);
      radio.rotation.z = 0.14;
      B.add(radio);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 4), M.brim);
      ant.position.set(-0.205, 1.575, -0.12);
      B.add(ant);
      const radioLed = box(0.018, 0.018, 0.012, M.light);
      radioLed.position.set(-0.175, 1.51, -0.152);
      B.add(radioLed);

      // shoulder patch
      [-1, 1].forEach(function (s) {
        const patch = box(0.055, 0.06, 0.02, M.gold);
        patch.position.set(s * 0.30, 1.47, 0.02);
        B.add(patch);
      }, this);

      // epaulettes
      [-1, 1].forEach(function (s2) {
        const strap = box(0.10, 0.028, 0.19, M.uniformDark);
        strap.position.set(s2 * 0.205, 1.505, 0.005);
        strap.rotation.z = s2 * -0.12;
        B.add(strap);
        const pip = box(0.045, 0.02, 0.045, M.silver);
        pip.position.set(s2 * 0.205, 1.523, -0.02);
        B.add(pip);
      }, this);

      // collar
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.042, 6, 14), M.uniformDark);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 1.50, 0);
      collar.castShadow = true;
      B.add(collar);

      const shirtCollar = box(0.155, 0.045, 0.15, M.shirt);
      shirtCollar.position.set(0, 1.478, -0.05);
      B.add(shirtCollar);

      // hip holster, breaks up the silhouette
      const holster = box(0.10, 0.20, 0.11, M.brim);
      holster.position.set(0.20, 0.93, 0.01);
      holster.rotation.z = -0.12;
      B.add(holster);

      /* ---- head ---- */
      this.head = new THREE.Group();
      this.head.position.set(0, 1.68, 0);
      B.add(this.head);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.10, 8), M.skin);
      neck.position.y = -0.07;
      this.head.add(neck);

      const skull = sphere(0.205, M.skin, 16);
      skull.scale.set(1, 1.04, 0.98);
      this.head.add(skull);

      const jaw = sphere(0.158, M.skin, 12);
      jaw.scale.set(0.86, 0.70, 0.92);
      jaw.position.set(0, -0.095, -0.028);
      this.head.add(jaw);

      // eyes (front = -Z)
      [-0.072, 0.072].forEach(function (x) {
        const eye = sphere(0.028, M.eye, 8);
        eye.position.set(x, 0.015, -0.185);
        this.head.add(eye);
        const brow = box(0.06, 0.016, 0.02, M.hair);
        brow.position.set(x, 0.062, -0.185);
        brow.rotation.z = x > 0 ? -0.16 : 0.16;
        this.head.add(brow);
      }, this);

      const nose = box(0.045, 0.05, 0.05, M.skinDark);
      nose.position.set(0, -0.03, -0.198);
      this.head.add(nose);

      // short hair at the nape only (the cap covers the crown)
      const nape = sphere(0.19, M.hair, 12);
      nape.scale.set(1.0, 0.62, 0.72);
      nape.position.set(0, 0.03, 0.10);
      this.head.add(nape);

      /* ---- peaked cap ---- */
      const cap = new THREE.Group();
      cap.position.set(0, 0.125, 0);
      cap.rotation.x = -0.06;
      this.head.add(cap);

      // crown sits proud of the skull so no geometry pokes through
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.248, 0.155, 18), M.cap);
      crown.castShadow = true;
      cap.add(crown);

      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.236, 0.222, 0.045, 18), M.cap);
      top.position.y = 0.10;
      top.castShadow = true;
      cap.add(top);

      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.234, 0.02, 18), M.brim);
      ridge.position.y = 0.072;
      cap.add(ridge);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.249, 0.249, 0.05, 18), M.brim);
      band.position.y = -0.045;
      cap.add(band);

      const brim = box(0.375, 0.032, 0.215, M.brim);
      brim.position.set(0, -0.078, -0.168);
      brim.rotation.x = 0.24;
      cap.add(brim);

      const capBadge = box(0.075, 0.065, 0.02, M.gold);
      capBadge.position.set(0, 0.02, -0.212);
      cap.add(capBadge);
      const capStar = box(0.04, 0.035, 0.014, M.silver);
      capStar.position.set(0, 0.02, -0.222);
      cap.add(capStar);

      /* ---- arms ---- */
      this.armL = this._makeArm(-1);
      this.armR = this._makeArm(1);
      B.add(this.armL, this.armR);

      /* ---- legs ---- */
      this.legL = this._makeLeg(-1);
      this.legR = this._makeLeg(1);
      B.add(this.legL, this.legR);

      this.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    }

    _makeArm(side) {
      const M = this.M;
      const g = new THREE.Group();
      g.position.set(side * 0.325, 1.44, 0);

      const pad = sphere(0.105, M.uniform, 10);
      g.add(pad);

      const upper = capsule(0.086, 0.20, M.uniform);
      upper.position.y = -0.135;
      g.add(upper);

      const band = box(0.175, 0.032, 0.175, M.reflect);
      band.position.y = -0.245;
      g.add(band);

      const elbow = new THREE.Group();
      elbow.position.y = -0.285;
      g.add(elbow);

      const fore = capsule(0.076, 0.20, M.uniform);
      fore.position.y = -0.115;
      elbow.add(fore);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.045, 10), M.uniformDark);
      cuff.position.y = -0.215;
      elbow.add(cuff);

      const hand = sphere(0.072, M.skin, 10);
      hand.position.y = -0.262;
      elbow.add(hand);

      g.userData.elbow = elbow;
      return g;
    }

    _makeLeg(side) {
      const M = this.M;
      const g = new THREE.Group();
      g.position.set(side * 0.142, 0.90, 0);

      const thigh = capsule(0.108, 0.24, M.uniform);
      thigh.position.y = -0.17;
      g.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.345;
      g.add(knee);

      const shin = capsule(0.088, 0.24, M.uniformDark);
      shin.position.y = -0.155;
      knee.add(shin);

      // reflective trouser band — makes the unit readable at distance
      const legBand = box(0.195, 0.032, 0.195, M.reflect);
      legBand.position.y = -0.10;
      knee.add(legBand);

      const boot = box(0.165, 0.135, 0.33, M.boot);
      boot.position.set(0, -0.315, -0.045);
      knee.add(boot);

      const toe = box(0.17, 0.07, 0.10, M.brim);
      toe.position.set(0, -0.35, -0.185);
      knee.add(toe);

      const sole = box(0.172, 0.05, 0.345, M.sole);
      sole.position.set(0, -0.378, -0.045);
      knee.add(sole);

      g.userData.knee = knee;
      return g;
    }

    reset() {
      this.phase = 0;
      this.mode = 'run';
      this.reach = 0;
      this.body.position.set(0, 0, 0);
      this.body.rotation.set(0, 0, 0);
      this.head.rotation.set(0, 0, 0);
      this.root.visible = true;
    }

    /** @param {number} dt @param {number} speed @param {string} mode run|reach|idle */
    update(dt, speed, mode, lookY) {
      const st = mode || this.mode;
      this.mode = st;
      this.reach = U.damp(this.reach, st === 'reach' ? 1 : 0, 6, dt);
      this.lookY = U.damp(this.lookY, lookY || 0, 5, dt);

      const running = st === 'run' || st === 'reach';
      if (running) this.phase += dt * (7.0 + speed * 0.30);
      else this.phase += dt * 1.5;

      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const t = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbL: 0, elbR: 0, headX: 0 };
      let bodyY = 0, bodyRotX = 0.10, bodyRotZ = 0;

      if (running) {
        const amp = st === 'reach' ? 1.05 : 0.92;
        t.legL = s * amp;
        t.legR = -s * amp;
        t.kneeL = Math.max(0, -s) * 1.25 + 0.14;
        t.kneeR = Math.max(0, s) * 1.25 + 0.14;
        t.armL = -s * 0.85;
        t.armR = s * 0.85;
        t.elbL = 1.25 + Math.max(0, s) * 0.30;
        t.elbR = 1.25 + Math.max(0, -s) * 0.30;
        bodyY = Math.abs(c) * 0.06;
        bodyRotX = 0.17;
        bodyRotZ = s * 0.03;
        t.headX = -0.08;
      } else {
        bodyY = Math.sin(this.phase) * 0.015;
        t.legL = 0.05; t.legR = -0.05;
        t.kneeL = 0.10; t.kneeR = 0.10;
        t.armL = -0.1; t.armR = -0.1;
        t.elbL = 0.30; t.elbR = 0.30;
        bodyRotX = 0.03;
      }

      // capture: right arm shoots forward, torso lunges
      if (this.reach > 0.01) {
        const r = this.reach;
        t.armR = U.lerp(t.armR, -1.75, r);
        t.elbR = U.lerp(t.elbR, 0.18, r);
        t.armL = U.lerp(t.armL, 0.55, r);
        t.elbL = U.lerp(t.elbL, 1.35, r);
        bodyRotX = U.lerp(bodyRotX, 0.44, r);
        t.headX = U.lerp(t.headX, 0.10, r);
      }

      const k = 15;
      this.body.position.y = U.damp(this.body.position.y, bodyY, k, dt);
      this.body.rotation.x = U.damp(this.body.rotation.x, bodyRotX, k, dt);
      this.body.rotation.z = U.damp(this.body.rotation.z, bodyRotZ, 9, dt);

      this.legL.rotation.x = U.damp(this.legL.rotation.x, t.legL, k, dt);
      this.legR.rotation.x = U.damp(this.legR.rotation.x, t.legR, k, dt);
      this.legL.userData.knee.rotation.x = U.damp(this.legL.userData.knee.rotation.x, t.kneeL, k, dt);
      this.legR.userData.knee.rotation.x = U.damp(this.legR.userData.knee.rotation.x, t.kneeR, k, dt);

      this.armL.rotation.x = U.damp(this.armL.rotation.x, t.armL, k, dt);
      this.armR.rotation.x = U.damp(this.armR.rotation.x, t.armR, k, dt);
      this.armL.rotation.z = U.damp(this.armL.rotation.z, 0.16, k, dt);
      this.armR.rotation.z = U.damp(this.armR.rotation.z, -0.16, k, dt);
      this.armL.userData.elbow.rotation.x = U.damp(this.armL.userData.elbow.rotation.x, -t.elbL, k, dt);
      this.armR.userData.elbow.rotation.x = U.damp(this.armR.userData.elbow.rotation.x, -t.elbR, k, dt);

      this.head.rotation.x = U.damp(this.head.rotation.x, t.headX, 10, dt);
      this.head.rotation.y = this.lookY;
    }
  }

  /* ============================================================
     DOG — "K9 REX", shepherd build, tan + charcoal, blue collar
     ============================================================ */
  class Dog {
    constructor() {
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);

      this.phase = 0;
      this.t = 0;
      this.mode = 'run';
      this.barkT = 0;
      this.jump = 0;

      this._build();
    }

    _build() {
      const M = this.M = {
        furDark: mat(0x2e2a33, { roughness: 0.86, metalness: 0.02 }),
        furTan: mat(0xb8814d, { roughness: 0.82, metalness: 0.02 }),
        furLight: mat(0xe4d6c0, { roughness: 0.88, metalness: 0.0 }),
        nose: mat(0x16121a, { roughness: 0.32, metalness: 0.15 }),
        eyeW: mat(0xf7f9ff, { roughness: 0.3, metalness: 0.0 }),
        eyeD: mat(0x121018, { roughness: 0.2, metalness: 0.1 }),
        tongue: mat(0xe8697e, { roughness: 0.5 }),
        collar: mat(0x2f7bff, { roughness: 0.45, metalness: 0.25, emissive: 0x0a2a66, emissiveIntensity: 0.7 }),
        tag: mat(0xffc93c, { roughness: 0.3, metalness: 0.9, emissive: 0x5a3f00, emissiveIntensity: 0.6 }),
        leather: mat(0x1a1410, { roughness: 0.55, metalness: 0.2 })
      };

      const B = this.body;

      /* ---- barrel ---- */
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.175, 0.44, 6, 12), M.furDark);
      torso.rotation.x = Math.PI / 2;
      torso.position.set(0, 0.52, 0.02);
      torso.castShadow = true;
      B.add(torso);

      // tan saddle marking
      const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.168, 0.28, 5, 10), M.furTan);
      saddle.rotation.x = Math.PI / 2;
      saddle.position.set(0, 0.552, 0.02);
      B.add(saddle);

      const chest = sphere(0.19, M.furLight, 12);
      chest.scale.set(0.94, 1.0, 0.92);
      chest.position.set(0, 0.515, -0.225);
      B.add(chest);

      const rump = sphere(0.178, M.furDark, 12);
      rump.scale.set(1.0, 1.02, 0.95);
      rump.position.set(0, 0.515, 0.275);
      B.add(rump);

      const belly = sphere(0.145, M.furLight, 10);
      belly.scale.set(0.82, 0.5, 1.7);
      belly.position.set(0, 0.385, 0.02);
      B.add(belly);

      /* ---- neck + head ---- */
      this.neck = new THREE.Group();
      this.neck.position.set(0, 0.575, -0.255);
      B.add(this.neck);

      const neckMesh = capsule(0.108, 0.17, M.furTan);
      neckMesh.rotation.x = 0.78;
      neckMesh.position.set(0, 0.075, -0.035);
      this.neck.add(neckMesh);

      this.head = new THREE.Group();
      this.head.position.set(0, 0.215, -0.115);
      this.neck.add(this.head);

      const skull = sphere(0.178, M.furTan, 14);
      skull.scale.set(1.0, 0.96, 1.12);
      this.head.add(skull);

      // dark shepherd mask across the eyes
      const mask = sphere(0.176, M.furDark, 12);
      mask.scale.set(1.0, 0.50, 1.03);
      mask.position.set(0, 0.072, 0.012);
      this.head.add(mask);

      // muzzle
      const muzzle = box(0.126, 0.115, 0.26, M.furTan);
      muzzle.position.set(0, -0.058, -0.215);
      this.head.add(muzzle);

      const muzzleTop = box(0.104, 0.045, 0.245, M.furDark);
      muzzleTop.position.set(0, 0.008, -0.215);
      this.head.add(muzzleTop);

      const nose = box(0.055, 0.042, 0.042, M.nose);
      nose.position.set(0, -0.012, -0.352);
      this.head.add(nose);

      // jaw (opens when barking)
      this.jaw = new THREE.Group();
      this.jaw.position.set(0, -0.09, -0.10);
      this.head.add(this.jaw);

      const jawMesh = box(0.102, 0.05, 0.215, M.furLight);
      jawMesh.position.set(0, -0.018, -0.10);
      this.jaw.add(jawMesh);

      const tongue = box(0.058, 0.024, 0.115, M.tongue);
      tongue.position.set(0, -0.008, -0.175);
      tongue.visible = false;
      this.jaw.add(tongue);
      this.tongue = tongue;

      // eyes
      [-0.078, 0.078].forEach(function (x) {
        const w = sphere(0.038, M.eyeW, 10);
        w.position.set(x, 0.042, -0.118);
        this.head.add(w);
        const p = sphere(0.022, M.eyeD, 8);
        p.position.set(x * 1.02, 0.042, -0.148);
        this.head.add(p);
        const glint = sphere(0.009, M.eyeW, 6);
        glint.position.set(x * 1.02 + 0.008, 0.055, -0.161);
        this.head.add(glint);
      }, this);

      // ears (animated)
      this.ears = [];
      [-1, 1].forEach(function (s) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.108, 0.125, 0.015);
        ear.rotation.z = s * 0.26;
        this.head.add(ear);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.215, 4), M.furDark);
        cone.position.y = 0.095;
        cone.rotation.y = Math.PI / 4;
        cone.castShadow = true;
        ear.add(cone);

        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.125, 4), M.furTan);
        inner.position.set(0, 0.078, -0.026);
        inner.rotation.y = Math.PI / 4;
        ear.add(inner);

        this.ears.push(ear);
      }, this);

      /* ---- collar ---- */
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.034, 6, 16), M.collar);
      collar.rotation.x = Math.PI / 2 - 0.62;
      collar.position.set(0, 0.085, -0.075);
      collar.castShadow = true;
      this.neck.add(collar);

      const tag = box(0.058, 0.058, 0.014, M.tag);
      tag.position.set(0, -0.005, -0.195);
      tag.rotation.x = 0.45;
      this.neck.add(tag);

      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 5, 10, Math.PI), M.leather);
      handle.position.set(0, 0.125, 0.015);
      handle.rotation.x = Math.PI / 2;
      this.neck.add(handle);

      /* ---- tail ---- */
      this.tail = new THREE.Group();
      this.tail.position.set(0, 0.56, 0.40);
      B.add(this.tail);

      const tail1 = capsule(0.048, 0.19, M.furDark);
      tail1.rotation.x = Math.PI / 2 - 1.02;
      tail1.position.set(0, 0.05, 0.085);
      this.tail.add(tail1);

      this.tail2 = new THREE.Group();
      this.tail2.position.set(0, 0.115, 0.175);
      this.tail.add(this.tail2);

      const tail2m = capsule(0.038, 0.17, M.furTan);
      tail2m.rotation.x = Math.PI / 2 - 1.42;
      tail2m.position.set(0, 0.035, 0.055);
      this.tail2.add(tail2m);

      /* ---- legs ---- */
      this.legs = {
        fl: this._makeLeg(-0.118, 0.47, -0.20, true),
        fr: this._makeLeg(0.118, 0.47, -0.20, true),
        bl: this._makeLeg(-0.128, 0.48, 0.26, false),
        br: this._makeLeg(0.128, 0.48, 0.26, false)
      };
      B.add(this.legs.fl.root, this.legs.fr.root, this.legs.bl.root, this.legs.br.root);

      this.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    }

    _makeLeg(x, y, z, front) {
      const M = this.M;
      const root = new THREE.Group();
      root.position.set(x, y, z);

      const upper = capsule(front ? 0.058 : 0.064, 0.13, M.furTan);
      upper.position.y = -0.09;
      root.add(upper);

      const knee = new THREE.Group();
      knee.position.y = -0.215;
      root.add(knee);

      const lower = capsule(front ? 0.046 : 0.048, 0.12, M.furTan);
      lower.position.y = -0.085;
      knee.add(lower);

      const paw = box(0.078, 0.045, 0.118, M.furLight);
      paw.position.set(0, -0.20, -0.016);
      knee.add(paw);

      return { root: root, knee: knee, front: front };
    }

    reset() {
      this.phase = 0;
      this.t = 0;
      this.barkT = 0;
      this.jump = 0;
      this.mode = 'run';
      this.body.position.set(0, 0, 0);
      this.body.rotation.set(0, 0, 0);
      this.root.visible = true;
      this.root.rotation.set(0, 0, 0);
      this.jaw.rotation.x = 0;
      this.tongue.visible = false;
    }

    bark() {
      this.barkT = 0.55;
    }

    /** @param {number} dt @param {number} speed @param {string} mode run|pounce|idle */
    update(dt, speed, mode, lookY) {
      const st = mode || this.mode;
      this.mode = st;
      this.t += dt;

      if (this.barkT > 0) this.barkT -= dt;

      // gallop: front pair leads, rear pair follows half a cycle later
      const rate = st === 'idle' ? 2.2 : 8.4 + speed * 0.42;
      this.phase += dt * rate;

      const p = this.phase;
      const s = Math.sin(p);
      const c = Math.cos(p);

      const jumpTarget = st === 'pounce' ? 1 : 0;
      this.jump = U.damp(this.jump, jumpTarget, st === 'pounce' ? 9 : 6, dt);

      // body bob + pitch
      const bob = st === 'idle' ? Math.sin(p) * 0.012 : Math.abs(c) * 0.055;
      this.body.position.y = U.damp(this.body.position.y, bob + this.jump * 0.55, 18, dt);
      this.body.rotation.x = U.damp(this.body.rotation.x, st === 'pounce' ? -0.42 : (st === 'idle' ? 0 : 0.06), 8, dt);
      this.body.rotation.z = U.damp(this.body.rotation.z, st === 'idle' ? 0 : s * 0.03, 8, dt);

      // legs
      const L = this.legs;
      if (st === 'idle') {
        L.fl.root.rotation.x = U.damp(L.fl.root.rotation.x, 0.06, 8, dt);
        L.fr.root.rotation.x = U.damp(L.fr.root.rotation.x, 0.06, 8, dt);
        L.bl.root.rotation.x = U.damp(L.bl.root.rotation.x, -0.06, 8, dt);
        L.br.root.rotation.x = U.damp(L.br.root.rotation.x, -0.06, 8, dt);
        L.fl.knee.rotation.x = U.damp(L.fl.knee.rotation.x, 0.1, 8, dt);
        L.fr.knee.rotation.x = U.damp(L.fr.knee.rotation.x, 0.1, 8, dt);
        L.bl.knee.rotation.x = U.damp(L.bl.knee.rotation.x, 0.12, 8, dt);
        L.br.knee.rotation.x = U.damp(L.br.knee.rotation.x, 0.12, 8, dt);
      } else {
        const amp = st === 'pounce' ? 0.55 : 1.0;
        const frontA = Math.sin(p) * 1.05 * amp;
        const frontB = Math.sin(p + Math.PI) * 1.05 * amp;
        const backA = Math.sin(p + Math.PI * 0.75) * 0.95 * amp;
        const backB = Math.sin(p + Math.PI * 1.75) * 0.95 * amp;

        L.fl.root.rotation.x = U.damp(L.fl.root.rotation.x, frontA, 22, dt);
        L.fr.root.rotation.x = U.damp(L.fr.root.rotation.x, frontB, 22, dt);
        L.bl.root.rotation.x = U.damp(L.bl.root.rotation.x, backA, 22, dt);
        L.br.root.rotation.x = U.damp(L.br.root.rotation.x, backB, 22, dt);

        L.fl.knee.rotation.x = U.damp(L.fl.knee.rotation.x, Math.max(0, -Math.sin(p)) * 1.5 + 0.1, 22, dt);
        L.fr.knee.rotation.x = U.damp(L.fr.knee.rotation.x, Math.max(0, -Math.sin(p + Math.PI)) * 1.5 + 0.1, 22, dt);
        L.bl.knee.rotation.x = U.damp(L.bl.knee.rotation.x, Math.max(0, Math.sin(p + Math.PI * 0.75)) * 1.2 + 0.15, 22, dt);
        L.br.knee.rotation.x = U.damp(L.br.knee.rotation.x, Math.max(0, Math.sin(p + Math.PI * 1.75)) * 1.2 + 0.15, 22, dt);
      }

      // pounce: front legs stretch forward, body rises
      if (this.jump > 0.02) {
        const j = this.jump;
        L.fl.root.rotation.x = U.lerp(L.fl.root.rotation.x, -1.25, j);
        L.fr.root.rotation.x = U.lerp(L.fr.root.rotation.x, -1.15, j);
        L.fl.knee.rotation.x = U.lerp(L.fl.knee.rotation.x, 0.35, j);
        L.fr.knee.rotation.x = U.lerp(L.fr.knee.rotation.x, 0.35, j);
      }

      // head: bob + look toward the target lane
      this.head.rotation.x = U.damp(this.head.rotation.x, st === 'idle' ? 0.04 : Math.sin(p + 0.6) * 0.09 + 0.03, 10, dt);
      this.head.rotation.y = U.damp(this.head.rotation.y, lookY || 0, 6, dt);

      // ears flop with the gait
      const flop = st === 'idle' ? Math.sin(this.t * 1.6) * 0.05 : Math.sin(p * 2) * 0.16;
      this.ears[0].rotation.x = U.damp(this.ears[0].rotation.x, -0.1 + flop, 14, dt);
      this.ears[1].rotation.x = U.damp(this.ears[1].rotation.x, -0.1 - flop, 14, dt);

      // tail wag (fast when chasing, wild when close)
      const wag = st === 'idle' ? Math.sin(this.t * 6) * 0.25 : Math.sin(this.t * 15) * 0.55;
      this.tail.rotation.y = U.damp(this.tail.rotation.y, wag, 16, dt);
      this.tail.rotation.x = U.damp(this.tail.rotation.x, st === 'pounce' ? -0.55 : -0.12 + Math.sin(p * 2) * 0.12, 10, dt);
      this.tail2.rotation.y = U.damp(this.tail2.rotation.y, wag * 0.6, 16, dt);

      // bark / panting jaw
      const bark = this.barkT > 0 ? Math.max(0, Math.sin(this.barkT * 26)) * 0.42 : 0;
      const pant = st === 'idle' ? 0.05 : 0.16 + Math.sin(p * 2) * 0.05;
      this.jaw.rotation.x = U.damp(this.jaw.rotation.x, bark + pant, 18, dt);
      this.tongue.visible = bark > 0.05 || pant > 0.14;
    }
  }

  /* ============================================================
     CHASE — positions both pursuers relative to the player
     ============================================================ */
  class Chase {
    constructor(scene) {
      this.officer = new Officer();
      this.dog = new Dog();

      this.group = new THREE.Group();
      this.group.add(this.officer.root, this.dog.root);
      this.group.visible = false;
      scene.add(this.group);

      this.reset();
    }

    reset() {
      this.active = false;
      this.group.visible = false;
      this.heat = 0.40;          // 0 = safe, 1 = caught
      this.mode = 'chase';       // chase | catch
      this.catchT = 0;
      this.dustT = 0;
      this.barkT = 2.5;

      this.oz = 1.30;            // officer depth offset (toward camera)
      this.dz = 1.00;            // dog depth offset (slightly ahead of the officer)
      this.ox = -0.9;
      this.dx = 0.9;
      this.os = 0.92;
      this.ds = 0.92;

      this.officer.reset();
      this.dog.reset();
      this.officer.root.position.set(this.ox, 0, this.oz);
      this.dog.root.position.set(this.dx, 0, this.dz);
    }

    start() {
      this.reset();
      this.active = true;
      this.group.visible = true;
    }

    /** heat 0..1 — higher = closer */
    setHeat(v) { this.heat = U.clamp(v, 0, 1); }

    /** player brushed an obstacle: pursuers lunge */
    stumble() {
      this.heat = U.clamp(this.heat + 0.16, 0, 0.96);
      this.barkT = 0.05;
    }

    beginCatch() {
      this.mode = 'catch';
      this.catchT = 0;
      this.heat = 1;
      this.dog.bark();
    }

    /**
     * @param {number} dt
     * @param {{px:number, speed:number, playing:boolean, particles:object}} ctx
     */
    update(dt, ctx) {
      if (!this.active) return;

      const px = ctx.px;
      const speed = ctx.speed;

      // base depth: safe heat pulls them back toward the camera, high heat brings them in
      const gap01 = 1 - this.heat;
      // pressure reads two ways: they close in depth AND squeeze toward the runner
      let baseZ = U.lerp(0.55, 1.45, gap01);
      let scale = 1 - (baseZ - 0.55) * 0.22;
      const flank = U.lerp(0.70, 1.26, gap01);

      let oTargetX = px - flank;
      let dTargetX = px + flank;
      let oMode = 'run';
      let dMode = 'run';

      if (this.mode === 'catch') {
        this.catchT += dt;
        const k = U.clamp(this.catchT / 0.75, 0, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        baseZ = U.lerp(baseZ, 0.24, ease);
        scale = U.lerp(scale, 1.0, ease);
        oTargetX = U.lerp(oTargetX, px - 0.66, ease);
        dTargetX = U.lerp(dTargetX, px + 0.86, ease);
        oMode = this.catchT > 1.45 ? 'idle' : 'reach';
        dMode = this.catchT > 1.45 ? 'idle' : 'pounce';
      }

      // depth + lateral easing (lane changes read as a chase, not a snap)
      this.oz = U.damp(this.oz, baseZ, this.mode === 'catch' ? 9 : 2.4, dt);
      this.dz = U.damp(this.dz, baseZ - 0.30, this.mode === 'catch' ? 9 : 2.6, dt);
      this.ox = U.damp(this.ox, U.clamp(oTargetX, -2.98, 2.98), 6.5, dt);
      this.dx = U.damp(this.dx, U.clamp(dTargetX, -2.98, 2.98), 7.5, dt);
      this.os = U.damp(this.os, scale * 1.04, 4, dt);
      this.ds = U.damp(this.ds, scale * 1.06, 4, dt);

      const o = this.officer;
      o.root.position.set(this.ox, 0, this.oz);
      o.root.scale.setScalar(this.os);
      o.root.rotation.y = U.clamp((px - this.ox) * 0.10, -0.28, 0.28);

      const d = this.dog;
      d.root.position.set(this.dx, 0, this.dz);
      d.root.scale.setScalar(this.ds);
      d.root.rotation.y = U.clamp((px - this.dx) * 0.16, -0.45, 0.45);

      o.update(dt, speed, oMode, U.clamp((px - this.ox) * 0.22, -0.3, 0.3));
      d.update(dt, speed, dMode, U.clamp((px - this.dx) * 0.3, -0.4, 0.4));

      // occasional bark when the pressure is on
      if (this.mode === 'chase' && this.heat > 0.62) {
        this.barkT -= dt;
        if (this.barkT <= 0) {
          this.dog.bark();
          this.barkT = U.rand(1.6, 3.2);
        }
      }

      // dust under both runners
      if (ctx.particles && this.mode === 'chase') {
        this.dustT -= dt;
        if (this.dustT <= 0 && speed > 4) {
          this.dustT = 0.085;
          ctx.particles.burst(
            { x: this.ox + U.rand(-0.18, 0.18), y: 0.03, z: this.oz - 0.25 },
            { count: 1, colors: [0x9aa6c0, 0x6d7692], speed: 1.1, size: 0.05, life: 0.34, gravity: -1.6, up: 0.5 }
          );
          ctx.particles.burst(
            { x: this.dx + U.rand(-0.16, 0.16), y: 0.03, z: this.dz - 0.2 },
            { count: 1, colors: [0x9aa6c0, 0x7a8299], speed: 1.4, size: 0.045, life: 0.3, gravity: -2.2, up: 0.6 }
          );
        }
      }
    }
  }

  MR.Officer = Officer;
  MR.Dog = Dog;
  MR.Chase = Chase;
})();
