// vehicles.js — every car in Solmar City: the procedural meshes (one body draw call, one for
// the lights), the arcade physics they all share, the collisions against buildings and each
// other, and the traffic that drives the road loops forever. The player and the police drive
// through the same stepCar() as the traffic, so a chase is just two controls fighting.

import * as THREE from 'three';
import { CAR_COLORS, CAR_KINDS } from './config.js';
import { clampToLand, collideColliders, flatMaterial, groundHeightAt, mergeGeoms, part } from './city.js';

const BODY = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
WHEEL.rotateX(Math.PI / 2);
const GLASS = 0x1a2634;
const TYRE = 0x141519;

/**
 * Build a car's meshes from boxes: painted body and glasshouse merged into one vertex-coloured
 * mesh, lights merged into one basic mesh that reads lit at dusk. Police cars get a light bar
 * whose two halves are separate meshes so police.js can flash them.
 */
export function buildCarMesh(kind, colorHex, opts = {}) {
  const spec = CAR_KINDS[kind];
  const L = spec.length;
  const W = spec.width;
  const paint = colorHex;
  const parts = [
    part(BODY, paint, 0, 0.58, 0, 0, 0, 0, L, 0.62, W), // main body
    part(BODY, paint, L * 0.18, 0.42, 0, 0, 0, 0, L * 0.34, 0.3, W * 0.94), // nose
    part(BODY, 0x2a2d33, L / 2 + 0.03, 0.42, 0, 0, 0, 0, 0.14, 0.34, W * 0.96), // bumpers
    part(BODY, 0x2a2d33, -L / 2 - 0.03, 0.42, 0, 0, 0, 0, 0.14, 0.34, W * 0.96),
  ];
  if (kind === 'van') {
    parts.push(part(BODY, paint, -L * 0.08, 1.28, 0, 0, 0, 0, L * 0.78, 0.85, W * 0.96)); // tall cargo box
    parts.push(part(BODY, GLASS, L * 0.33, 1.05, 0, 0, 0, 0, L * 0.16, 0.5, W * 0.9)); // cab glass
  } else if (kind === 'pickup') {
    parts.push(part(BODY, GLASS, L * 0.16, 1.06, 0, 0, 0, 0, L * 0.3, 0.52, W * 0.88)); // cab
    parts.push(part(BODY, paint, -L * 0.26, 0.86, 0, 0, 0, 0, L * 0.42, 0.28, W * 0.94)); // bed walls
  } else {
    parts.push(part(BODY, GLASS, -L * 0.05, 1.08, 0, 0, 0, 0, L * 0.46, 0.5, W * 0.86)); // glasshouse
    parts.push(part(BODY, paint, -L * 0.05, 1.36, 0, 0, 0, 0, L * 0.4, 0.08, W * 0.8)); // roof
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(WHEEL, TYRE, sx * L * 0.32, 0.34, sz * (W / 2 - 0.02)));
  }
  const body = new THREE.Mesh(mergeGeoms(parts), flatMaterial);
  body.castShadow = true;
  const lightParts = [
    part(BODY, 0xfff3b8, L / 2 + 0.1, 0.62, W * 0.28, 0, 0, 0, 0.06, 0.16, 0.34), // headlights
    part(BODY, 0xfff3b8, L / 2 + 0.1, 0.62, -W * 0.28, 0, 0, 0, 0.06, 0.16, 0.34),
    part(BODY, 0xff3b30, -L / 2 - 0.1, 0.66, W * 0.28, 0, 0, 0, 0.06, 0.14, 0.34), // tail lights
    part(BODY, 0xff3b30, -L / 2 - 0.1, 0.66, -W * 0.28, 0, 0, 0, 0.06, 0.14, 0.34),
  ];
  if (kind === 'taxi') lightParts.push(part(BODY, 0xf2c230, L * 0.02, 1.5, 0, 0, 0, 0, 0.7, 0.16, 0.34)); // roof sign
  const lights = new THREE.Mesh(mergeGeoms(lightParts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const group = new THREE.Group();
  group.add(body);
  group.add(lights);
  if (opts.driver) {
    // A driver silhouette behind the wheel, its own mesh so a theft can throw them out.
    const figure = new THREE.Mesh(mergeGeoms([
      part(BODY, opts.driver.shirt, L * 0.08, 1.02, -W * 0.2, 0, 0, 0, 0.44, 0.5, 0.3),
      part(new THREE.SphereGeometry(0.17, 8, 6), opts.driver.skin, L * 0.08, 1.38, -W * 0.2),
    ]), flatMaterial);
    group.add(figure);
    group.userData.driverMesh = figure;
  }
  if (kind === 'police') {
    // The light bar: red and blue halves the pursuit code flashes in turn.
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a20 }));
    red.position.set(-L * 0.05, 1.5, 0.28);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(-L * 0.05, 1.5, -0.28);
    group.add(red);
    group.add(blue);
    group.userData.flash = [red, blue];
  }
  return group;
}

