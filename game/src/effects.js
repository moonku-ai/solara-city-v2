// Particle effects for Solara City: dust, smoke, sparks, muzzle flashes and
// explosions, from one reusable pool of small meshes, plus screen shake.
import * as THREE from '../vendor/three.module.min.js';
import { range } from './util.js';

const MAX_PARTICLES = 420;

export function createEffects(scene, rng) {
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const pool = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, gravity: 0, grow: 0 });
  }
  let cursor = 0;
  const flashLight = new THREE.PointLight(0xffaa33, 0, 30, 1.6);
  scene.add(flashLight);
  const effects = {
    shake: 0,
    flashTime: 0,
  };

  function spawn(x, y, z, vx, vy, vz, life, color, size, gravity, grow) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(size);
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity || 0;
    p.grow = grow || 0;
  }

  effects.dust = function dust(x, y, z, n) {
    for (let i = 0; i < (n || 4); i += 1) {
      spawn(x + range(rng, -0.4, 0.4), y + range(rng, 0, 0.3), z + range(rng, -0.4, 0.4),
        range(rng, -1.2, 1.2), range(rng, 0.4, 1.6), range(rng, -1.2, 1.2),
        range(rng, 0.25, 0.5), 0x9a8a72, range(rng, 0.35, 0.7), -0.5, 1.2);
    }
  };

  effects.smoke = function smoke(x, y, z, n) {
    for (let i = 0; i < (n || 6); i += 1) {
      spawn(x + range(rng, -0.5, 0.5), y + range(rng, 0, 0.6), z + range(rng, -0.5, 0.5),
        range(rng, -0.8, 0.8), range(rng, 1.2, 2.6), range(rng, -0.8, 0.8),
        range(rng, 0.8, 1.5), 0x555555, range(rng, 1.2, 2), -1.5, 2.2);
    }
  };

  effects.sparks = function sparks(x, y, z, n) {
    for (let i = 0; i < (n || 10); i += 1) {
      spawn(x, y, z, range(rng, -7, 7), range(rng, -2, 7), range(rng, -7, 7),
        range(rng, 0.2, 0.5), 0xffc233, range(rng, 0.5, 1), 14, 0);
    }
  };

  effects.muzzle = function muzzle(x, y, z) {
    spawn(x, y, z, 0, 0, 0, 0.07, 0xffe9a8, 2.4, 0, 0);
    effects.flash(x, y, z);
  };

  effects.explosion = function explosion(x, y, z) {
    for (let i = 0; i < 26; i += 1) {
      const a = range(rng, 0, Math.PI * 2);
      const sp = range(rng, 3, 11);
      spawn(x, y + 0.5, z, Math.cos(a) * sp, range(rng, 2, 9), Math.sin(a) * sp,
        range(rng, 0.4, 0.9), i % 3 === 0 ? 0xff8833 : 0xffcc44, range(rng, 1, 2.4), 10, 0);
    }
    effects.smoke(x, y + 1, z, 10);
    effects.flash(x, y + 1, z);
    effects.shake = Math.max(effects.shake, 0.7);
  };

  effects.flash = function flash(x, y, z) {
    flashLight.position.set(x, y, z);
    flashLight.intensity = 60;
    effects.flashTime = 0.09;
  };

  effects.addShake = function addShake(amount) {
    effects.shake = Math.max(effects.shake, amount);
  };

  effects.update = function update(dt) {
    for (const p of pool) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        p.mesh.material.opacity = 0;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.08) {
        p.mesh.position.y = 0.08;
        p.vy = Math.abs(p.vy) * 0.3;
      }
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = t < 0.6 ? t / 0.6 : 1;
      if (p.grow) p.mesh.scale.addScalar(p.grow * dt);
    }
    if (effects.flashTime > 0) {
      effects.flashTime -= dt;
      if (effects.flashTime <= 0) flashLight.intensity = 0;
    }
    effects.shake = Math.max(0, effects.shake - dt * 1.4);
  };

  /** Offset to add to the camera this frame (decays in update). */
  effects.shakeOffset = function shakeOffset() {
    const s = effects.shake;
    if (s <= 0.001) return { x: 0, y: 0 };
    return { x: (rng() - 0.5) * s * 0.5, y: (rng() - 0.5) * s * 0.5 };
  };

  return effects;
}
