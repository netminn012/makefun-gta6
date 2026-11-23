// shots.js — screenshot staging for the ?shot= scenes the dossier captures. Each scene presets
// a save, places Luz and her coupe, sets the heat and the camera, and (for the chase) drives
// the coupe itself, so the fixed steps main.js runs afterwards land on a composed, living
// frame: title over the boulevard, a mission on foot, a three-star chase, the story's end.

import * as THREE from 'three';
import { CAUSEWAY, MISSIONS, PLACES, STORY } from './config.js';
import { placePlayer } from './player.js';
import { collideCars, stepCar } from './vehicles.js';

/** Stage one named scene. main.js creates the missions after this (they read the save). */
export function stageShot(G, name) {
  if (name === 'start') {
    // The title screen over a slow boulevard vista: hotels, palms, traffic, the sea behind.
    G.save = { cash: 0, mission: 0, storyDone: false };
    G.cash = 0;
    G.mode = 'title';
    G.showScreen('title');
    G.setHud(false);
    G.shotCamera = {
      pos: new THREE.Vector3(118, 9, 308),
      look: new THREE.Vector3(-20, 11, 218),
    };
    return;
  }
  if (name === 'play') {
    // Mid-story, on foot: mission 3's pickup run, cash in pocket, Club Azul across the street.
    G.save = { cash: 650, mission: 2, storyDone: false };
    G.cash = 650;
    G.mode = 'play';
    G.showScreen(null);
    G.setHud(true);
    placePlayer(G, 36, 240.6, Math.PI / 2); // on the club sidewalk, facing east down the boulevard
    G.player.camPitch = 0.2; // a flatter angle for the shot: more street, less sidewalk
    return;
  }
  if (name === 'end') {
    // The story told: Luz and the coupe on the causeway, the lighthouse ahead, cash banked.
    G.save = { cash: 2450, mission: MISSIONS.length, storyDone: true };
    G.cash = 2450;
    G.mode = 'complete';
    G.showScreen('complete');
    G.setHud(false);
    document.getElementById('complete-text').textContent =
      `${STORY.complete} Final cash: $2,450 · All ${MISSIONS.length} missions complete.`;
    const coupe = G.playerCar;
    coupe.mesh.position.set(196.8, CAUSEWAY.deckY, -476);
    coupe.heading = Math.PI; // north, toward the light
    coupe.speed = 0;
    coupe.mesh.rotation.y = coupe.heading - Math.PI / 2;
    placePlayer(G, 203.8, -469, Math.PI);
    G.shotCamera = {
      pos: new THREE.Vector3(189, CAUSEWAY.deckY + 3.8, -450),
      look: new THREE.Vector3(200, CAUSEWAY.deckY + 1.2, -476),
    };
    return;
  }
  if (name === 'chase') {
    // The finale's energy, early: three stars on the boulevard, units staged on her tail
    // (live spawns stay out of sight; a screenshot is allowed to cheat the distance, not the render).
    G.save = { cash: 1450, mission: 3, storyDone: false };
    G.cash = 1450;
    G.mode = 'play';
    G.showScreen(null);
    G.setHud(true);
    const coupe = G.playerCar;
    coupe.mesh.position.set(-14, 0, 258.8); // the boulevard's eastbound lane
    coupe.heading = Math.PI / 2;
    coupe.speed = 15;
    coupe.mesh.rotation.y = coupe.heading - Math.PI / 2;
    G.player.car = coupe;
    coupe.driver = 'player';
    G.player.mesh.visible = false;
    G.player.camYaw = Math.PI / 2;
    G.setWanted(3);
    G.police.stageCop(-46, 258.8, Math.PI / 2, 15.5);
    G.police.stageCop(-60, 254.2, Math.PI / 2, 16);
    G.police.stageCop(-36, 262.6, Math.PI / 2, 15);
    G.reverseCam = true; // the shot camera rides ahead, looking back at the coupe and its tail
    // The coupe drives itself for the shot: hold the eastbound lane at speed.
    G.autoDrive = (dt) => {
      const pos = coupe.mesh.position;
      let diff = Math.PI / 2 - coupe.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.3 + (258.8 - pos.z) * 0.035));
      stepCar(G, coupe, { throttle: 0.85, steer, brake: false }, dt);
      collideCars(G, coupe);
    };
  }
}
