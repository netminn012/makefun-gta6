// player.js — Luz herself: the on-foot controller (walk, run, shove, steal), the driving seat
// (the same stepCar the traffic uses, fed by the keys), health and damage, and the third-person
// camera that follows both. It also owns the answers other systems ask all the time: where is
// the player, and what are they sitting in.

import * as THREE from 'three';
import { PLAYER_STYLE, PLACES } from './config.js';
import { clampToLand, collideColliders, groundHeightAt } from './city.js';
import { ACTION_ATTACK, ACTION_ENTER } from './input.js';
import { buildFigure, knockDown, spawnPed } from './pedestrians.js';
import { collideCars, forwardOf, nearestCar, stepCar } from './vehicles.js';
import { flatMaterial } from './city.js';

/** Create the player at her start, standing on the beach sidewalk facing the hotels. */
export function createPlayer(G) {
  const mesh = new THREE.Mesh(buildFigure(PLAYER_STYLE), flatMaterial);
  mesh.castShadow = true;
  const start = PLACES.playerStart;
  mesh.position.set(start.x, 0, start.z);
  mesh.rotation.y = start.heading;
  G.scene.add(mesh);
  const player = {
    mesh, heading: start.heading, health: 100, car: null, attackCd: 0, hurtT: 0,
    camYaw: start.heading, camPitch: 0.34, camDist: 6.5, shake: 0,
  };
  G.player = player;
  // The two questions every other system asks, answered in one place.
  G.focusPos = () => (player.car ? player.car.mesh.position : mesh.position);
  G.damagePlayer = (amount) => {
    if (G.mode !== 'play') return;
    player.health -= amount;
    player.hurtT = 5;
    player.shake = Math.min(0.6, player.shake + amount * 0.02);
    if (player.health <= 0) {
      player.health = 0;
      G.endRun('wasted');
    }
  };
  return player;
}

/** Teleport the player (respawns, shot staging): on foot, at a place, facing a heading. */
export function placePlayer(G, x, z, heading) {
  const player = G.player;
  if (player.car) exitCar(G, true);
  player.mesh.visible = true;
  player.mesh.position.set(x, groundHeightAt(x, z), z);
  player.heading = heading;
  player.mesh.rotation.y = heading;
  player.camYaw = heading;
}

/** Get out of the current car, stepping to its left side. `silent` skips the door logic. */
function exitCar(G, silent = false) {
  const player = G.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  player.car = null;
  const f = forwardOf(car.heading);
  const side = { x: -f.z, z: f.x }; // the car's left
  player.mesh.visible = true;
  player.mesh.position.set(
    car.mesh.position.x + side.x * 2.3,
    0,
    car.mesh.position.z + side.z * 2.3,
  );
  player.mesh.position.y = groundHeightAt(player.mesh.position.x, player.mesh.position.z);
  player.heading = car.heading;
  player.camYaw = car.heading;
  if (!silent) G.audio.click();
}

/** Get into a car: steal it if someone is driving (they bail out, the law notices). */
function enterCar(G, car) {
  const player = G.player;
  if (car.driver === 'traffic') {
    // The driver bails and runs; the figure in the seat becomes a pedestrian with a story.
    if (car.mesh.userData.driverMesh) {
      car.mesh.remove(car.mesh.userData.driverMesh);
      car.mesh.userData.driverMesh = null;
    }
    const segment = { axis: 'x', at: car.mesh.position.z + 3, from: car.mesh.position.x - 60, to: car.mesh.position.x + 60 };
    const ped = spawnPed(G, segment, car.mesh.position.x);
    ped.state = 'flee';
    ped.stateT = 2.5;
    ped.fleeFrom = car.mesh.position;
    car.route = null;
    G.offence(1);
    G.hud.showMessage('Vehicle stolen!');
  }
  car.driver = 'player';
  player.car = car;
  player.mesh.visible = false;
  G.audio.click();
  if (G.missions) G.missions.onEnterCar(car);
}

/** One-shot actions while playing: enter/leave cars and the shove attack. */
export function handlePlayerActions(G, actions) {
  const player = G.player;
  if (actions & ACTION_ENTER) {
    if (player.car) exitCar(G);
    else {
      const car = nearestCar(G, player.mesh.position, 3.6);
      if (car) enterCar(G, car);
      else G.hud.showMessage('No car in reach — walk to one and press F');
    }
  }
  if (actions & ACTION_ATTACK && !player.car && player.attackCd <= 0) {
    player.attackCd = 0.45;
    const f = forwardOf(player.heading);
    for (const ped of G.peds) {
      const rel = { x: ped.mesh.position.x - player.mesh.position.x, z: ped.mesh.position.z - player.mesh.position.z };
      if (Math.hypot(rel.x, rel.z) < 1.7 && rel.x * f.x + rel.z * f.z > 0.2) {
        knockDown(G, ped, true);
        break;
      }
    }
  }
}

