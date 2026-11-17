// Solara City itself: the road grid, five districts of procedural buildings,
// props, the beach and bay to the west, and the day/night cycle. Buildings are
// boxes with canvas-painted window textures; nothing is loaded from the network.
import * as THREE from '../vendor/three.module.min.js';
import { PITCH, ROAD_HALF, BLOCK, GRID, CITY_HALF, DISTRICTS, districtAt, START_HOUR, DAY_LENGTH } from './config.js';
import { clamp, lerp, pick, range, rangeInt } from './util.js';

function makeWindowTexture(rng, baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rng() < litRatio;
      const shade = lit ? '#ffd98a' : (rng() < 0.5 ? '#24384e' : '#3a4f66');
      ctx.fillStyle = shade;
      ctx.fillRect(8 + c * 19, 10 + r * 17, 12, 10);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 128, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A road tile: asphalt with one centre dash, long along the road's direction.
// `horizontal` roads run along X (dash long in U); vertical roads run along Z.
function makeRoadTexture(horizontal) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2e2e33';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#3a3a40';
  for (let i = 0; i < 40; i += 1) ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
  ctx.fillStyle = '#d8c95a';
  if (horizontal) ctx.fillRect(18, 30, 28, 4);
  else ctx.fillRect(30, 18, 4, 28);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const city = {
    colliders: [], // {x, z, hx, hz}
    buildings: [],
    lamps: [], // lamp head materials, lit at night
    headlightMats: [],
    timeOfDay: START_HOUR,
    sun: null,
    moon: null,
    hemi: null,
    skyTop: null,
    group: new THREE.Group(),
  };
  scene.add(city.group);

  // Sky: a big gradient dome is overkill; fog + clear colour carry the look.
  scene.fog = new THREE.Fog(0x87b5e0, 120, 620);
  city.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a44, 0.9);
  scene.add(city.hemi);
  city.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  city.sun.position.set(120, 180, 60);
  scene.add(city.sun);
  scene.add(city.sun.target);
  city.moon = new THREE.DirectionalLight(0x8aa0ff, 0);
  city.moon.position.set(-100, 140, -80);
  scene.add(city.moon);
  scene.add(city.moon.target);

  // Ground: grass base, then a concrete city slab, sand and bay to the west.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  city.group.add(ground);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_HALF * 2 + 24, 0.3, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: 0x8a8a82 }),
  );
  slab.position.y = -0.15;
  city.group.add(slab);

  // Bay and beach west of the city.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 1400),
    new THREE.MeshLambertMaterial({ color: 0x2a7a9a }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-CITY_HALF - 170, 0.02, 0);
  city.group.add(water);
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.3, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
  );
  sand.position.set(-CITY_HALF - 22, -0.15, 0);
  city.group.add(sand);

  // Roads: dark strips with a dashed centre line, one per grid line.
  const roadTexH = makeRoadTexture(true);
  const roadTexV = makeRoadTexture(false);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexH });
  const span = CITY_HALF * 2 + 24;
  for (let i = -GRID; i <= GRID; i += 1) {
    const c = i * PITCH;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_HALF * 2), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, c);
    roadTexH.repeat.set(span / 12, 1);
    city.group.add(h);
    const vMat = new THREE.MeshLambertMaterial({ map: roadTexV });
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, span), vMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.03, 0);
    roadTexV.repeat.set(1, span / 12);
    city.group.add(v);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.03, 0);
    city.group.add(v);
  }

  // Buildings, one or two per block, with district palettes and heights.
  const textures = [];
  for (let i = 0; i < 8; i += 1) {
    textures.push(makeWindowTexture(rng, pick(rng, [0x4a5a7a, 0x6a5a4a, 0x5a6a7a, 0x7a6a5a, 0x3a4a5a, 0x8a7a6a, 0x556677, 0x776655]), 0.42));
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  for (let bi = -GRID; bi < GRID; bi += 1) {
    for (let bj = -GRID; bj < GRID; bj += 1) {
      const cx = bi * PITCH + PITCH / 2;
      const cz = bj * PITCH + PITCH / 2;
      const d = districtAt(cx, cz);
      const count = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = count === 2 ? BLOCK * 0.42 : BLOCK * 0.8;
        const dep = count === 2 ? BLOCK * 0.42 : BLOCK * 0.8;
        const ox = count === 2 ? (k === 0 ? -BLOCK * 0.22 : BLOCK * 0.22) : 0;
        const oz = count === 2 ? (k === 0 ? -BLOCK * 0.18 : BLOCK * 0.18) : 0;
        const h = d.base + rng() * d.extra + (d.tall ? rng() * 26 : 0);
        const tex = pick(rng, textures);
        tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 14)));
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), [mat, mat, roofMat, roofMat, mat, mat]);
        b.position.set(cx + ox, h / 2, cz + oz);
        city.group.add(b);
        city.colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2, hz: dep / 2, h });
        city.buildings.push(b);
        // Rooftop box on tall towers.
        if (h > 34 && rng() < 0.5) {
          const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 3, dep * 0.3), roofMat);
          top.position.set(cx + ox, h + 1.5, cz + oz);
          city.group.add(top);
        }
      }
      // A tree or two on quieter blocks.
      if (rng() < 0.5 && !d.tall) {
        addTree(city, cx + range(rng, -BLOCK / 3, BLOCK / 3), cz + range(rng, -BLOCK / 3, BLOCK / 3), rng);
      }
    }
  }

  // Streetlights along every road, both sides, every other block.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const lampGeo = new THREE.SphereGeometry(0.26, 8, 6);
  for (let i = -GRID; i <= GRID; i += 1) {
    for (let j = -GRID; j < GRID; j += 2) {
      const x = i * PITCH;
      const z = j * PITCH + PITCH / 2;
      addLamp(city, x + ROAD_HALF + 2.2, z, poleMat, lampGeo);
      addLamp(city, x - ROAD_HALF - 2.2, z + PITCH / 2, poleMat, lampGeo);
      addLamp(city, z, x + ROAD_HALF + 2.2, poleMat, lampGeo);
      addLamp(city, z + PITCH / 2, x - ROAD_HALF - 2.2, poleMat, lampGeo);
    }
  }

  // Hydrants and benches for street life.
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc22a2a });
  const hydrantGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
  for (let i = 0; i < 40; i += 1) {
    const x = rangeInt(rng, -GRID, GRID) * PITCH + (rng() < 0.5 ? ROAD_HALF + 1 : -ROAD_HALF - 1);
    const z = range(rng, -CITY_HALF, CITY_HALF);
    const hy = new THREE.Mesh(hydrantGeo, hydrantMat);
    hy.position.set(x, 0.4, z);
    city.group.add(hy);
  }

  // Landmark: the Solara Tower in the middle of Downtown, with a beacon.
  const towerTex = makeWindowTexture(rng, 0x2e4a6a, 0.5);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(26, 110, 26),
    new THREE.MeshLambertMaterial({ map: towerTex }));
  tower.position.set(0, 55, 0);
  city.group.add(tower);
  city.colliders.push({ x: 0, z: 0, hx: 13, hz: 13, h: 110 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), beaconMat);
  beacon.position.set(0, 111, 0);
  city.group.add(beacon);
  city.beacon = beacon;

  // Marina pier into the bay.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.position.set(-CITY_HALF - 40, 0.5, -PITCH);
  city.group.add(pier);

  updateCity(city, 0);
  return city;
}

