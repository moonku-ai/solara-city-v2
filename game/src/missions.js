// Missions and story for Solara City. Raka, a courier in Solara City, takes jobs
// from Mira: steal a car, run courier drops, shake a three-star heat, then rob
// the Solara Bank. Missions start at their gold marker and pay cash on completion.
import * as THREE from '../vendor/three.module.min.js';
import { PITCH } from './config.js';
import { clamp, distance2D, formatTime } from './util.js';

const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    caller: 'MIRA',
    intro: 'Raka, you need wheels. Take any car on the street and bring it to my garage in Marina.',
    reward: 150,
    start: { x: -PITCH, z: -PITCH },
    steps: [
      { text: 'Get in a car (press E near one)', kind: 'car', target: null },
      { text: 'Drive the car to the Marina garage', kind: 'goto', target: { x: -3 * PITCH, z: PITCH } },
    ],
  },
  {
    id: 'm2',
    title: 'Night Courier',
    caller: 'MIRA',
    intro: 'Three parcels, three drops, and the clock is running. 150 seconds. Do not be late.',
    reward: 300,
    start: { x: 2 * PITCH, z: -2 * PITCH },
    timeLimit: 150,
    steps: [
      { text: 'Drop 1 of 3: Harbor docks', kind: 'goto', target: { x: -3 * PITCH, z: 3 * PITCH } },
      { text: 'Drop 2 of 3: Old Town square', kind: 'goto', target: { x: 3 * PITCH, z: -2 * PITCH } },
      { text: 'Drop 3 of 3: Hillside lookout', kind: 'goto', target: { x: 2 * PITCH, z: 3 * PITCH } },
    ],
  },
  {
    id: 'm3',
    title: 'Heat Rising',
    caller: 'MIRA',
    intro: 'The cops are onto you. Three stars. Lose them and get to the Hillside safehouse. Do not get caught.',
    reward: 450,
    start: { x: -PITCH, z: 2 * PITCH },
    steps: [
      { text: 'Reach the Hillside safehouse with the heat on', kind: 'goto', target: { x: 3 * PITCH, z: 3 * PITCH }, keepWanted: true },
    ],
  },
  {
    id: 'm4',
    title: 'The Big Score',
    caller: 'MIRA',
    intro: 'The Solara Bank. Four guards, one vault, and a very loud getaway. This is the one, Raka.',
    reward: 800,
    start: { x: PITCH, z: -PITCH },
    steps: [
      { text: 'Get to the Solara Bank', kind: 'goto', target: { x: PITCH, z: 0 } },
      { text: 'Take out the guards', kind: 'guards', target: { x: PITCH, z: 0 }, guards: 4 },
      { text: 'Grab the cash from the vault', kind: 'goto', target: { x: PITCH, z: 0 } },
      { text: 'Escape to the Hillside safehouse', kind: 'goto', target: { x: 3 * PITCH, z: 3 * PITCH }, keepWanted: true },
    ],
  },
];