/** The per-step update: drive or walk, then put the camera where it belongs. */
export function updatePlayer(G, dt) {
  const player = G.player;
  const input = G.input;
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.hurtT <= 0 && player.health > 0) player.health = Math.min(100, player.health + dt * 2.5);
  player.shake = Math.max(0, player.shake - dt * 1.4);

  const orbit = input.takeOrbit();
  player.camYaw -= orbit.dx * 0.0052;
  player.camPitch = Math.min(1.15, Math.max(0.06, player.camPitch + orbit.dy * 0.0035));
  player.camDist = Math.min(11, Math.max(3.5, player.camDist + orbit.wheel * 0.7));
  if (input.down('ArrowLeft')) player.camYaw += dt * 1.8;
  if (input.down('ArrowRight')) player.camYaw -= dt * 1.8;

  if (player.car) updateDriving(G, dt);
  else updateOnFoot(G, dt);
  updateCamera(G, dt);
}

/** Driving: keys become a control for the shared car physics; crashes cost health and paint. */
function updateDriving(G, dt) {
  const player = G.player;
  const input = G.input;
  const car = player.car;
  const control = {
    throttle: (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0),
    steer: (input.down('KeyA') ? 1 : 0) + (input.down('KeyD') ? -1 : 0),
    brake: input.down('Space'),
  };
  const speedBefore = Math.abs(car.speed);
  stepCar(G, car, control, dt);
  const closing = collideCars(G, car);
  if (car.lastImpact > 0.5 && speedBefore > 7) {
    G.audio.thud(Math.min(1, speedBefore / 26));
    G.damagePlayer((speedBefore - 6) * 0.55);
    if (speedBefore > 12) G.offence(0); // a crash alone is not a crime; what it hits may be
  } else if (closing > 10) {
    G.audio.thud(Math.min(1, closing / 30));
    G.damagePlayer((closing - 9) * 0.5);
  }
  G.audio.setEngine(true, Math.abs(car.speed) / 38);
}

/** On foot: move with the camera, turn toward the run, stay out of walls and traffic. */
function updateOnFoot(G, dt) {
  const player = G.player;
  const input = G.input;
  const pos = player.mesh.position;
  const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
  const side = (input.down('KeyA') ? 1 : 0) + (input.down('KeyD') ? -1 : 0);
  const run = input.down('ShiftLeft') || input.down('ShiftRight');
  const sin = Math.sin(player.camYaw);
  const cos = Math.cos(player.camYaw);
  // Camera forward on the ground is (sin, cos) of the yaw; right is its perpendicular.
  let mx = sin * fwd + cos * side;
  let mz = cos * fwd - sin * side;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    const speed = run ? 6.6 : 3.4;
    pos.x += mx * speed * dt;
    pos.z += mz * speed * dt;
    const want = Math.atan2(mx, mz);
    let diff = want - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, dt * 12);
    player.mesh.rotation.y = player.heading;
    // A gentle step bob while moving.
    pos.y = groundHeightAt(pos.x, pos.z) + Math.abs(Math.sin(G.time * (run ? 11 : 8))) * 0.045;
  } else {
    pos.y = groundHeightAt(pos.x, pos.z);
  }
  collideColliders(G.colliders, pos, 0.45);
  clampToLand(pos, 0.45);
  // Cars are obstacles on foot too — and a fast one is a hospital visit.
  for (const car of G.cars) pushOutOfCar(G, car, pos);
  for (const unit of G.cops) pushOutOfCar(G, unit.car, pos);
}

/** Keep the walker out of a car's circle; a fast car knocks her down and hurts. */
function pushOutOfCar(G, car, pos) {
  const cp = car.mesh.position;
  const dx = pos.x - cp.x;
  const dz = pos.z - cp.z;
  const min = car.radius + 0.4;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-6) return;
  if (Math.abs(car.speed) > 6 && car !== G.player.car) {
    G.damagePlayer(16);
    G.audio.thud(0.7);
    pos.x += dx * 1.4;
    pos.z += dz * 1.4;
  } else {
    const d = Math.sqrt(d2);
    pos.x = cp.x + (dx / d) * min;
    pos.z = cp.z + (dz / d) * min;
  }
}

/** Third-person camera: orbit the focus, lag behind a car, shake when hurt or hit. */
function updateCamera(G, dt) {
  const player = G.player;
  const focus = G.focusPos();
  const driving = Boolean(player.car);
  const dist = driving ? player.camDist + 3.4 : player.camDist;
  const yaw = player.camYaw;
  const pitch = player.camPitch;
  const back = {
    x: focus.x - Math.sin(yaw) * Math.cos(pitch) * dist,
    z: focus.z - Math.cos(yaw) * Math.cos(pitch) * dist,
  };
  const height = focus.y + 1.7 + Math.sin(pitch) * dist;
  const cam = G.camera;
  const ease = driving ? 1 - Math.exp(-dt * 5.5) : 1 - Math.exp(-dt * 10);
  cam.position.x += (back.x - cam.position.x) * ease;
  cam.position.z += (back.z - cam.position.z) * ease;
  cam.position.y += (height - cam.position.y) * ease;
  // Never sink below the ground the camera hovers over.
  const floor = groundHeightAt(cam.position.x, cam.position.z) + 0.5;
  if (cam.position.y < floor) cam.position.y = floor;
  if (player.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * player.shake * 0.35;
    cam.position.y += (Math.random() - 0.5) * player.shake * 0.35;
  }
  cam.lookAt(focus.x, focus.y + 1.6, focus.z);
  // The sun (and its shadow box) travel with the focus so shadows stay crisp nearby.
  G.sun.position.set(focus.x - 420, 210, focus.z + 330);
  G.sun.target.position.set(focus.x, 0, focus.z);
}
