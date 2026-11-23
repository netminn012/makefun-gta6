// pedestrians.js — the people of Solmar City: low-poly figures merged into one mesh each, who
// stroll the sidewalks, dive away from fast cars, and fall when one hits them. A fall caused by
// the player's car is an offence the wanted system hears about; a fall caused by traffic is
// just the city being the city.

import * as THREE from 'three';
import { AVENUES_X, BOULEVARD_Z, PED_STYLES, ROAD_HALF, STREETS_Z } from './config.js';
import { clampToLand, flatMaterial, groundHeightAt, mergeGeoms, part } from './city.js';
import { eachCar } from './vehicles.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const HEAD = new THREE.SphereGeometry(0.15, 8, 6);

/** One humanoid figure facing +z, vertex-coloured from a style { shirt, pants, skin, hair? }. */
export function buildFigure(style) {
  const hair = style.hair ?? 0x2a1a12;
  return mergeGeoms([
    part(BOX, style.pants, -0.11, 0.4, 0, 0, 0, 0, 0.15, 0.8, 0.17), // legs
    part(BOX, style.pants, 0.11, 0.4, 0, 0, 0, 0, 0.15, 0.8, 0.17),
    part(BOX, style.shirt, 0, 1.1, 0, 0, 0, 0, 0.46, 0.6, 0.24), // torso
    part(BOX, style.shirt, -0.3, 1.08, 0, 0, 0, 0.12, 0.11, 0.56, 0.11), // arms
    part(BOX, style.shirt, 0.3, 1.08, 0, 0, 0, -0.12, 0.11, 0.56, 0.11),
    part(HEAD, style.skin, 0, 1.58, 0), // head
    part(BOX, hair, 0, 1.7, -0.02, 0, 0, 0, 0.3, 0.1, 0.3), // hair
  ]);
}

/** The sidewalk lines people walk: both sides of every road, plus the beach promenade. */
function sidewalkSegments() {
  const segments = [];
  for (const x of AVENUES_X) {
    for (const side of [-1, 1]) segments.push({ axis: 'z', at: x + side * (ROAD_HALF.avenue + 2.4), from: -318, to: 318 });
  }
  for (const z of STREETS_Z) {
    for (const side of [-1, 1]) segments.push({ axis: 'x', at: z + side * (ROAD_HALF.street + 2.4), from: -458, to: 458 });
  }
  for (const side of [-1, 1]) segments.push({ axis: 'x', at: BOULEVARD_Z + side * (ROAD_HALF.boulevard + 2.4), from: -458, to: 458 });
  segments.push({ axis: 'x', at: 278, from: -450, to: 450 }); // the promenade, along the sand
  return segments;
}

/** Create one pedestrian on a random stretch of a segment. Exported for the car-theft ejection. */
export function spawnPed(G, segment, along) {
  const style = G.rng.pick(PED_STYLES);
  const mesh = new THREE.Mesh(buildFigure(style), flatMaterial);
  mesh.castShadow = true;
  const ped = {
    mesh, segment, along, dir: G.rng.chance(0.5) ? 1 : -1,
    speed: G.rng.range(1.1, 1.9), state: 'walk', stateT: 0, phase: G.rng.range(0, 6),
    fleeFrom: null, style,
  };
  placePed(ped);
  G.scene.add(mesh);
  G.peds.push(ped);
  return ped;
}

/** Put a ped's mesh where its segment walk says it is, at ground height, facing its way. */
function placePed(ped) {
  const pos = ped.mesh.position;
  if (ped.segment.axis === 'z') {
    pos.set(ped.segment.at, 0, ped.along);
    ped.mesh.rotation.y = ped.dir > 0 ? 0 : Math.PI;
  } else {
    pos.set(ped.along, 0, ped.segment.at);
    ped.mesh.rotation.y = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  pos.y = groundHeightAt(pos.x, pos.z);
}

/** Fill the city with strollers, weighted toward the boulevard and the beach. */
export function spawnPeds(G, count = 26) {
  const segments = sidewalkSegments();
  const lively = segments.filter((s) => Math.abs(s.at - BOULEVARD_Z) < 20 || s.at === 278);
  for (let i = 0; i < count; i += 1) {
    const segment = i % 3 === 0 ? G.rng.pick(segments) : G.rng.pick(lively);
    spawnPed(G, segment, G.rng.range(segment.from + 8, segment.to - 8));
  }
}

/** Knock a pedestrian down. By the player's hand or car it is an offence; traffic is not. */
export function knockDown(G, ped, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.stateT = 7;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = groundHeightAt(ped.mesh.position.x, ped.mesh.position.z) + 0.25;
  if (byPlayer) {
    G.offence(2);
    G.hud.showMessage('You hit a pedestrian!');
    G.audio.thud(0.8);
  }
}

/** Advance every pedestrian: stroll, flee, fall, recover. */
export function updatePeds(G, dt) {
  const focus = G.focusPos();
  for (const ped of G.peds) {
    const pos = ped.mesh.position;
    ped.stateT -= dt;
    if (ped.state === 'down') {
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        ped.mesh.rotation.x = 0;
        placePed(ped);
      }
      continue;
    }
    // Dive away from anything fast and close: the player's car above all.
    let threat = null;
    eachCar(G, (car) => {
      if (Math.abs(car.speed) < 6) return;
      const d = car.mesh.position.distanceTo(pos);
      if (d < 7) threat = car.mesh.position;
    });
    if (threat) {
      ped.state = 'flee';
      ped.stateT = 1.6;
      ped.fleeFrom = threat;
    }
    if (ped.state === 'flee') {
      const away = Math.atan2(pos.x - ped.fleeFrom.x, pos.z - ped.fleeFrom.z);
      pos.x += Math.sin(away) * 4.6 * dt;
      pos.z += Math.cos(away) * 4.6 * dt;
      ped.mesh.rotation.y = away;
      if (ped.stateT <= 0) ped.state = 'walk';
    } else {
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > ped.segment.to) {
        ped.along = ped.segment.to;
        ped.dir = -1;
      } else if (ped.along < ped.segment.from) {
        ped.along = ped.segment.from;
        ped.dir = 1;
      }
      placePed(ped);
    }
    // Walking bob and a little sway, so the crowd reads alive even standing in a screenshot.
    ped.phase += dt * (ped.state === 'flee' ? 11 : 6);
    pos.y = groundHeightAt(pos.x, pos.z) + Math.abs(Math.sin(ped.phase)) * 0.05;
    ped.mesh.rotation.z = Math.sin(ped.phase) * 0.045;
    clampToLand(pos, 0.4);
    // Cars settle arguments with pedestrians. A slow touch just shoves; speed knocks down.
    eachCar(G, (car) => {
      const d = car.mesh.position.distanceTo(pos);
      if (d < car.radius + 0.35) {
        if (Math.abs(car.speed) > 2.5) knockDown(G, ped, car === G.player.car);
        else {
          const away = Math.atan2(pos.x - car.mesh.position.x, pos.z - car.mesh.position.z);
          pos.x += Math.sin(away) * dt * 3;
          pos.z += Math.cos(away) * dt * 3;
        }
      }
    });
    void focus;
  }
}
