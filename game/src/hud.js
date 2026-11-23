// hud.js — everything flat on the glass: the cash and wanted stars, the health bar, the mission
// panel with its timer, the vehicle readout, the bust meter, the toast and banner messages,
// and the minimap — a little top-down Solmar with the player, the law and the job marked.
// The DOM itself lives in index.html; this module only drives it.

import { AVENUES_X, BOULEVARD_Z, CAR_KINDS, CAUSEWAY, NORTH, STREETS_Z, WORLD } from './config.js';

/** Grab the HUD elements and return the driver the rest of the game talks to. */
export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const cash = el('cash');
  const stars = el('stars');
  const healthFill = el('health-fill');
  const vehicle = el('vehicle');
  const objectiveTitle = el('objective-title');
  const objectiveText = el('objective-text');
  const objectiveMeta = el('objective-meta');
  const bust = el('bust');
  const bustFill = el('bust-fill');
  const message = el('message');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const minimap = el('minimap').getContext('2d');
  let messageUntil = 0;
  let bannerUntil = 0;
  let starFlashUntil = 0;

  const api = {
    /** Show or hide the whole in-play HUD (hidden behind the title and end screens). */
    setVisible(visible) {
      hud.style.display = visible ? 'block' : 'none';
    },
    /** A toast line at the bottom of the screen, gone in a few seconds. */
    showMessage(text, seconds = 3.5) {
      message.textContent = text;
      message.style.opacity = '1';
      messageUntil = G.time + seconds;
    },
    /** The big centre banner: mission titles, completions, warnings. */
    showBanner(title, sub = '') {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.style.opacity = '1';
      bannerUntil = G.time + 2.8;
    },
    /** Pulse the stars when a new one lights (called by the wanted system). */
    flashStars() {
      starFlashUntil = G.time + 1.2;
    },
    /** Per-frame refresh of every readout, from the game state. */
    update() {
      cash.textContent = `$${G.cash.toLocaleString('en-US')}`;
      const level = G.wanted.level;
      stars.textContent = '★'.repeat(level) + '☆'.repeat(5 - level);
      stars.style.opacity = level === 0 ? '0.35' : '1';
      stars.style.transform = G.time < starFlashUntil ? `scale(${1 + Math.sin(G.time * 18) * 0.12})` : 'scale(1)';
      healthFill.style.width = `${Math.max(0, G.player.health)}%`;
      healthFill.style.background = G.player.health > 35 ? '#7dd87d' : '#ff5a4d';
      if (G.player.car) {
        vehicle.style.display = 'block';
        const speed = Math.round(Math.abs(G.player.car.speed) * 3.6);
        vehicle.textContent = `${CAR_KINDS[G.player.car.kind].name} · ${speed} km/h`;
      } else vehicle.style.display = 'none';
      const objective = G.missions?.objective();
      if (objective) {
        objectiveTitle.textContent = objective.title;
        objectiveText.textContent = objective.text;
        const bits = [];
        if (objective.dist !== null) bits.push(`${objective.dist} m`);
        if (objective.timeLeft !== null && objective.timeLeft !== undefined) {
          const t = Math.max(0, Math.ceil(objective.timeLeft));
          bits.push(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
        }
        objectiveMeta.textContent = bits.join('  ·  ');
        objectiveMeta.style.color = objective.timeLeft !== null && objective.timeLeft < 15 ? '#ff5a4d' : '';
      }
      bust.style.display = G.bustProgress > 0.02 ? 'block' : 'none';
      bustFill.style.width = `${G.bustProgress * 100}%`;
      if (G.time > messageUntil) message.style.opacity = '0';
      if (G.time > bannerUntil) banner.style.opacity = '0';
      drawMinimap();
    },
  };

  /** The minimap: sea, islands, roads, then the moving pieces that matter. */
  function drawMinimap() {
    const S = 200 / 1240; // the world is 1000 x 1190 m; the map is 200 px square
    const px = (x) => 100 + x * S;
    const pz = (z) => (z + 850) * S;
    minimap.fillStyle = '#14525e';
    minimap.fillRect(0, 0, 200, 200);
    minimap.fillStyle = '#c9b183'; // the islands
    minimap.fillRect(px(-WORLD.islandHalfX), pz(-WORLD.islandHalfZ), WORLD.islandHalfX * 2 * S, WORLD.islandHalfZ * 2 * S);
    minimap.fillRect(px(NORTH.minX), pz(NORTH.minZ), (NORTH.maxX - NORTH.minX) * S, (NORTH.maxZ - NORTH.minZ) * S);
    minimap.fillRect(px(CAUSEWAY.x - 8), pz(CAUSEWAY.zEnd), 16 * S, (-WORLD.islandHalfZ - CAUSEWAY.zEnd) * S);
    minimap.strokeStyle = 'rgba(40,42,48,0.85)';
    minimap.lineWidth = 1.4;
    for (const x of AVENUES_X) {
      minimap.beginPath();
      minimap.moveTo(px(x), pz(-WORLD.islandHalfZ));
      minimap.lineTo(px(x), pz(WORLD.islandHalfZ));
      minimap.stroke();
    }
    for (const z of [...STREETS_Z, BOULEVARD_Z]) {
      minimap.beginPath();
      minimap.moveTo(px(-WORLD.islandHalfX), pz(z));
      minimap.lineTo(px(WORLD.islandHalfX), pz(z));
      minimap.stroke();
    }
    // Traffic as faint dots, the law as blue ones, the job as a gold pulse.
    minimap.fillStyle = 'rgba(255,255,255,0.5)';
    for (const car of G.cars) {
      if (car === G.player.car) continue;
      minimap.fillRect(px(car.mesh.position.x) - 1, pz(car.mesh.position.z) - 1, 2, 2);
    }
    const target = G.missions?.targetPos();
    if (target) {
      minimap.fillStyle = '#ffc94d';
      minimap.beginPath();
      minimap.arc(px(target.x), pz(target.z), 3.4 + Math.sin(G.time * 5) * 1.1, 0, Math.PI * 2);
      minimap.fill();
    }
    if (G.wanted.level > 0) {
      minimap.fillStyle = '#4d7dff';
      for (const unit of G.cops) {
        minimap.beginPath();
        minimap.arc(px(unit.car.mesh.position.x), pz(unit.car.mesh.position.z), 2.4, 0, Math.PI * 2);
        minimap.fill();
      }
    }
    // The player: a white arrow on her heading.
    const focus = G.focusPos();
    const heading = G.player.car ? G.player.car.heading : G.player.heading;
    minimap.save();
    minimap.translate(px(focus.x), pz(focus.z));
    minimap.rotate(Math.PI - heading); // canvas y is down and z is south: this points the arrow her way
    minimap.fillStyle = '#ffffff';
    minimap.beginPath();
    minimap.moveTo(0, -5);
    minimap.lineTo(3.4, 4);
    minimap.lineTo(-3.4, 4);
    minimap.closePath();
    minimap.fill();
    minimap.restore();
  }

  G.hud = api;
  return api;
}