/** Create a car and put it in the world. driver: 'traffic' | 'parked' | null (free to take). */
export function createCar(G, { kind, color, colorName, x, z, heading, driver = null, route = null }) {
  const mesh = buildCarMesh(kind, color, { driver: driver === 'traffic' ? G.rng.pick([{ shirt: 0xff6b5e, skin: 0xc98d64 }, { shirt: 0x39c2d7, skin: 0x8a5a3b }, { shirt: 0xf2e14c, skin: 0x6e4530 }]) : null });
  mesh.position.set(x, groundHeightAt(x, z), z);
  mesh.rotation.y = heading - Math.PI / 2; // the mesh is modelled facing +x; headings face +z
  G.scene.add(mesh);
  const car = {
    mesh, kind, colorName, heading, speed: 0, steer: 0, radius: 1.65,
    driver, route, wp: 0, cruise: G.rng.range(8.5, 12.5), lastImpact: 0, occupantFled: false,
  };
  G.cars.push(car);
  return car;
}

/** Every car that can collide: the civilian list plus each police unit's car. */
export function eachCar(G, fn) {
  for (const car of G.cars) fn(car);
  for (const unit of G.cops) fn(unit.car);
}

/** The forward unit vector of a heading (heading 0 faces -z, turning toward +x). */
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * Advance one car by dt under a control { throttle, steer, brake }: bicycle-lite steering,
 * speed-sensitive, with drag. Collisions are a separate step so callers can read the impact.
 */
export function stepCar(G, car, control, dt) {
  const spec = CAR_KINDS[car.kind];
  const targetSteer = control.steer * (0.62 / (1 + Math.abs(car.speed) * 0.055));
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 7);
  if (control.throttle > 0) {
    car.speed += spec.accel * control.throttle * dt * Math.max(0, 1 - car.speed / spec.topSpeed);
  } else if (control.throttle < 0) {
    car.speed += (car.speed > 0.6 ? -24 : spec.accel * 0.55 * control.throttle) * dt;
    car.speed = Math.max(car.speed, -9);
  }
  if (control.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed -= car.speed * 0.32 * dt; // drag and rolling resistance
  if (Math.abs(car.speed) < 0.04 && control.throttle === 0) car.speed = 0;
  car.heading += car.steer * (car.speed / 2.7) * dt; // steer + is A (left): heading grows toward +x
  const f = forwardOf(car.heading);
  const pos = car.mesh.position;
  pos.x += f.x * car.speed * dt;
  pos.z += f.z * car.speed * dt;
  car.lastImpact = collideColliders(G.colliders, pos, car.radius);
  if (car.lastImpact > 0) car.speed *= 1 - car.lastImpact * 0.75;
  if (clampToLand(pos, car.radius)) car.speed *= 0.92;
  pos.y = groundHeightAt(pos.x, pos.z);
  car.mesh.rotation.y = car.heading - Math.PI / 2;
  // A whisper of body roll and pitch sells the speed without a suspension model.
  car.mesh.rotation.z = -car.steer * Math.min(1, Math.abs(car.speed) / 20) * 0.55;
  car.mesh.rotation.x = Math.max(-0.03, Math.min(0.03, (car.prevSpeed ?? 0) - car.speed)) * 0.004;
  car.prevSpeed = car.speed;
}

/** Separate overlapping cars and share the blow; returns the worst closing speed for `car`. */
export function collideCars(G, car) {
  let worst = 0;
  const pos = car.mesh.position;
  eachCar(G, (other) => {
    if (other === car) return;
    const op = other.mesh.position;
    const dx = pos.x - op.x;
    const dz = pos.z - op.z;
    const min = car.radius + other.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) return;
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    const nx = dx / d;
    const nz = dz / d;
    const otherMovable = other.driver !== 'parked';
    pos.x += nx * push * (otherMovable ? 1 : 2);
    pos.z += nz * push * (otherMovable ? 1 : 2);
    if (otherMovable) {
      op.x -= nx * push;
      op.z -= nz * push;
    }
    const closing = Math.abs(car.speed) + Math.abs(other.speed);
    if (closing > worst) worst = closing;
    const shared = (car.speed + other.speed) / 2;
    car.speed = shared * 0.72;
    if (otherMovable) other.speed = shared * 0.72;
  });
  return worst;
}

/** A rectangle loop around a block, driven on the right: corners offset by each leg's right side. */
function loopRoute(x1, z1, x2, z2, lane = 3.6) {
  const corners = [
    { x: x1, z: z2, hx: 1, hz: 0 },
    { x: x2, z: z2, hx: 0, hz: -1 },
    { x: x2, z: z1, hx: -1, hz: 0 },
    { x: x1, z: z1, hx: 0, hz: 1 },
  ];
  return corners.map((c) => ({ x: c.x + -c.hz * lane, z: c.z + c.hx * lane }));
}

