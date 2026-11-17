// Save game for Solara City: one localStorage slot with cash, health, mission
// progress, the player's spot and the time of day. Never throws: private
// windows and disabled storage just mean the save lasts this visit only.
import { SAVE_KEY } from './config.js';

export function createSave() {
  const save = {};

  save.saveGame = function saveGame(G) {
    try {
      const data = {
        version: 1,
        cash: Math.floor(G.player.cash),
        health: Math.round(G.player.health),
        missionsDone: G.missions.done,
        playerX: G.player.x,
        playerZ: G.player.z,
        heading: G.player.heading,
        timeOfDay: G.city.timeOfDay,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  };

  save.loadGame = function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  };

  save.hasSave = function hasSave() {
    return save.loadGame() !== null;
  };

  save.clearSave = function clearSave() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore.
    }
  };

  return save;
}
