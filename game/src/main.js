// main.js — Neon Shores boots here: the renderer, the shared game state G that every module
// reads, the city and its people, the mode machine (title, play, paused, busted, wasted,
// complete), the fixed-step loop, and the screenshot path — when ?shot= is in the URL the game
// stages that scene, steps the world a fixed number of times, and raises window.__shotReady.

import * as THREE from 'three';
import { PLACES, STORY } from './config.js';
import { loadSave, storeSave } from './save.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createCity, groundHeightAt } from './city.js';
import { createCar, spawnTraffic, updateTrafficCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { createPlayer, handlePlayerActions, placePlayer, updatePlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const STEP = 1 / 60; // the world always advances in sixtieths, whatever the display does

// The renderer: shadows on, warm filmic tone, capped pixel ratio so laptops stay smooth.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4500);
camera.position.set(118, 9, 308);

// G: the one shared state object. Modules hang their systems on it as they are created.
const G = {
  renderer, scene, camera,
  time: 0, mode: 'title',
  cars: [], cops: [], peds: [], colliders: [],
  bustProgress: 0, autoDrive: null, shotCamera: null,
};
G.rng = createRandom(shotName ? Number(params.get('seed') ?? 1) * 7919 + 13 : (Date.now() % 100000) + 7);
G.save = loadSave();
G.cash = G.save.cash;
G.input = createInput(renderer.domElement);
createAudio(G);
createHud(G);

// HUD and screen plumbing the other modules (and the shot staging) drive through G.
let hudOn = false;
G.setHud = (visible) => {
  hudOn = visible;
  G.hud.setVisible(visible);
};
const SCREENS = { title: 'screen-title', pause: 'screen-pause', end: 'screen-end', complete: 'screen-complete' };
G.showScreen = (name) => {
  for (const [key, id] of Object.entries(SCREENS)) {
    document.getElementById(id).style.display = key === name ? 'flex' : 'none';
  }
};
G.persist = () => storeSave({ cash: G.cash, mission: G.save.mission, storyDone: G.save.storyDone });

// Build the world: city first (it fills G.colliders and G.sun), then traffic, the coupe, Luz.
const city = createCity(G);
spawnTraffic(G);
G.playerCar = createCar(G, {
  kind: 'coupe', color: 0x28b8c8, colorName: 'Lagoon Turquoise',
  x: PLACES.coupeStart.x, z: PLACES.coupeStart.z, heading: PLACES.coupeStart.heading, driver: null,
});
createPlayer(G);
spawnPeds(G, 30);
G.police = createPolice(G);

// How a run ends, and what getting back up costs.
let lastEnd = 'wasted';
G.endRun = (kind) => {
  if (G.mode !== 'play') return;
  G.mode = kind;
  lastEnd = kind;
  G.audio.setEngine(false, 0);
  G.audio.sting();
  const fine = kind === 'busted' ? 200 : 150;
  G.cash = Math.max(0, G.cash - fine);
  G.persist();
  document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('end-text').textContent = kind === 'busted'
    ? `The SMPD got their photograph after all. The fine is $${fine}, the coupe is impounded wherever you left it, and the job starts over.`
    : `Luz wakes up at Solmar Clinic with a $${fine} bill and a story she will not be telling Coco. The job starts over.`;
  G.showScreen('end');
};
G.onStoryComplete = () => {
  G.mode = 'complete';
  G.audio.setEngine(false, 0);
  document.getElementById('complete-text').textContent =
    `${STORY.complete} Final cash: $${G.cash.toLocaleString('en-US')}.`;
  G.showScreen('complete');
};

// Screenshot staging presets the save before the missions read it; live play skips this.
if (shotName) stageShot(G, shotName);
createMissions(G);

// The mode machine's moves, shared by the keyboard actions and screen clicks.
let missionsStarted = false;
function startGame() {
  G.audio.unlock();
  G.showScreen(null);
  G.setHud(true);
  G.mode = 'play';
  if (!missionsStarted) {
    missionsStarted = true;
    G.missions.start();
  }
}
function respawn() {
  const spot = lastEnd === 'busted' ? PLACES.station : PLACES.hospital;
  placePlayer(G, spot.x, spot.z, 0);
  G.player.health = 100;
  G.clearHeat();
  G.bustProgress = 0;
  G.missions.restart();
  G.showScreen(null);
  G.setHud(true);
  G.mode = 'play';
}
function onConfirm() {
  if (G.mode === 'title') startGame();
  else if (G.mode === 'paused') { G.showScreen(null); G.mode = 'play'; }
  else if (G.mode === 'busted' || G.mode === 'wasted') respawn();
  else if (G.mode === 'complete') { G.showScreen(null); G.setHud(true); G.mode = 'play'; }
}
// The screens sit over the canvas, so their clicks never reach the canvas listener: wire them.
for (const id of Object.values(SCREENS)) {
  document.getElementById(id).addEventListener('pointerup', onConfirm);
}
// Browsers only allow audio after a gesture; the first one anywhere unlocks it.
window.addEventListener('pointerdown', () => G.audio.unlock());
window.addEventListener('keydown', () => G.audio.unlock());
// A returning player's title screen says where the story picks up.
if (!shotName && G.save.mission > 0 && !G.save.storyDone) {
  document.getElementById('start-hint').textContent =
    `Click or press Enter — the story continues at mission ${G.save.mission + 1}`;
}

/** The title camera: a slow drift along the beach, the hotels and traffic in frame. */
function titleCamera() {
  const t = G.time;
  camera.position.set(Math.sin(t * 0.05) * 150, 30 + Math.sin(t * 0.1) * 6, 268 + Math.cos(t * 0.05) * 34);
  camera.lookAt(0, 8, 205);
}

/** One fixed step of the whole world; the screenshot path calls this directly. */
function stepWorld(dt) {
  G.time += dt;
  city.update(dt);
  for (const car of G.cars) if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
  updatePeds(G, dt);
  if (G.mode === 'play') {
    if (G.autoDrive) G.autoDrive(dt);
    else updatePlayer(G, dt);
    G.police.update(dt);
    G.missions.update(dt);
  } else if (G.mode === 'title') {
    titleCamera();
  }
  if (hudOn) G.hud.update();
}

/** Frame-level actions: pause anywhere, play-mode actions to the player, confirms to screens. */
function handleFrameActions() {
  const actions = G.input.takeActions();
  if (G.mode === 'play') {
    if (actions & ACTION_PAUSE) {
      G.mode = 'paused';
      G.audio.setEngine(false, 0);
      G.showScreen('pause');
    } else handlePlayerActions(G, actions);
  } else if (actions & ACTION_PAUSE && G.mode === 'paused') {
    G.showScreen(null);
    G.mode = 'play';
  } else if (actions & ACTION_CONFIRM) onConfirm();
}

if (shotName) {
  // The dossier path: start the staged mission, step a fixed count, compose the camera from
  // the final state, render twice, and only then declare the shot ready.
  if (G.mode === 'play') {
    missionsStarted = true;
    G.missions.start();
  }
  const steps = { start: 100, play: 110, end: 50, chase: 175 }[shotName] ?? 100;
  for (let i = 0; i < steps; i += 1) stepWorld(STEP);
  if (G.shotCamera) {
    camera.position.copy(G.shotCamera.pos);
    camera.lookAt(G.shotCamera.look);
  } else {
    // Snap the follow camera behind the focus, exactly where updateCamera would settle it —
    // or in front of it, looking back, when the staging asks for a reverse chase shot.
    if (G.player.car) G.player.camYaw = G.player.car.heading;
    const focus = G.focusPos();
    const yaw = G.reverseCam && G.player.car ? G.player.car.heading + Math.PI : G.player.camYaw;
    const pitch = G.player.camPitch;
    const dist = G.player.car ? G.player.camDist + 3.4 : G.player.camDist;
    camera.position.set(
      focus.x - Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.max(focus.y + 1.7 + Math.sin(pitch) * dist, groundHeightAt(focus.x, focus.z) + 2.2),
      focus.z - Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(focus.x, focus.y + 1.6, focus.z);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
} else {
  // Live play: an accumulator loop over the same fixed steps, frozen behind end screens.
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const delta = Math.min(0.25, (now - last) / 1000);
    last = now;
    handleFrameActions();
    if (G.mode !== 'paused' && G.mode !== 'busted' && G.mode !== 'wasted' && G.mode !== 'complete') {
      acc += delta;
      while (acc >= STEP) {
        stepWorld(STEP);
        acc -= STEP;
      }
    }
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}