function addTree(city, x, z, rng) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  trunk.position.set(x, 1.1, z);
  city.group.add(trunk);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 1.4, 2.2), 8, 6),
    new THREE.MeshLambertMaterial({ color: pick(rng, [0x3a7a3a, 0x4a8a3a, 0x2a6a3a]) }));
  leaf.position.set(x, 3.15, z);
  city.group.add(leaf);
}

function addLamp(city, x, z, poleMat, lampGeo) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), poleMat);
  pole.position.set(x, 2.7, z);
  city.group.add(pole);
  const mat = new THREE.MeshBasicMaterial({ color: 0x555533 });
  const lamp = new THREE.Mesh(lampGeo, mat);
  lamp.position.set(x, 5.45, z);
  city.group.add(lamp);
  city.lamps.push(mat);
}

const SKY_DAY = new THREE.Color(0x87b5e0);
const SKY_DUSK = new THREE.Color(0xff9a5c);
const SKY_NIGHT = new THREE.Color(0x0d1428);
const FOG_DAY = new THREE.Color(0x9ab8d8);

/** Advance the clock and relight the city. dt in seconds. */
export function updateCity(city, dt) {
  city.timeOfDay = (city.timeOfDay + (dt / DAY_LENGTH) * 24) % 24;
  const hour = city.timeOfDay;
  // Sun elevation: 0 at 6:00 and 18:00, 1 at noon.
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const elev = Math.sin(sunAngle);
  const dayness = clamp(elev * 2.2 + 0.25, 0, 1);
  const duskness = clamp(1 - Math.abs(elev) * 3, 0, 1) * (hour > 6 && hour < 20 ? 1 : 0);
  const sky = new THREE.Color().copy(SKY_NIGHT).lerp(SKY_DAY, dayness).lerp(SKY_DUSK, duskness * 0.55);
  city.sun.intensity = 0.25 + dayness * 2.2;
  city.sun.position.set(Math.cos(sunAngle) * 220, Math.max(30, elev * 220 + 20), 90);
  city.sun.color.setHex(duskness > 0.4 ? 0xffb36b : 0xfff2d8);
  city.moon.intensity = dayness < 0.25 ? 0.5 : 0;
  city.hemi.intensity = 0.3 + dayness * 0.8;
  if (city.beacon) city.beacon.material.color.setHex(hour > 18 || hour < 6 ? 0xff2222 : 0x882222);
  const night = dayness < 0.35;
  for (const m of city.lamps) m.color.setHex(night ? 0xffe9a8 : 0x555533);
  // scene fog and background follow the sky; the scene is reachable via the sun's parent.
  const scene = city.sun.parent;
  if (scene && scene.fog) {
    scene.fog.color.copy(sky).lerp(FOG_DAY, 0.25);
    scene.background = scene.background || new THREE.Color();
    scene.background.copy(sky);
  }
  return { dayness, night };
}

