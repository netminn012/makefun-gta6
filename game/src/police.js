// police.js — the law in Solmar City: the wanted level (stars are earned by offences and lost
// by keeping quiet), and the SMPD interceptors that spawn out of sight, run the player down
// and try to pin her. A bust needs the player cornered — on foot with a unit close, or boxed
// in at a standstill — so a chase is always winnable by driving better.

import { AVENUES_X, STREETS_Z } from './config.js';
import { groundHeightAt } from './city.js';
import { buildCarMesh, collideCars, forwardOf, stepCar } from './vehicles.js';

/** Create the wanted system: G.offence(stars) and G.setWanted(stars), plus the cop manager. */
export function createPolice(G) {
  const wanted = { level: 0, calmT: 0 };
  G.wanted = wanted;
  G.cops = [];
  G.bustProgress = 0;
  let bustT = 0;

  // An offence raises the level at once and restarts the quiet clock that lowers it.
  G.offence = (stars) => {
    if (stars <= 0 || G.mode !== 'play') return;
    wanted.level = Math.min(5, wanted.level + stars);
    wanted.calmT = 0;
    G.hud.flashStars();
  };
  // A mission can demand heat directly (the finale starts at three stars).
  G.setWanted = (stars) => {
    wanted.level = Math.max(wanted.level, Math.min(5, stars));
    wanted.calmT = 0;
  };

  /** Spawn one interceptor at a road junction well out of sight of the player. */
  function spawnCop() {
    const focus = G.focusPos();
    for (let tries = 0; tries < 12; tries += 1) {
      const alongAvenue = G.rng.chance(0.5);
      const fixed = alongAvenue ? G.rng.pick(AVENUES_X) : G.rng.pick(STREETS_Z);
      const along = G.rng.range(-300, 300);
      const x = alongAvenue ? fixed : along;
      const z = alongAvenue ? along : fixed;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < 85 || d > 240) continue;
      const mesh = buildCarMesh('police', 0xf2f2f2, {});
      mesh.position.set(x, groundHeightAt(x, z), z);
      G.scene.add(mesh);
      const car = {
        mesh, kind: 'police', colorName: 'SMPD Interceptor', heading: G.rng.range(0, Math.PI * 2),
        speed: 0, steer: 0, radius: 1.65, driver: 'police', route: null, wp: 0, cruise: 0, lastImpact: 0,
      };
      mesh.rotation.y = car.heading - Math.PI / 2;
      G.cops.push({ car, stuckT: 0 });
      return;
    }
  }

  /** Remove a unit from the world (too far away, or the heat is off). */
  function removeCop(unit) {
    G.scene.remove(unit.car.mesh);
    G.cops.splice(G.cops.indexOf(unit), 1);
  }

  // After a bust the slate is wiped: no stars, no units, no siren.
  G.clearHeat = () => {
    wanted.level = 0;
    wanted.calmT = 0;
    while (G.cops.length) removeCop(G.cops[0]);
  };

  /** Place a unit exactly (screenshot staging only — live spawns stay out of sight). */
  function stageCop(x, z, heading, speed) {
    const mesh = buildCarMesh('police', 0xf2f2f2, {});
    mesh.position.set(x, groundHeightAt(x, z), z);
    G.scene.add(mesh);
    const car = {
      mesh, kind: 'police', colorName: 'SMPD Interceptor', heading,
      speed, steer: 0, radius: 1.65, driver: 'police', route: null, wp: 0, cruise: 0, lastImpact: 0,
    };
    mesh.rotation.y = heading - Math.PI / 2;
    G.cops.push({ car, stuckT: 0 });
  }

  /** The per-step update: wanted decay, the fleet size, pursuit, lights and the bust. */
  function update(dt) {
    // Quiet time lowers the level, one star at a time, unless a unit can see the player.
    wanted.calmT += dt;
    const nearest = nearestCopDistance();
    if (wanted.level > 0 && wanted.calmT > 24 && nearest > 55) {
      wanted.level -= 1;
      wanted.calmT = 0;
      if (wanted.level === 0) G.hud.showMessage('You lost the heat.');
    }
    const desired = wanted.level === 0 ? 0 : Math.min(2 + wanted.level, 6);
    if (G.cops.length < desired) spawnCop();
    for (let i = G.cops.length - 1; i >= 0; i -= 1) {
      const unit = G.cops[i];
      const d = unit.car.mesh.position.distanceTo(G.focusPos());
      if ((G.cops.length > desired && d > 60) || d > 300) removeCop(unit);
    }
    // Flash every light bar in turn and feed the siren's loudness.
    const phase = Math.floor(G.time * 6) % 2;
    for (const unit of G.cops) {
      const flash = unit.car.mesh.userData.flash;
      if (flash) {
        flash[0].visible = phase === 0;
        flash[1].visible = phase === 1;
      }
      updatePursuit(unit, dt);
    }
    G.audio.setSiren(wanted.level > 0 ? Math.max(0, 1 - nearest / 90) : 0);
    updateBust(dt, nearest);
  }

  /** Drive one interceptor at the player: intercept, ram, and recover when it overshoots. */
  function updatePursuit(unit, dt) {
    const car = unit.car;
    const pos = car.mesh.position;
    const focus = G.focusPos();
    const focusSpeed = G.player.car ? G.player.car.speed : 0;
    const f = forwardOf(G.player.car ? G.player.car.heading : G.player.heading);
    const aim = { x: focus.x + f.x * focusSpeed * 0.45, z: focus.z + f.z * focusSpeed * 0.45 };
    const dx = aim.x - pos.x;
    const dz = aim.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.5));
    // Back up when the nose points the wrong way at close range, else commit.
    let throttle = 1;
    if (dist < 9 && Math.abs(diff) > 2.2) throttle = -1;
    // One star is a traffic stop, not a demolition derby: cap the chase speed by heat.
    const cap = 24 + G.wanted.level * 3.4;
    if (car.speed > cap) throttle = 0;
    if (dist < 5 && G.player.car == null) throttle = car.speed > 2 ? -0.5 : 0; // don't run her down on foot
    stepCar(G, car, { throttle, steer, brake: false }, dt);
    const closing = collideCars(G, car);
    if (closing > 12 && G.player.car) G.audio.thud(0.4);
    // A unit wedged on a wall gives up its spot to a fresh one.
    if (Math.abs(car.speed) < 0.4 && dist > 25) unit.stuckT += dt;
    else unit.stuckT = 0;
    if (unit.stuckT > 6) {
      removeCop(unit);
      spawnCop();
    }
  }

  /** The bust: cornered on foot, or pinned at a standstill with two units on top of her. */
  function updateBust(dt, nearest) {
    const player = G.player;
    let cornered = false;
    if (wanted.level > 0) {
      if (!player.car && nearest < 5.5) cornered = true;
      if (player.car && Math.abs(player.car.speed) < 1) {
        let close = 0;
        for (const unit of G.cops) if (unit.car.mesh.position.distanceTo(player.car.mesh.position) < 9) close += 1;
        cornered = close >= 2;
      }
    }
    bustT = cornered ? bustT + dt : Math.max(0, bustT - dt * 2);
    G.bustProgress = Math.min(1, bustT / 2.4);
    if (bustT >= 2.4) {
      bustT = 0;
      G.bustProgress = 0;
      G.endRun('busted');
    }
  }

  /** Distance to the nearest interceptor, or Infinity when the streets are clean. */
  function nearestCopDistance() {
    let best = Infinity;
    const focus = G.focusPos();
    for (const unit of G.cops) best = Math.min(best, unit.car.mesh.position.distanceTo(focus));
    return best;
  }

  return { update, stageCop };
}