/** The causeway run: up the avenue, over the bridge, around the north island, and back. */
function causewayRoute() {
  return [
    { x: 203.6, z: 190 }, { x: 203.6, z: -260 }, { x: 203.6, z: -480 }, // northbound lane
    { x: 203.6, z: -640 }, // onto the north island
    { x: 120, z: -648 }, { x: 84, z: -700 }, { x: 100, z: -772 }, // around the island
    { x: 180, z: -778 }, { x: 222, z: -720 }, { x: 210, z: -652 },
    { x: 196.4, z: -560 }, { x: 196.4, z: -260 }, { x: 196.4, z: 100 }, // southbound lane home
  ];
}

/** All the loops traffic can be assigned to. */
function trafficRoutes() {
  return [
    loopRoute(-440, 190, 440, 255), // the boulevard grand loop
    loopRoute(-300, -80, -100, 10),
    loopRoute(0, -170, 200, -80),
    loopRoute(100, 10, 300, 100),
    loopRoute(-200, 100, 0, 190),
    loopRoute(200, -260, 400, -170),
    loopRoute(-400, -260, -200, -170),
    causewayRoute(),
  ];
}

/** Spawn the city's traffic and parked cars. The player's coupe is main.js's business. */
export function spawnTraffic(G) {
  const { rng } = G;
  const routes = trafficRoutes();
  const kinds = ['sedan', 'sedan', 'coupe', 'taxi', 'pickup', 'van'];
  for (let i = 0; i < 15; i += 1) {
    const route = routes[i % routes.length];
    const wp = rng.int(0, route.length - 1);
    const at = route[wp];
    const next = route[(wp + 1) % route.length];
    const color = rng.pick([{ hex: 0xf2c230, name: 'Taxi Yellow' }, ...CAR_COLORS]);
    const kind = color.name === 'Taxi Yellow' ? 'taxi' : rng.pick(kinds);
    createCar(G, {
      kind, color: color.hex, colorName: `${color.name} ${kind}`, x: at.x, z: at.z,
      heading: Math.atan2(next.x - at.x, next.z - at.z), driver: 'traffic', route,
    }).wp = wp;
  }
  // Parked cars along the boulevard curb and a few side streets, free for the taking.
  const parkedSpots = [];
  for (let x = -420; x <= 420; x += 42) parkedSpots.push({ x, z: 244.5, heading: Math.PI / 2 });
  for (let x = -380; x <= 380; x += 64) parkedSpots.push({ x, z: 266, heading: -Math.PI / 2 });
  for (const spot of parkedSpots) {
    if (Math.abs(spot.x - -112) < 26 && spot.z < 250) continue; // keep the coupe's stretch clear
    if (!rng.chance(0.62)) continue;
    const color = rng.pick(CAR_COLORS);
    createCar(G, { kind: rng.pick(kinds), color: color.hex, colorName: color.name, x: spot.x + rng.range(-3, 3), z: spot.z, heading: spot.heading, driver: 'parked' });
  }
}

/** Drive one traffic car along its loop: follow the waypoints, mind the car ahead. */
export function updateTrafficCar(G, car, dt) {
  if (!car.route) return;
  const pos = car.mesh.position;
  const target = car.route[(car.wp + 1) % car.route.length];
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  if (dx * dx + dz * dz < 49) car.wp = (car.wp + 1) % car.route.length;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.4));
  // Slow for whatever is ahead: another car, or a pedestrian in the road.
  let targetSpeed = car.cruise * (1 - Math.min(0.55, Math.abs(diff) * 0.4));
  const f = forwardOf(car.heading);
  eachCar(G, (other) => {
    if (other === car) return;
    const rel = { x: other.mesh.position.x - pos.x, z: other.mesh.position.z - pos.z };
    const ahead = rel.x * f.x + rel.z * f.z;
    const side = Math.abs(rel.x * f.z - rel.z * f.x);
    if (ahead > 0 && ahead < 9 && side < 2.4) targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed) * (ahead < 5 ? 0.4 : 0.9));
  });
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const rel = { x: ped.mesh.position.x - pos.x, z: ped.mesh.position.z - pos.z };
    const ahead = rel.x * f.x + rel.z * f.z;
    const side = Math.abs(rel.x * f.z - rel.z * f.x);
    if (ahead > 0 && ahead < 6 && side < 2) targetSpeed = 0;
  }
  const throttle = car.speed < targetSpeed ? 0.75 : car.speed > targetSpeed + 1 ? -0.4 : 0;
  stepCar(G, car, { throttle, steer, brake: targetSpeed === 0 && car.speed > 1 }, dt);
  collideCars(G, car);
}

/** The free car nearest a point, for the enter-a-car prompt. */
export function nearestCar(G, pos, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of G.cars) {
    if (car === G.player.car) continue;
    const d = car.mesh.position.distanceTo(pos);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}
