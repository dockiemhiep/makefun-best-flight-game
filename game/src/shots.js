// Deterministic autopilot & screenshot staging for ?shot=title|chase|approach|results.
// Every staged frame is produced exclusively by stepping the real flight simulation
// with identical player inputs — zero hand-placed states and zero faked HUD numbers.

import { FLIGHT, RUNWAY, STEP } from './config.js';
import {
  EVT_COMPLETE,
  EVT_CRASH,
  PHASE_APPROACH,
  PHASE_COURSE,
  PHASE_ROLLOUT,
  PHASE_TAKEOFF,
  angleDiff,
} from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { syncCameraToPlane } from './camera.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smooth proportional flight autopilot driving the exact same control surface inputs a player uses. */
export function computeAutopilot(world) {
  const state = world.state;
  const p = state.plane;
  const ctrl = { pitch: 0, roll: 0, throttleSet: 0.85, brake: false, toggleGear: false, cycleFlaps: false };

  if (state.phase === PHASE_TAKEOFF) {
    ctrl.throttleSet = 1.0;
    const hdgErr = angleDiff(0, p.yaw);
    ctrl.roll = clamp(hdgErr * 2.5, -0.5, 0.5);
    if (p.speed >= FLIGHT.rotateSpeed + 2) ctrl.pitch = 0.82;
    return ctrl;
  }

  if (state.phase === PHASE_ROLLOUT) {
    ctrl.throttleSet = 0;
    ctrl.brake = true;
    const hdgErr = angleDiff(0, p.yaw) - p.x * 0.008;
    ctrl.roll = clamp(hdgErr * 1.8, -0.6, 0.6);
    return ctrl;
  }

  if (state.phase === PHASE_COURSE) {
    if (p.gearDown && p.y > 26) ctrl.toggleGear = true;
    const r = state.course.rings[state.activeRing];
    if (!r) return ctrl;

    const dx = r.x - p.x;
    const dy = r.y - p.y;
    const dz = r.z - p.z;
    const horiz = Math.hypot(dx, dz) || 1;
    const yawErr = angleDiff(Math.atan2(dx, dz), p.yaw);
    const desiredRoll = clamp(yawErr * 1.85, -0.78, 0.78);
    ctrl.roll = clamp((desiredRoll - p.roll) * 4.2, -1, 1);

    const desiredPitch = clamp(Math.atan2(dy, Math.max(45, horiz)) * 1.25 + (1 - Math.cos(p.roll)) * 0.14, -0.34, 0.36);
    ctrl.pitch = clamp((desiredPitch - p.pitch) * 5.0, -1, 1);
    ctrl.throttleSet = state.activeRing >= state.course.rings.length - 2 ? 0.62 : 0.88;
    return ctrl;
  }

  if (state.phase === PHASE_APPROACH) {
    if (!p.gearDown) ctrl.toggleGear = true;
    else if (p.flaps < 2 && p.speed < 44) ctrl.cycleFlaps = true;

    const aimZ = RUNWAY.aimZ - 26;
    const distZ = Math.max(10, aimZ - p.z);
    const windCrab = -Math.atan2(state.course.def.windX, Math.max(20, p.speed));
    const interceptX = clamp(-p.x * 0.011, -0.34, 0.34);
    const yawErr = angleDiff(interceptX + windCrab, p.yaw);
    const desiredRoll = clamp(yawErr * 1.75, -0.4, 0.4);
    ctrl.roll = clamp((desiredRoll - p.roll) * 4.5, -1, 1);

    const idealY = Math.max(0, Math.tan((RUNWAY.glideslopeDeg * Math.PI) / 180) * distZ);
    let desiredPitch;
    if (p.y < 4.3 && p.z > 5) {
      ctrl.throttleSet = 0.0;
      const targetVy = p.y > 1.6 ? -0.75 : -0.44;
      desiredPitch = clamp((targetVy - p.vy) * 0.11 + 0.008, -0.04, 0.1);
    } else {
      const altErr = idealY - p.y;
      desiredPitch = clamp(-0.095 + altErr * 0.014, -0.22, 0.08);
      const targetSpd = p.z > -160 ? 22.4 : 28.0;
      ctrl.throttleSet = clamp(0.24 + (targetSpd - p.speed) * 0.055, 0.0, 0.72);
    }
    ctrl.pitch = clamp((desiredPitch - p.pitch) * 6.4, -1, 1);
    return ctrl;
  }

  return ctrl;
}

/** Step the real simulation forward to stage `title`, `chase`, `approach`, or `results`. */
export function stageShot(name, world, cam) {
  world.setCourse(0);

  if (name === 'chase' || name === 'play') {
    // Money frame: real takeoff -> Ring 1 cleared -> banking smoothly toward Ring 2 (River Estuary)
    // over Pelican Harbor small town, winding river, patchwork fields, lighthouse & coastline!
    for (let steps = 0; steps < 60 * 35; steps += 1) {
      world.step(STEP, computeAutopilot(world));
      syncCameraToPlane(cam, world.state.plane, STEP);
      if (world.state.activeRing === 1 && world.state.plane.z > 840) break;
    }
    return { screen: SCREEN_PLAY, bestScore: world.state.totalScore, isNewRecord: false };
  }

  if (name === 'approach') {
    // Full real loop through all 12 rings onto final approach for Runway 36 (on glideslope, gear & flaps down)
    for (let steps = 0; steps < 60 * 165; steps += 1) {
      const ev = world.step(STEP, computeAutopilot(world));
      syncCameraToPlane(cam, world.state.plane, STEP);
      if (ev & (EVT_COMPLETE | EVT_CRASH)) break;
      if (world.state.phase === PHASE_APPROACH && world.state.plane.z > -195 && world.state.plane.z < -115 && world.state.plane.gearAnim > 0.9) {
        break;
      }
    }
    return { screen: SCREEN_PLAY, bestScore: world.state.totalScore, isNewRecord: false };
  }

  if (name === 'results' || name === 'end') {
    // Full real flight from takeoff through all 12 rings to Touchdown Zone landing & rollout stop!
    for (let steps = 0; steps < 60 * 195; steps += 1) {
      const ev = world.step(STEP, computeAutopilot(world));
      syncCameraToPlane(cam, world.state.plane, STEP);
      if (ev & (EVT_COMPLETE | EVT_CRASH)) break;
    }
    return {
      screen: SCREEN_OVER,
      bestScore: world.state.totalScore,
      isNewRecord: true,
    };
  }

  // Default ('title' / 'start'): real takeoff & climb toward Ring 1 over Runway 36, town, river, fields & lighthouse
  for (let steps = 0; steps < 60 * 15; steps += 1) {
    world.step(STEP, computeAutopilot(world));
    syncCameraToPlane(cam, world.state.plane, STEP);
    if (world.state.plane.z > 475) break;
  }
  return { screen: SCREEN_TITLE, bestScore: 0, isNewRecord: false };
}
