/* ============================================================
   METRO RUSH 3D — player character "NOVA"
   Original stylised runner, fully procedural geometry.
   ============================================================ */
(function () {
  'use strict';

  const LANES = [-2.6, 0, 2.6];
  const GRAVITY = 30;
  const JUMP_V = 10.6;
  const SLIDE_TIME = 0.68;

  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color: color, roughness: 0.55, metalness: 0.08
    }, opts || {}));
  }

  function capsule(r, len, material) {
    const g = new THREE.CapsuleGeometry(r, len, 4, 10);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    return m;
  }

  function box(w, h, d, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.castShadow = true;
    return m;
  }

  class Player {
    constructor(scene) {
      this.scene = scene;
      this.lane = 1;
      this.laneX = 0;
      this.x = 0;
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
      this.sliding = false;
      this.slideT = 0;
      this.state = 'idle';
      this.phase = 0;
      this.alive = true;
      this.deadT = 0;
      this.boost = 0;
      this.magnet = 0;
      this.auraT = 0;
      this.stumbleT = 0;

      this._build();
    }

    _build() {
      const M = {
        jacket: mat(0x1de3ff, { roughness: 0.34, metalness: 0.28, emissive: 0x0a4a5c, emissiveIntensity: 0.85 }),
        jacketDark: mat(0x0b2f45, { roughness: 0.6, metalness: 0.2 }),
        pants: mat(0x241a4a, { roughness: 0.75, metalness: 0.05 }),
        skin: mat(0xf0c39c, { roughness: 0.72, metalness: 0.0 }),
        hair: mat(0x1b1030, { roughness: 0.55, metalness: 0.15 }),
        shoe: mat(0xf7f9ff, { roughness: 0.42, metalness: 0.1, emissive: 0x1a2233, emissiveIntensity: 0.4 }),
        sole: mat(0xff2e88, { roughness: 0.4, metalness: 0.1, emissive: 0x6b0033, emissiveIntensity: 0.8 }),
        pack: mat(0xff2e88, { roughness: 0.45, metalness: 0.2, emissive: 0x5c0025, emissiveIntensity: 0.7 }),
        visor: mat(0x0affff, { roughness: 0.12, metalness: 0.9, emissive: 0x00d5ff, emissiveIntensity: 1.6 }),
        trim: mat(0xffc93c, { roughness: 0.35, metalness: 0.7, emissive: 0x6a4b00, emissiveIntensity: 0.6 })
      };
      this.M = M;

      this.group = new THREE.Group();
      this.group.position.set(0, 0, 0);
      this.scene.add(this.group);

      this.body = new THREE.Group();
      this.group.add(this.body);

      /* ---- torso ---- */
      const torso = capsule(0.235, 0.40, M.jacket);
      torso.position.y = 1.20;
      torso.scale.set(1.06, 1.0, 0.82);
      this.body.add(torso);

      // chest plate / zip
      const plate = box(0.20, 0.34, 0.06, M.jacketDark);
      plate.position.set(0, 1.24, -0.20);
      this.body.add(plate);

      // collar
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.045, 6, 14), M.jacketDark);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 1.46, 0);
      collar.castShadow = true;
      this.body.add(collar);

      // hips
      const hips = box(0.34, 0.20, 0.24, M.pants);
      hips.position.y = 0.90;
      this.body.add(hips);

      /* ---- backpack ---- */
      const pack = box(0.28, 0.34, 0.15, M.pack);
      pack.position.set(0, 1.24, 0.235);
      this.body.add(pack);
      const packTop = box(0.26, 0.08, 0.17, M.trim);
      packTop.position.set(0, 1.42, 0.235);
      this.body.add(packTop);
      [-0.11, 0.11].forEach(function (x) {
        const strap = box(0.05, 0.36, 0.05, M.trim);
        strap.position.set(x, 1.24, -0.19);
        this.body.add(strap);
      }, this);

      /* ---- head ---- */
      this.head = new THREE.Group();
      this.head.position.set(0, 1.66, 0);
      this.body.add(this.head);

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.215, 18, 16), M.skin);
      skull.scale.set(1, 1.06, 0.98);
      skull.castShadow = true;
      this.head.add(skull);

      // visor (faces -Z = forward)
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.222, 18, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.30, Math.PI * 0.30), M.visor);
      visor.position.set(0, 0.02, 0);
      visor.rotation.y = -Math.PI / 2;
      this.head.add(visor);

      const band = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.024, 6, 22), M.jacketDark);
      band.rotation.y = Math.PI / 2;
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.055;
      this.head.add(band);

      // hair
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.226, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), M.hair);
      hair.position.set(0, 0.055, 0.02);
      hair.rotation.x = -0.18;
      hair.castShadow = true;
      this.head.add(hair);

      const quiff = box(0.16, 0.10, 0.16, M.hair);
      quiff.position.set(0, 0.21, -0.04);
      quiff.rotation.x = -0.5;
      this.head.add(quiff);

      /* ---- arms ---- */
      this.armL = this._makeArm(-1, M);
      this.armR = this._makeArm(1, M);
      this.body.add(this.armL, this.armR);

      /* ---- legs ---- */
      this.legL = this._makeLeg(-1, M);
      this.legR = this._makeLeg(1, M);
      this.body.add(this.legL, this.legR);

      /* ---- auras ---- */
      this.auraGroup = new THREE.Group();
      this.auraGroup.visible = false;
      this.group.add(this.auraGroup);

      const ringMat = new THREE.MeshBasicMaterial({ color: 0x25e5ff, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide });
      this.auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.035, 6, 24), ringMat);
      this.auraRing.rotation.x = Math.PI / 2;
      this.auraRing.position.y = 0.9;
      this.auraGroup.add(this.auraRing);

      const glowMat = new THREE.MeshBasicMaterial({ color: 0x25e5ff, transparent: true, opacity: 0.16, toneMapped: false, side: THREE.DoubleSide });
      this.auraShell = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.0, 12, 1, true), glowMat);
      this.auraShell.position.y = 1.0;
      this.auraGroup.add(this.auraShell);

      // magnet aura
      const magMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide });
      this.magRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.025, 5, 28), magMat);
      this.magRing.rotation.x = Math.PI / 2;
      this.magRing.position.y = 0.12;
      this.magRing.visible = false;
      this.group.add(this.magRing);

      // running dust anchor
      this.footY = 0;
    }

    _makeArm(side, M) {
      const g = new THREE.Group();
      g.position.set(side * 0.29, 1.40, 0);

      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), M.jacket);
      pad.castShadow = true;
      g.add(pad);

      const upper = capsule(0.085, 0.20, M.jacket);
      upper.position.y = -0.13;
      g.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      g.add(elbow);

      const fore = capsule(0.074, 0.20, M.jacketDark);
      fore.position.y = -0.12;
      elbow.add(fore);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), M.skin);
      hand.position.y = -0.25;
      hand.castShadow = true;
      elbow.add(hand);

      g.userData.elbow = elbow;
      return g;
    }

    _makeLeg(side, M) {
      const g = new THREE.Group();
      g.position.set(side * 0.135, 0.86, 0);

      const thigh = capsule(0.105, 0.24, M.pants);
      thigh.position.y = -0.16;
      g.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.33;
      g.add(knee);

      const shin = capsule(0.088, 0.24, M.pants);
      shin.position.y = -0.15;
      knee.add(shin);

      const shoe = box(0.155, 0.115, 0.33, M.shoe);
      shoe.position.set(0, -0.31, -0.055);
      knee.add(shoe);

      const sole = box(0.16, 0.045, 0.34, M.sole);
      sole.position.set(0, -0.365, -0.055);
      knee.add(sole);

      g.userData.knee = knee;
      return g;
    }

    /* ------------------------------------------------ */

    reset() {
      this.lane = 1;
      this.laneX = 0;
      this.x = 0;
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
      this.sliding = false;
      this.slideT = 0;
      this.state = 'idle';
      this.alive = true;
      this.deadT = 0;
      this.boost = 0;
      this.magnet = 0;
      this.stumbleT = 0;
      this.phase = 0;
      this.body.rotation.set(0, 0, 0);
      this.body.position.set(0, 0, 0);
      this.group.position.set(0, 0, 0);
      this.group.rotation.set(0, 0, 0);
      this.auraGroup.visible = false;
      this.magRing.visible = false;
      this.head.rotation.set(0, 0, 0);
    }

    get height() { return this.sliding ? 0.78 : 1.74; }
    get halfW() { return this.sliding ? 0.42 : 0.34; }
    get halfD() { return this.sliding ? 0.55 : 0.32; }

    moveLeft() {
      if (!this.alive) return false;
      if (this.lane > 0) { this.lane--; return true; }
      return false;
    }

    moveRight() {
      if (!this.alive) return false;
      if (this.lane < 2) { this.lane++; return true; }
      return false;
    }

    jump() {
      if (!this.alive) return false;
      if (!this.onGround) return false;
      this.vy = JUMP_V;
      this.onGround = false;
      this.sliding = false;
      this.slideT = 0;
      this.state = 'jump';
      return true;
    }

    slide() {
      if (!this.alive) return false;
      if (this.sliding) { this.slideT = Math.max(this.slideT, SLIDE_TIME * 0.6); return false; }
      if (!this.onGround) {
        // fast-fall into a slide
        this.vy = Math.min(this.vy, -18);
        this.sliding = true;
        this.slideT = SLIDE_TIME;
        return true;
      }
      this.sliding = true;
      this.slideT = SLIDE_TIME;
      return true;
    }

    /** short flinch used by the pursuit system on a close call */
    stumble() {
      if (!this.alive) return;
      this.stumbleT = 0.42;
    }

    kill() {
      if (!this.alive) return;
      this.alive = false;
      this.deadT = 0;
      this.state = 'dead';
      this.sliding = false;
    }

    /* ------------------------------------------------ */

    update(dt, speed) {
      // horizontal lane easing
      const targetX = LANES[this.lane];
      const prevX = this.x;
      this.x = MR.Utils.damp(this.x, targetX, 16, dt);
      this.laneX = targetX;

      // vertical
      if (!this.onGround) {
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.onGround = true;
          if (this.sliding) this.slideT = Math.min(this.slideT, SLIDE_TIME * 0.8);
        }
      }

      if (this.sliding) {
        this.slideT -= dt;
        if (this.slideT <= 0) this.sliding = false;
      }

      // state resolution
      if (this.alive) {
        if (!this.onGround) this.state = 'jump';
        else if (this.sliding) this.state = 'slide';
        else this.state = 'run';
      }

      this._animate(dt, speed, prevX);

      this.group.position.x = this.x;
      this.group.position.y = this.y;
      this.group.position.z = 0;

      // auras
      if (this.boost > 0) {
        this.auraT += dt;
        this.auraGroup.visible = true;
        const p = 1 + Math.sin(this.auraT * 14) * 0.06;
        this.auraRing.scale.setScalar(p);
        this.auraRing.position.y = 0.55 + Math.sin(this.auraT * 6) * 0.12;
        this.auraRing.material.opacity = 0.42 + Math.sin(this.auraT * 20) * 0.18;
        this.auraShell.material.opacity = 0.055 + Math.sin(this.auraT * 9) * 0.025;
      } else if (this.auraGroup.visible) {
        this.auraGroup.visible = false;
      }

      if (this.magnet > 0) {
        this.magRing.visible = true;
        this.magRing.rotation.z += dt * 2.4;
        this.magRing.position.y = 0.1 + Math.sin(performance.now() * 0.004) * 0.06;
        this.magRing.material.opacity = 0.22 + Math.sin(performance.now() * 0.008) * 0.10;
      } else if (this.magRing.visible) {
        this.magRing.visible = false;
      }
    }

    _animate(dt, speed, prevX) {
      const st = this.state;
      const lean = MR.Utils.clamp((this.x - prevX) / Math.max(dt, 0.001) * -0.035, -0.35, 0.35);

      let bodyRotX = 0.10;
      let bodyRotZ = lean * 0.6;
      let bodyRotY = lean * 0.5;
      let bodyY = 0;

      if (st === 'run') {
        this.phase += dt * (7.2 + speed * 0.30);
      } else if (st === 'jump') {
        this.phase += dt * 4;
      } else if (st === 'idle') {
        this.phase += dt * 1.6;
      } else if (st === 'slide') {
        this.phase += dt * 9;
      }

      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);

      const t = {
        legL: 0, legR: 0, kneeL: 0, kneeR: 0,
        armL: 0, armR: 0, elbL: 0, elbR: 0,
        headX: 0, headY: 0
      };

      if (st === 'run') {
        const amp = 0.95;
        t.legL = s * amp;
        t.legR = -s * amp;
        t.kneeL = Math.max(0, -s) * 1.15 + 0.12;
        t.kneeR = Math.max(0, s) * 1.15 + 0.12;
        t.armL = -s * 0.92;
        t.armR = s * 0.92;
        t.elbL = 1.05 + Math.max(0, s) * 0.35;
        t.elbR = 1.05 + Math.max(0, -s) * 0.35;
        bodyY = Math.abs(c) * 0.055;
        bodyRotX = 0.16;
        bodyRotZ += s * 0.035;
        t.headX = -0.06;
      } else if (st === 'jump') {
        const rising = this.vy > 0;
        t.legL = rising ? -0.95 : -0.35;
        t.legR = rising ? 0.55 : 0.25;
        t.kneeL = rising ? 1.75 : 0.55;
        t.kneeR = rising ? 0.75 : 0.9;
        t.armL = rising ? -1.15 : -0.75;
        t.armR = rising ? -0.9 : -0.55;
        t.elbL = 1.65; t.elbR = 1.5;
        bodyRotX = rising ? 0.18 : 0.06;
        t.headX = rising ? -0.12 : 0.08;
      } else if (st === 'slide') {
        bodyRotX = 0.86;
        bodyY = -0.42;
        t.legL = -1.92;
        t.legR = -1.42;
        t.kneeL = 0.12;
        t.kneeR = 0.80;
        t.armL = 1.30;
        t.armR = 0.80;
        t.elbL = 0.40;
        t.elbR = 0.75;
        t.headX = 0.16;
        bodyRotZ = 0;
        bodyRotY = 0;
      } else if (st === 'idle') {
        bodyY = Math.sin(this.phase) * 0.02;
        t.legL = 0.06; t.legR = -0.06;
        t.kneeL = 0.10; t.kneeR = 0.10;
        t.armL = -0.12 + Math.sin(this.phase * 0.9) * 0.06;
        t.armR = -0.12 - Math.sin(this.phase * 0.9) * 0.06;
        t.elbL = 0.32; t.elbR = 0.32;
        bodyRotX = 0.02;
        bodyRotZ = 0;
        bodyRotY = 0;
      } else if (st === 'dead') {
        this.deadT += dt;
        const k = Math.min(1, this.deadT * 2.2);
        // sits back on the rails instead of sinking through them
        bodyRotX = -0.25 - k * 0.72;
        bodyY = -k * 0.26;
        bodyRotZ = k * 0.34;
        t.legL = -0.5 - k * 0.75;
        t.legR = 0.35 + k * 0.55;
        t.kneeL = 1.35; t.kneeR = 0.55;
        t.armL = -1.5 - k * 0.55; t.armR = -1.2 - k * 0.45;
        t.elbL = 0.55; t.elbR = 0.95;
        t.headX = 0.32;
      }

      // flinch overlay: pitch forward, arms fly up
      if (this.stumbleT > 0) {
        this.stumbleT = Math.max(0, this.stumbleT - dt);
        const w = Math.sin(Math.min(1, this.stumbleT / 0.42) * Math.PI);
        bodyRotX += w * 0.62;
        bodyY -= w * 0.07;
        t.armL -= w * 1.5;
        t.armR -= w * 1.2;
        t.elbL += w * 0.9;
        t.elbR += w * 0.7;
        t.headX += w * 0.28;
      }

      const k = 14;
      this.body.position.y = MR.Utils.damp(this.body.position.y, bodyY, k, dt);
      this.body.rotation.x = MR.Utils.damp(this.body.rotation.x, bodyRotX, k, dt);
      this.body.rotation.z = MR.Utils.damp(this.body.rotation.z, bodyRotZ, 9, dt);
      this.body.rotation.y = MR.Utils.damp(this.body.rotation.y, bodyRotY, 9, dt);

      this.legL.rotation.x = MR.Utils.damp(this.legL.rotation.x, t.legL, k, dt);
      this.legR.rotation.x = MR.Utils.damp(this.legR.rotation.x, t.legR, k, dt);
      this.legL.userData.knee.rotation.x = MR.Utils.damp(this.legL.userData.knee.rotation.x, t.kneeL, k, dt);
      this.legR.userData.knee.rotation.x = MR.Utils.damp(this.legR.userData.knee.rotation.x, t.kneeR, k, dt);

      this.armL.rotation.x = MR.Utils.damp(this.armL.rotation.x, t.armL, k, dt);
      this.armR.rotation.x = MR.Utils.damp(this.armR.rotation.x, t.armR, k, dt);
      this.armL.rotation.z = MR.Utils.damp(this.armL.rotation.z, 0.14, k, dt);
      this.armR.rotation.z = MR.Utils.damp(this.armR.rotation.z, -0.14, k, dt);
      this.armL.userData.elbow.rotation.x = MR.Utils.damp(this.armL.userData.elbow.rotation.x, -t.elbL, k, dt);
      this.armR.userData.elbow.rotation.x = MR.Utils.damp(this.armR.userData.elbow.rotation.x, -t.elbR, k, dt);

      this.head.rotation.x = MR.Utils.damp(this.head.rotation.x, t.headX, 10, dt);
    }
  }

  MR.Player = Player;
  MR.LANES = LANES;
})();
