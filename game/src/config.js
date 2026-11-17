// Constants for Solara City: the city grid, districts, tuning and key bindings.
// One place for every magic number the other modules share.
export const PITCH = 78; // distance between road centre lines
export const ROAD_HALF = 7; // half the road width
export const BLOCK = PITCH - ROAD_HALF * 2; // building block size
export const GRID = 4; // roads at -4..4 * PITCH, so the city spans about 700 m
export const CITY_HALF = GRID * PITCH + ROAD_HALF;

export const DISTRICTS = [
  { name: 'Downtown', x0: -PITCH, z0: -PITCH, x1: PITCH, z1: PITCH, tall: true, palette: [0x3a4a6b, 0x4a5a7a, 0x2e3d5c, 0x5a6a8a], base: 26, extra: 42 },
  { name: 'Marina', x0: -CITY_HALF, z0: -CITY_HALF, x1: -PITCH, z1: PITCH, tall: false, palette: [0xd8c9a8, 0xc9b48a, 0xe8dcc0, 0xbfae86], base: 8, extra: 10 },
  { name: 'Old Town', x0: PITCH, z0: -CITY_HALF, x1: CITY_HALF, z1: -PITCH, tall: false, palette: [0xb08a5a, 0x9a7a52, 0xc09a68, 0x8a6a48], base: 9, extra: 9 },
  { name: 'Harbor', x0: -CITY_HALF, z0: PITCH, x1: -PITCH, z1: CITY_HALF, tall: false, palette: [0x6a7a8a, 0x5a6a7a, 0x7a8a9a, 0x4a5a6a], base: 10, extra: 12 },
  { name: 'Hillside', x0: PITCH, z0: PITCH, x1: CITY_HALF, z1: CITY_HALF, tall: false, palette: [0xa8b898, 0x98a888, 0xb8c8a8, 0x889878], base: 8, extra: 10 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[0];
}

/** Road centre lines (x = i*PITCH or z = j*PITCH, i,j in -GRID..GRID). */
export function nearestRoadCoord(v) {
  return Math.round(v / PITCH) * PITCH;
}

export function isOnRoad(x, z) {
  const dx = Math.abs(x - nearestRoadCoord(x));
  const dz = Math.abs(z - nearestRoadCoord(z));
  return dx < ROAD_HALF + 0.6 || dz < ROAD_HALF + 0.6;
}

/** Building footprints as axis-aligned boxes, generated with the city. */
export const SAVE_KEY = 'solara-city-save-v1';
export const BEST_KEY = 'solara-city-best-v1';

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 9.5,
  radius: 0.55,
  health: 100,
  jumpSpeed: 7.5,
  gravity: 22,
};

export const CAR = {
  accel: 16,
  brake: 34,
  reverseTop: 10,
  topSpeed: 34,
  steer: 1.9,
  grip: 6,
  health: 100,
};

export const WANTED = {
  decaySeconds: 26,
  policeByStars: [0, 1, 2, 3, 4, 5],
  copFootByStars: [0, 0, 0, 1, 2, 3],
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyE'],
  shoot: ['KeyF'],
  map: ['KeyM'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyU'],
  horn: ['KeyH'],
};

export const DAY_LENGTH = 480; // seconds for a full 24 h cycle
export const START_HOUR = 10.2; // late morning, sun high and bright
