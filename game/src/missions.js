// missions.js — the story chain and, after it, endless odd jobs: a state machine over the
// mission steps in config.js, with a pillar-of-light beacon on the current target, a timer
// where the story asks for one, cash on completion, and the save written as soon as anything
// is earned. The finale's step only completes once the heat is actually lost at the garage.

import * as THREE from 'three';
import { EXTRA_TARGETS, MISSIONS, PLACES } from './config.js';

/** Resolve a step's target name to a place with x/z. */
function targetOf(step) {
  return PLACES[step.target] ?? EXTRA_TARGETS[step.target];
}

/** Create the mission runner. G.missions gets update(), onEnterCar() and objective(). */
export function createMissions(G) {
  // The beacon: a soft gold pillar and a ground ring, visible across the city.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.1, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 45;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  beacon.add(pillar);
  beacon.add(ring);
  G.scene.add(beacon);

  const state = {
    index: G.save.storyDone ? MISSIONS.length : Math.min(G.save.mission, MISSIONS.length - 1),
    step: 0,
    timer: null,
    active: false,
    between: 0, // pause between missions, so a banner can be read
    job: null, // the current odd job, once the story is done
  };

  /** The mission definition in force: a story mission, or the generated odd job. */
  function current() {
    if (state.index < MISSIONS.length) return MISSIONS[state.index];
    return state.job;
  }

  /** Start the current mission from its first step, with its banner and intro line. */
  function startMission() {
    const mission = current();
    state.step = 0;
    state.timer = mission.time ?? null;
    state.active = true;
    G.hud.showBanner(mission.title, `Reward $${mission.reward}`);
    G.hud.showMessage(mission.intro, 7);
    applyStepHeat();
  }

  /** A step may demand heat the moment it begins (the delivery, the finale). */
  function applyStepHeat() {
    const step = current()?.steps[state.step];
    if (step?.heat) G.setWanted(step.heat);
  }

  /** Pay out, save, and move on: next mission, the completion screen, or another odd job. */
  function completeMission() {
    const mission = current();
    state.active = false;
    G.cash += mission.reward;
    if (mission.reward > 0) {
      G.hud.showBanner('MISSION COMPLETE', `+$${mission.reward}`);
      G.audio.jingle();
    }
    if (state.index < MISSIONS.length) {
      state.index += 1;
      if (state.index >= MISSIONS.length) {
        G.save.storyDone = true;
        G.save.mission = MISSIONS.length;
        G.persist();
        G.onStoryComplete();
        makeJob();
        return;
      }
      G.save.mission = state.index;
    }
    G.persist();
    if (state.index >= MISSIONS.length) makeJob(); // odd jobs roll straight into the next
    else state.between = 3; // story missions pause, so the banner can be read
  }

  /** Generate a repeatable delivery for free roam, priced by the drive it takes. */
  function makeJob() {
    const spots = ['club', 'hotel', 'docks', 'station', 'hospital', 'lighthouse', 'hideout'];
    const key = G.rng.pick(spots);
    const target = PLACES[key];
    const focus = G.focusPos();
    const dist = Math.hypot(target.x - focus.x, target.z - focus.z);
    state.job = {
      title: 'Odd Job',
      intro: `Somebody at ${target.name} is paying for a fast arrival.`,
      steps: [{ verb: 'reach', text: `Get to ${target.name}`, target: key }],
      reward: Math.round(120 + dist * 0.4),
    };
    state.step = 0;
    state.timer = null;
    state.active = true;
  }

  /** Advance one step, or finish the mission when the step was the last. */
  function advanceStep() {
    const mission = current();
    G.audio.ding();
    state.step += 1;
    if (state.step >= mission.steps.length) completeMission();
    else applyStepHeat();
  }

  /** The finale's twist: reaching the garage is not enough while the stars are lit. */
  function stepDone(step) {
    if (step.verb === 'enterCar') return false; // completed by onEnterCar, not by standing there
    const target = targetOf(step);
    const focus = G.focusPos();
    const dist = Math.hypot(target.x - focus.x, target.z - focus.z);
    const radius = step.target === 'hideout' ? 15 : G.player.car ? 10 : 6.5;
    if (dist > radius) return false;
    if (step.target === 'hideout' && G.wanted.level > 0) return false; // shake them first
    return true;
  }

  const api = {
    /** Begin the chain (or the odd jobs) — called when play starts. */
    start() {
      if (state.index >= MISSIONS.length) makeJob();
      else startMission();
    },
    /** The first mission cares which car she takes: it must be her own coupe. */
    onEnterCar(car) {
      if (!state.active) return;
      const step = current()?.steps[state.step];
      if (step?.verb === 'enterCar' && car === G.playerCar) advanceStep();
      else if (step?.verb === 'enterCar') G.hud.showMessage('Not that one — your turquoise coupe, by the beach.');
    },
    /** Fail the current mission (busted, wasted, or out of time) back to its first step. */
    restart() {
      if (state.index < MISSIONS.length) startMission();
      else makeJob();
    },
    /** What the HUD shows: mission title, step text, distance and any timer. */
    objective() {
      const mission = current();
      if (!mission || !state.active) return null;
      const step = mission.steps[state.step];
      let dist = null;
      if (step.target) {
        const target = targetOf(step);
        const focus = G.focusPos();
        dist = Math.round(Math.hypot(target.x - focus.x, target.z - focus.z));
      }
      let text = step.text;
      if (step.target === 'hideout' && G.wanted.level > 0 && dist !== null && dist < 40) {
        text = 'Lose the heat, then reach the Lighthouse Garage';
      }
      return { title: mission.title, text, dist, timeLeft: state.timer };
    },
    /** The current target's position, for the minimap and the beacon. */
    targetPos() {
      if (!state.active) return null;
      const step = current()?.steps[state.step];
      if (!step?.target) return null;
      return targetOf(step);
    },
    update(dt) {
      if (state.between > 0) {
        state.between -= dt;
        if (state.between <= 0) startMission();
      }
      if (!state.active) {
        beacon.visible = false;
        return;
      }
      const step = current().steps[state.step];
      // The beacon stands on a reach target; an enterCar step points at the coupe instead.
      const target = step.target ? targetOf(step) : step.verb === 'enterCar' ? G.playerCar?.mesh.position : null;
      if (target) {
        beacon.visible = true;
        beacon.position.set(target.x, 0, target.z);
        ring.scale.setScalar(1 + Math.sin(G.time * 4) * 0.12);
      } else beacon.visible = false;
      if (state.timer !== null) {
        state.timer -= dt;
        if (state.timer <= 0) {
          G.hud.showBanner('OUT OF TIME', 'The job starts over.');
          G.audio.sting();
          api.restart();
          return;
        }
      }
      if (stepDone(step)) advanceStep();
    },
  };
  G.missions = api;
  return api;
}