export function createMissions(G) {
  // The objective beam: a gold pillar of light plus a pulsing ring on the road.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.35, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  beam.visible = false;
  G.scene.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.35;
  ring.visible = false;
  G.scene.add(ring);

  const missions = {
    defs: MISSIONS,
    done: 0, // missions completed (what the save stores)
    index: 0, // next mission to start
    active: null, // {def, step, timer, guardsLeft}
    markerPos: null, // current objective / start marker, for HUD and minimap
    markerKind: null, // 'start' | 'objective'
    pulse: 0,
  };

  function setMarker(x, z, kind) {
    missions.markerPos = { x, z };
    missions.markerKind = kind;
    beam.visible = true;
    ring.visible = true;
    beam.position.x = x;
    beam.position.z = z;
    ring.position.x = x;
    ring.position.z = z;
    beamMat.color.setHex(kind === 'start' ? 0x33ff88 : 0xffc233);
    ringMat.color.setHex(kind === 'start' ? 0x33ff88 : 0xffc233);
  }

  function clearMarker() {
    missions.markerPos = null;
    missions.markerKind = null;
    beam.visible = false;
    ring.visible = false;
  }

  missions.showNextStart = function showNextStart() {
    if (missions.index >= MISSIONS.length) {
      clearMarker();
      return;
    }
    const def = MISSIONS[missions.index];
    setMarker(def.start.x, def.start.z, 'start');
  };

  missions.startMission = function startMission(i) {
    const def = MISSIONS[i];
    missions.active = { def, step: 0, timer: def.timeLimit || 0, guardsLeft: 0 };
    missions.index = i + 1;
    if (def.id === 'm3') G.wanted.addWanted(3, 'The cops are onto you!');
    G.hud.phoneCall(def.caller, def.intro);
    G.hud.toast('Mission started: ' + def.title);
    G.audio.pickup();
    advanceToStep(0);
  };

  function advanceToStep(step) {
    const m = missions.active;
    if (!m) return;
    m.step = step;
    const s = m.def.steps[step];
    if (!s) {
      completeMission();
      return;
    }
    if (s.kind === 'goto' || s.kind === 'guards') setMarker(s.target.x, s.target.z, 'objective');
    else clearMarker();
    if (s.kind === 'guards') {
      m.guardsLeft = s.guards;
      for (let i = 0; i < s.guards; i += 1) {
        const a = (i / s.guards) * Math.PI * 2;
        G.combat.spawnGuard(s.target.x + Math.sin(a) * 9, s.target.z + Math.cos(a) * 9);
      }
      G.wanted.addWanted(2, 'The bank alarm is ringing!');
    }
    G.hud.setObjective(s.text);
  }

  function completeMission() {
    const m = missions.active;
    missions.active = null;
    missions.done += 1;
    G.player.cash += m.def.reward;
    G.audio.jingle();
    G.hud.toast('Mission complete: ' + m.def.title + '  +$' + m.def.reward);
    G.hud.setObjective(missions.done >= MISSIONS.length
      ? 'All missions complete! Free roam Solara City.'
      : 'Find the green marker to start the next job.');
    G.save.saveGame(G);
    if (missions.done >= MISSIONS.length) {
      clearMarker();
      G.hud.phoneCall('MIRA', 'That was the big one, Raka. Solara City is yours now. Go enjoy it.');
    } else {
      missions.showNextStart();
    }
  }

  function failMission(reason) {
    const m = missions.active;
    missions.active = null;
    G.hud.toast('Mission failed: ' + reason);
    G.hud.phoneCall('MIRA', 'That went sideways. Come back to the marker when you are ready to try again.');
    missions.index = MISSIONS.indexOf(m.def);
    missions.showNextStart();
    G.hud.setObjective('Find the green marker to retry: ' + m.def.title);
  }

  missions.onGuardKilled = function onGuardKilled(e) {
    const m = missions.active;
    if (!m) return;
    const s = m.def.steps[m.step];
    if (!s || s.kind !== 'guards') return;
    m.guardsLeft -= 1;
    G.hud.setObjective('Take out the guards (' + (s.guards - m.guardsLeft) + '/' + s.guards + ')');
    if (m.guardsLeft <= 0) {
      G.wanted.addWanted(2, 'The vault is open. Grab the cash!');
      advanceToStep(m.step + 1);
    }
  };

  missions.update = function update(dt) {
    missions.pulse += dt;
    const s = Math.sin(missions.pulse * 3) * 0.5 + 0.5;
    ringMat.opacity = 0.45 + s * 0.4;
    beamMat.opacity = 0.22 + s * 0.18;
    if (missions.active) {
      const m = missions.active;
      const step = m.def.steps[m.step];
      if (!step) return;
      if (m.def.timeLimit) {
        m.timer -= dt;
        G.hud.setTimer(Math.max(0, m.timer));
        if (m.timer <= 0) {
          failMission('Out of time.');
          return;
        }
      }
      if (step.kind === 'car') {
        if (G.player.car) advanceToStep(m.step + 1);
      } else if (step.kind === 'goto') {
        const d = distance2D(G.player.x, G.player.z, step.target.x, step.target.z);
        if (m.def.timeLimit) G.hud.setObjectiveMeta('⏱ ' + formatTime(Math.max(0, m.timer)) + ' · ' + Math.round(d) + ' m');
        else G.hud.setObjectiveDistance(Math.round(d));
        if (d < 7) {
          if (step.keepWanted && m.def.id === 'm3') {
            // Escape complete: the heat is called off once you arrive.
            G.wanted.stars = 0;
            G.wanted.decayTimer = 0;
          }
          if (step.keepWanted && m.def.id === 'm4') {
            G.wanted.stars = 0;
            G.wanted.decayTimer = 0;
          }
          G.audio.pickup();
          advanceToStep(m.step + 1);
        }
      }
    } else if (missions.index < MISSIONS.length) {
      // Standing on the green start marker begins the next job.
      const def = MISSIONS[missions.index];
      const d = distance2D(G.player.x, G.player.z, def.start.x, def.start.z);
      G.hud.setObjectiveDistance(Math.round(d));
      if (d < 7) missions.startMission(missions.index);
    }
  };

  missions.objectiveText = function objectiveText() {
    if (missions.active) {
      const s = missions.active.def.steps[missions.active.step];
      return s ? s.text : '';
    }
    return missions.done >= MISSIONS.length
      ? 'All missions complete! Free roam Solara City.'
      : 'Find the green marker to start the next job.';
  };

  missions.loadProgress = function loadProgress(doneCount) {
    missions.done = clamp(doneCount, 0, MISSIONS.length);
    missions.index = missions.done;
    missions.active = null;
    missions.showNextStart();
    if (missions.done >= MISSIONS.length) {
      G.hud.setObjective('All missions complete! Free roam Solara City.');
    }
  };

  return missions;
}
