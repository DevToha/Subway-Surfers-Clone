/* ============================================================
   METRO RUSH 3D — GPU-friendly instanced particle system
   ============================================================ */
(function () {
  'use strict';

  const _dummy = new THREE.Object3D();
  const _color = new THREE.Color();

  class Particles {
    constructor(scene, max) {
      this.max = max || 220;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
      this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
      scene.add(this.mesh);

      this.items = [];
      for (let i = 0; i < this.max; i++) {
        this.items.push({
          active: false, life: 0, maxLife: 1,
          px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
          size: 0.2, grav: -14, drag: 0.99, spin: 0,
          rx: 0, ry: 0, rz: 0
        });
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        this.mesh.setColorAt(i, _color.setHex(0xffffff));
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.cursor = 0;
    }

    /**
     * @param {THREE.Vector3|{x,y,z}} pos
     * @param {object} o count,color(s),speed,size,life,gravity,spread
     */
    burst(pos, o) {
      o = o || {};
      const count = o.count || 12;
      const colors = o.colors || [o.color === undefined ? 0xffffff : o.color];
      const speed = o.speed === undefined ? 4 : o.speed;
      const size = o.size === undefined ? 0.16 : o.size;
      const life = o.life === undefined ? 0.7 : o.life;
      const grav = o.gravity === undefined ? -18 : o.gravity;
      const up = o.up === undefined ? 1 : o.up;
      const spread = o.spread === undefined ? 1 : o.spread;

      for (let i = 0; i < count; i++) {
        const idx = this.cursor;
        const p = this.items[idx];
        this.cursor = (this.cursor + 1) % this.max;
        p.active = true;
        p.life = 0;
        p.maxLife = life * (0.65 + Math.random() * 0.7);
        p.px = pos.x + (Math.random() - 0.5) * (o.jitter || 0.3);
        p.py = pos.y + (Math.random() - 0.5) * (o.jitter || 0.3);
        p.pz = pos.z + (Math.random() - 0.5) * (o.jitter || 0.3);
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.9);
        p.vx = Math.cos(a) * s * spread;
        p.vz = Math.sin(a) * s * spread;
        p.vy = (0.4 + Math.random()) * speed * 0.55 * up;
        p.size = size * (0.6 + Math.random() * 0.9);
        p.grav = grav;
        p.drag = o.drag === undefined ? 0.94 : o.drag;
        p.rx = Math.random() * 6;
        p.ry = Math.random() * 6;
        p.rz = Math.random() * 6;
        p.spin = (Math.random() - 0.5) * 14;
        const col = colors[Math.floor(Math.random() * colors.length)];
        this.mesh.setColorAt(idx, _color.setHex(col));
      }
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt) {
      let dirty = false;
      for (let i = 0; i < this.max; i++) {
        const p = this.items[i];
        if (!p.active) continue;
        dirty = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -999, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          this.mesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        const k = 1 - p.life / p.maxLife;
        p.vy += p.grav * dt;
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d; p.vz *= d;
        p.px += p.vx * dt;
        p.py += p.vy * dt;
        p.pz += p.vz * dt;
        if (p.py < 0.04) { p.py = 0.04; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        p.rx += p.spin * dt;
        p.ry += p.spin * 0.7 * dt;

        _dummy.position.set(p.px, p.py, p.pz);
        _dummy.rotation.set(p.rx, p.ry, p.rz);
        _dummy.scale.setScalar(p.size * Math.max(0.02, k * 1.15));
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
      }
      if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    }

    reset() {
      for (let i = 0; i < this.max; i++) {
        const p = this.items[i];
        p.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  MR.Particles = Particles;
})();
