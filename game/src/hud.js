// HUD for Solara City: cash, health, wanted stars, the minimap (a 2D canvas
// redrawn at 8 Hz so it never stalls the WebGL layer), the big map, toasts,
// phone calls, and the title / pause / busted / wasted screens.
import { CITY_HALF, DISTRICTS, districtAt } from './config.js';
import { clamp, formatCash, formatClock, formatTime } from './util.js';

const MINIMAP_SIZE = 200;
const MINIMAP_INTERVAL = 0.12;

export function createHud(G) {
  const root = document.getElementById('hud');
  const hud = {
    minimapTimer: 0,
    toasts: [],
  };

  function el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    (parent || root).appendChild(e);
    return e;
  }

  // Top-left: cash, health, clock, district.
  const stats = el('div', 'hud-stats');
  const cashEl = el('div', 'hud-cash', stats, '$0');
  const healthWrap = el('div', 'hud-health', stats);
  el('span', 'hud-label', healthWrap, 'HEALTH');
  const healthBar = el('div', 'hud-health-bar', healthWrap);
  const healthFill = el('div', 'hud-health-fill', healthBar);
  const clockEl = el('div', 'hud-clock', stats, '');
  const districtEl = el('div', 'hud-district', stats, '');

  // Top-right: wanted stars + mute.
  const wantedWrap = el('div', 'hud-wanted');
  const starsEl = el('div', 'hud-stars', wantedWrap, '☆☆☆☆☆');
  const muteBtn = el('button', 'hud-mute', wantedWrap, '♪');
  muteBtn.title = 'Mute (U)';
  muteBtn.addEventListener('click', () => {
    const muted = G.audio.toggleMute();
    muteBtn.textContent = muted ? '✕' : '♪';
    muteBtn.classList.toggle('muted', muted);
  });

  // Top-centre: mission objective.
  const objectiveWrap = el('div', 'hud-objective');
  const objectiveTitle = el('div', 'hud-objective-title', objectiveWrap, 'SOLARA CITY');
  const objectiveText = el('div', 'hud-objective-text', objectiveWrap, '');
  const objectiveMeta = el('div', 'hud-objective-meta', objectiveWrap, '');

  // Bottom-right: speed and car health.
  const speedWrap = el('div', 'hud-speed');
  const speedEl = el('div', 'hud-speed-num', speedWrap, '');
  const speedLabel = el('div', 'hud-speed-label', speedWrap, '');
  const carHealthWrap = el('div', 'hud-carhealth', speedWrap);
  const carHealthFill = el('div', 'hud-carhealth-fill', carHealthWrap);

  // Bottom-left: minimap.
  const mapWrap = el('div', 'hud-minimap-wrap');
  el('div', 'hud-minimap-title', mapWrap, 'SOLARA CITY');
  const minimap = document.createElement('canvas');
  minimap.width = MINIMAP_SIZE;
  minimap.height = MINIMAP_SIZE;
  minimap.className = 'hud-minimap';
  mapWrap.appendChild(minimap);
  const minimapCtx = minimap.getContext('2d', { desynchronized: true });

  // Centre: crosshair and interaction prompt.
  const crosshair = el('div', 'hud-crosshair', root, '+');
  const promptEl = el('div', 'hud-prompt', root, '');

  // Toasts above the minimap.
  const toastWrap = el('div', 'hud-toasts');

  // Phone call banner.
  const phoneWrap = el('div', 'hud-phone');
  const phoneCaller = el('div', 'hud-phone-caller', phoneWrap, '');
  const phoneText = el('div', 'hud-phone-text', phoneWrap, '');
  let phoneTimer = 0;

  // Damage flash and vignette.
  const damageFlash = el('div', 'hud-damage');
  const helpEl = el('div', 'hud-help', root,
    'WASD move / drive · Mouse drag camera · E enter car · F shoot · Space jump / handbrake · M map · P pause');

  // Big map overlay.
  const bigMapWrap = el('div', 'hud-bigmap');
  const bigMapCanvas = document.createElement('canvas');
  bigMapCanvas.width = 640;
  bigMapCanvas.height = 640;
  bigMapCanvas.className = 'hud-bigmap-canvas';
  bigMapWrap.appendChild(bigMapCanvas);
  const bigMapCtx = bigMapCanvas.getContext('2d', { desynchronized: true });
  const bigMapHint = el('div', 'hud-bigmap-hint', bigMapWrap, 'SOLARA CITY — M to close');
  bigMapWrap.style.display = 'none';

  // Full-screen screens: title, pause, wasted/busted.
  const screenWrap = el('div', 'hud-screen');
  const screenCard = el('div', 'hud-screen-card', screenWrap);
  const screenTitle = el('h1', 'hud-screen-title', screenCard, 'SOLARA CITY');
  const screenSub = el('div', 'hud-screen-sub', screenCard, '');
  const screenBody = el('div', 'hud-screen-body', screenCard, '');
  const screenButtons = el('div', 'hud-screen-buttons', screenCard);

  function drawMap(ctx, size, withLabels) {
    const scale = size / ((CITY_HALF + 60) * 2);
    const toX = (x) => size / 2 + x * scale;
    const toZ = (z) => size / 2 + z * scale;
    ctx.fillStyle = '#101c26';
    ctx.fillRect(0, 0, size, size);
    // Bay and beach.
    ctx.fillStyle = '#1e5a74';
    ctx.fillRect(0, 0, toX(-CITY_HALF - 12), size);
    ctx.fillStyle = '#c9b183';
    ctx.fillRect(toX(-CITY_HALF - 12), 0, toX(-CITY_HALF) - toX(-CITY_HALF - 12), size);
    // Blocks.
    ctx.fillStyle = '#2c3440';
    for (const c of G.city.colliders) {
      ctx.fillRect(toX(c.x - c.hx), toZ(c.z - c.hz), c.hx * 2 * scale, c.hz * 2 * scale);
    }
    // Roads.
    ctx.strokeStyle = '#565e6a';
    ctx.lineWidth = Math.max(1, 14 * scale);
    for (let i = -4; i <= 4; i += 1) {
      const c = i * 78;
      ctx.beginPath();
      ctx.moveTo(toX(-CITY_HALF - 12), toZ(c));
      ctx.lineTo(toX(CITY_HALF + 12), toZ(c));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(c), toZ(-CITY_HALF - 12));
      ctx.lineTo(toX(c), toZ(CITY_HALF + 12));
      ctx.stroke();
    }
    if (withLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold ' + Math.round(size / 34) + 'px sans-serif';
      ctx.textAlign = 'center';
      for (const d of DISTRICTS) {
        ctx.fillText(d.name.toUpperCase(), toX((d.x0 + d.x1) / 2), toZ((d.z0 + d.z1) / 2));
      }
      ctx.save();
      ctx.translate(toX(-CITY_HALF - 6), size / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = Math.round(size / 46) + 'px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText('SOLARA BAY', 0, 0);
      ctx.restore();
    }
    // Mission marker.
    if (G.missions.markerPos) {
      const pulse = 5 + Math.sin(performance.now() / 300) * 2;
      ctx.fillStyle = G.missions.markerKind === 'start' ? '#33ff88' : '#ffc233';
      ctx.beginPath();
      ctx.arc(toX(G.missions.markerPos.x), toZ(G.missions.markerPos.z), pulse + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold ' + Math.round(size / 40) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(G.missions.markerKind === 'start' ? 'M' : '!', toX(G.missions.markerPos.x), toZ(G.missions.markerPos.z) + size / 90);
    }
    // Traffic (amber), police (blue/red), pedestrians (white).
    ctx.fillStyle = '#e8b62a';
    for (const car of G.cars) {
      if (car.dead || car.kind === 'police') continue;
      ctx.fillRect(toX(car.x) - 1.5, toZ(car.z) - 1.5, 3, 3);
    }
    for (const car of G.wanted.policeCars) {
      ctx.fillStyle = '#3a8cff';
      ctx.beginPath();
      ctx.arc(toX(car.x), toZ(car.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const ped of G.people.list) {
      ctx.fillRect(toX(ped.x) - 1, toZ(ped.z) - 1, 2, 2);
    }
    // Player arrow.
    const px = toX(G.player.x);
    const pz = toZ(G.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - G.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  hud.update = function update(dt) {
    cashEl.textContent = formatCash(G.player.cash);
    const hp = clamp(G.player.health, 0, 100);
    healthFill.style.width = hp + '%';
    healthFill.style.background = hp > 50 ? '#4ad87a' : hp > 25 ? '#e8b62a' : '#d84a4a';
    clockEl.textContent = formatClock(G.city.timeOfDay) + (G.cityNight ? ' · Night' : ' · Day');
    districtEl.textContent = districtAt(G.player.x, G.player.z).name;
    starsEl.textContent = '★'.repeat(G.wanted.stars) + '☆'.repeat(5 - G.wanted.stars);
    starsEl.classList.toggle('hot', G.wanted.stars > 0);
    if (G.player.car) {
      const kmh = Math.round(Math.abs(G.player.car.speed) * 3.6);
      speedEl.textContent = kmh;
      speedLabel.textContent = 'KM/H · ' + G.player.car.name.toUpperCase();
      carHealthWrap.style.display = 'block';
      carHealthFill.style.width = clamp(G.player.car.health, 0, 100) + '%';
    } else {
      speedEl.textContent = '';
      speedLabel.textContent = 'ON FOOT';
      carHealthWrap.style.display = 'none';
    }
    crosshair.style.display = G.screen === 'play' ? 'block' : 'none';
    // Interaction prompt.
    const car = G.player.car ? null : G.vehicles.nearestCar(G, 4.2);
    if (car) {
      promptEl.textContent = car.driver ? 'Press E — steal the ' + car.name : 'Press E — enter the ' + car.name;
      promptEl.style.display = 'block';
    } else if (G.missions.active === null && G.missions.index < G.missions.defs.length) {
      const d = G.missions.defs[G.missions.index];
      const dist = Math.hypot(G.player.x - d.start.x, G.player.z - d.start.z);
      if (dist < 12) {
        promptEl.textContent = 'Step into the marker to start: ' + d.title;
        promptEl.style.display = 'block';
      } else promptEl.style.display = 'none';
    } else promptEl.style.display = 'none';
    // Phone call banner lifetime.
    if (phoneTimer > 0) {
      phoneTimer -= dt;
      if (phoneTimer <= 0) phoneWrap.classList.remove('show');
    }
    // Minimap at 8 Hz.
    hud.minimapTimer -= dt;
    if (hud.minimapTimer <= 0) {
      hud.minimapTimer = MINIMAP_INTERVAL;
      drawMap(minimapCtx, MINIMAP_SIZE, false);
    }
    if (bigMapWrap.style.display !== 'none') drawMap(bigMapCtx, 640, true);
    // Toast lifetimes.
    for (let i = hud.toasts.length - 1; i >= 0; i -= 1) {
      const t = hud.toasts[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.el.remove();
        hud.toasts.splice(i, 1);
      } else if (t.life < 0.6) {
        t.el.style.opacity = String(t.life / 0.6);
      }
    }
  };

  hud.toast = function toast(msg) {
    const t = el('div', 'hud-toast', toastWrap, msg);
    hud.toasts.push({ el: t, life: 4.5 });
    while (hud.toasts.length > 5) {
      const old = hud.toasts.shift();
      old.el.remove();
    }
  };

  hud.phoneCall = function phoneCall(caller, text) {
    phoneCaller.textContent = '☎ ' + caller;
    phoneText.textContent = text;
    phoneWrap.classList.add('show');
    phoneTimer = 6;
  };

  hud.setObjective = function setObjective(text) {
    objectiveText.textContent = text;
    objectiveMeta.textContent = '';
  };

  hud.setObjectiveDistance = function setObjectiveDistance(m) {
    objectiveMeta.textContent = m > 0 ? m + ' m' : '';
  };

  hud.setTimer = function setTimer(seconds) {
    objectiveMeta.textContent = '⏱ ' + formatTime(seconds);
  };

  hud.setObjectiveMeta = function setObjectiveMeta(text) {
    objectiveMeta.textContent = text;
  };

  hud.flashWanted = function flashWanted() {
    wantedWrap.classList.remove('flash');
    void wantedWrap.offsetWidth;
    wantedWrap.classList.add('flash');
  };

  hud.flashDamage = function flashDamage() {
    damageFlash.style.opacity = '0.55';
    setTimeout(() => { damageFlash.style.opacity = '0'; }, 120);
  };

  hud.showBigMap = function showBigMap(show) {
    bigMapWrap.style.display = show ? 'flex' : 'none';
    if (show) drawMap(bigMapCtx, 640, true);
  };

  hud.bigMapOpen = function bigMapOpen() {
    return bigMapWrap.style.display !== 'none';
  };

  /** Full-screen card. buttons: [{label, fn, primary}]. */
  hud.showScreen = function showScreen(title, sub, body, buttons) {
    screenTitle.textContent = title;
    screenSub.textContent = sub || '';
    screenBody.innerHTML = body || '';
    screenButtons.innerHTML = '';
    for (const b of buttons || []) {
      const btn = document.createElement('button');
      btn.className = 'hud-btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        G.audio.unlock();
        G.audio.click();
        b.fn();
      });
      screenButtons.appendChild(btn);
    }
    screenWrap.style.display = 'flex';
    screenWrap.classList.add('show');
  };

  hud.hideScreen = function hideScreen() {
    screenWrap.style.display = 'none';
  };

  hud.screenOpen = function screenOpen() {
    return screenWrap.style.display !== 'none';
  };

  return hud;
}