/** Push a circle (x, z, radius) out of every building it overlaps. Returns corrected [x, z]. */
export function collideCircle(city, x, z, radius) {
  for (const c of city.colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const px = c.hx + radius - Math.abs(dx);
    const pz = c.hz + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) x = c.x + (dx > 0 ? c.hx + radius : -(c.hx + radius));
      else z = c.z + (dz > 0 ? c.hz + radius : -(c.hz + radius));
    }
  }
  const lim = CITY_HALF + 30;
  x = clamp(x, -lim - 90, lim);
  z = clamp(z, -lim, lim);
  return [x, z];
}

/** A random point on a road, optionally near (x, z). */
export function randomRoadPoint(rng, nearX, nearZ, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    const horizontal = rng() < 0.5;
    const line = rangeInt(rng, -GRID, GRID) * PITCH;
    const along = range(rng, -CITY_HALF + 20, CITY_HALF - 20);
    const x = horizontal ? along : line;
    const z = horizontal ? line : along;
    if (nearX !== undefined && Math.hypot(x - nearX, z - nearZ) < (minDist || 30)) continue;
    return { x, z, heading: horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) };
  }
  return { x: 0, z: -PITCH, heading: 0 };
}

export function randomIntersection(rng) {
  return {
    x: rangeInt(rng, -GRID, GRID) * PITCH,
    z: rangeInt(rng, -GRID, GRID) * PITCH,
  };
}
