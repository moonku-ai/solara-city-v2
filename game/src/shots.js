// Screenshot scenes for Solara City, behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot, so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { PITCH } from './config.js';
import { angleDelta, clamp } from './util.js';
import { makeCar, tryEnterExitCar, nearestCar } from './vehicles.js';

const STEP = 1 / 60;

/** Drive the player's car toward (tx, tz) for `seconds`, steering at the road. */
function driveToward(G, stepFn, tx, tz, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    const car = G.player.car;
    if (!car || car.dead) break;
    const wantHeading = Math.atan2(tx - car.x, tz - car.z);
    const dh = angleDelta(car.heading, wantHeading);
    // Ease off when a car is right ahead, so the shot is a cruise, not a crash.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let blocked = false;
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 15 && Math.abs(dx * fz - dz * fx) < 2.6) {
        blocked = true;
        break;
      }
    }
    stepFn(STEP, {
      up: !blocked, down: false,
      left: dh > 0.06, right: dh < -0.06,
      jump: false, run: false, handbrake: false, shootKey: false,
    });
  }
}

/** Pull a camera position out of any building it sits in, toward (tx, tz). */
function unblockCamera(G, x, y, z, tx, tz) {
  for (let tries = 0; tries < 24; tries += 1) {
    let inside = false;
    for (const c of G.city.colliders) {
      if (y < (c.h || 20) + 0.5 && Math.abs(x - c.x) < c.hx + 0.9 && Math.abs(z - c.z) < c.hz + 0.9) {
        inside = true;
        break;
      }
    }
    if (!inside) return { x, y, z };
    x += (tx - x) * 0.15;
    z += (tz - z) * 0.15;
    y = Math.max(y, 7);
  }
  return { x, y, z };
}

/** Frame a chase from ahead of the car, looking back down the road: the
 * player's car drives toward the camera with the police behind it. */
function frameChase(G) {
  const car = G.player.car;
  if (!car) return;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  const raw = unblockCamera(G, car.x + fx * 22 + rx * 11, 7, car.z + fz * 22 + rz * 11, car.x, car.z);
  G.camera.position.set(raw.x, raw.y, raw.z);
  G.camera.lookAt(car.x - fx * 10, 1.5, car.z - fz * 10);
  G.camYaw = car.heading + 1.0;
  G.camPitch = 0.3;
  G.camDist = 20;
}

/** Frame the player's car from a three-quarter rear angle for a screenshot. */
function frameCar(G, sideAngle, dist, pitch, lookAhead) {
  const car = G.player.car;
  if (!car) return;
  const yaw = car.heading + Math.PI + sideAngle;
  const cp = Math.cos(pitch);
  const raw = unblockCamera(G,
    car.x + Math.sin(yaw) * cp * dist, 1.4 + Math.sin(pitch) * dist, car.z + Math.cos(yaw) * cp * dist,
    car.x, car.z);
  const ahead = lookAhead === undefined ? 8 : lookAhead;
  G.camera.position.set(raw.x, raw.y, raw.z);
  G.camera.lookAt(car.x + Math.sin(car.heading) * ahead, 1.2, car.z + Math.cos(car.heading) * ahead);
  G.camYaw = yaw;
  G.camPitch = pitch;
  G.camDist = dist;
}

/** Put the player in the nearest parked car (or spawn one beside them). */
function putPlayerInCar(G, x, z, heading, color) {
  const car = makeCar(G, x, z, heading, { kind: 'parked', driver: false, color: color });
  G.player.x = x + 2;
  G.player.z = z + 2;
  const entered = tryEnterExitCar(G);
  if (!entered) {
    G.player.car = car;
    car.kind = 'player';
  }
  return car;
}

