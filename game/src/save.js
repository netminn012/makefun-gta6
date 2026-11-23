// save.js — the one save slot, kept in localStorage: cash earned, the mission the player is on
// and whether the story is finished. Saving is best-effort: a browser that refuses storage
// (private windows, file quirks) just means the run lasts this visit only.

const SAVE_KEY = 'neon-shores-save-v1';

/** Read the save, or a fresh one when there is none or it does not parse. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { cash: 0, mission: 0, storyDone: false };
    const data = JSON.parse(raw);
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 0,
      mission: Number.isInteger(data.mission) ? data.mission : 0,
      storyDone: data.storyDone === true,
    };
  } catch {
    return { cash: 0, mission: 0, storyDone: false };
  }
}

/** Write the save. Never throws: a failed save must not break the game. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage refused: play on unsaved.
  }
}