function showTitleCard(G) {
  const hasSave = G.save.hasSave();
  const save = G.save.loadGame();
  const body = '<p class="story">Raka arrives in <b>Solara City</b> with $100 and a phone full of jobs. '
    + 'Steal cars, outrun the police, run parcels across town — and pull the one big score that sets you free.</p>'
    + '<p class="controls"><b>WASD</b> move / drive &nbsp;·&nbsp; <b>Mouse drag</b> camera &nbsp;·&nbsp; <b>E</b> enter / steal car '
    + '&nbsp;·&nbsp; <b>F / Click</b> shoot &nbsp;·&nbsp; <b>Space</b> jump / handbrake &nbsp;·&nbsp; <b>Shift</b> run '
    + '&nbsp;·&nbsp; <b>M</b> big map &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>U</b> mute</p>'
    + (save ? '<p class="saveinfo">Saved game: $' + save.cash + ' · ' + save.missionsDone + ' of 4 missions done</p>' : '')
    + '<p class="fineprint">An original game. No real city, person or brand — Solara City is fiction. '
    + 'Progress saves automatically after every mission.</p>';
  const buttons = [];
  if (hasSave) buttons.push({ label: 'Continue', primary: true, fn: () => {} });
  buttons.push({ label: hasSave ? 'New game' : 'Start game', primary: !hasSave, fn: () => {} });
  G.hud.showScreen('SOLARA CITY', 'An open-world crime game', body, buttons);
}

/**
 * Stage the named scene and return the screen it should paint on.
 * The world is stepped forward with the autopilot so traffic, police and the
 * mission beam are all live in the frame.
 */
export function stageShot(name, G, stepFn) {
  G.hud.hideScreen();
  G.screen = 'play';
  if (name === 'start') {
    // Golden hour over Downtown, title card on top, tower behind.
    G.city.timeOfDay = 17.4;
    G.player.x = 0;
    G.player.z = 156;
    G.player.heading = Math.PI;
    G.camYaw = 0;
    G.camPitch = 0.22;
    G.camDist = 16;
    // A few cars cruising the avenue for life.
    for (let i = 0; i < 5; i += 1) driveIdle(G, stepFn, 1.2);
    // Wide elevated view of Downtown and the Solara Tower behind the card.
    G.camera.position.set(124, 70, 181);
    G.camera.lookAt(0, 22, 0);
    G.screen = 'title';
    showTitleCard(G);
    return 'title';
  }
  if (name === 'drive') {
    // Cruising the Marina avenue in a stolen Comet, traffic all around.
    G.city.timeOfDay = 10.2;
    G.player.cash = 1250;
    putPlayerInCar(G, -260, -PITCH, Math.PI / 2, 0x2ac2b0);
    driveToward(G, stepFn, 300, -PITCH, 5.5);
    frameCar(G, 0.35, 13, 0.3);
    return 'play';
  }
  if (name === 'chase') {
    // Three-star heat at dusk: two police cars closing in behind.
    G.city.timeOfDay = 17.2;
    G.player.cash = 2450;
    putPlayerInCar(G, -260, PITCH, Math.PI / 2, 0xc22a2a);
    G.wanted.addWanted(3, '');
    // Two cruisers right behind, so the chase is in the frame from the start.
    for (const back of [14, 26]) {
      const pc = makeCar(G, -260 - back, PITCH + (back === 14 ? 2 : -2), Math.PI / 2,
        { kind: 'police', police: true, color: 0xe8e8e8 });
      pc.targetSpeed = 36;
      G.wanted.policeCars.push(pc);
    }
    driveToward(G, stepFn, 300, PITCH, 4.5);
    frameChase(G);
    return 'play';
  }
  // mission: the Night Courier run, gold beam ahead, first drop in sight.
  G.city.timeOfDay = 13.5;
  G.player.cash = 1750;
  G.missions.startMission(1);
  putPlayerInCar(G, -3 * PITCH + 55, 3 * PITCH, -Math.PI / 2, 0xd8b62a);
  driveToward(G, stepFn, -3 * PITCH, 3 * PITCH, 1.8);
  frameCar(G, 0.35, 13, 0.3);
  return 'play';
}

/** A short idle step so traffic and pedestrians move before a still frame. */
function driveIdle(G, stepFn, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    stepFn(STEP, { up: false, down: false, left: false, right: false, jump: false, run: false, handbrake: false, shootKey: false });
  }
}
