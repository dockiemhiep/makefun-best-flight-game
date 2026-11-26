// Boot, fixed 60 Hz simulation loop, screen transitions, audio & localStorage best scores.
// ?seed=N fixes procedural scenery; ?shot=start|play|approach|end stages deterministic screenshots.

import { BEST_PREFIX, STEP } from './config.js';
import { createRandom } from './random.js';
import { COURSE_DEFS } from './courses.js';
import { createCamera, syncCameraToPlane } from './camera.js';
import {
  EVT_APPROACH,
  EVT_BULLSEYE,
  EVT_COMPLETE,
  EVT_CRASH,
  EVT_FLAPS,
  EVT_GEAR,
  EVT_LIFTOFF,
  EVT_RING,
  EVT_RING_MISS,
  EVT_TOUCHDOWN,
  createWorld,
} from './world.js';
import { createRenderer } from './render.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  getTitleButtons,
} from './hud.js';
import {
  ACT_CAM,
  ACT_CONFIRM,
  ACT_FLAPS,
  ACT_GEAR,
  ACT_INVERT,
  ACT_MUTE,
  ACT_PAUSE,
  ACT_RESTART,
  ACT_TITLE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { computeAutopilot, stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

const world = createWorld(() => createRandom(seed), 0);
const cam = createCamera();
const renderer = createRenderer(canvas);

function readBest(courseId) {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_PREFIX + courseId) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(courseId, val) {
  try {
    window.localStorage.setItem(BEST_PREFIX + courseId, String(val));
  } catch {
    // Private browsing mode fallback
  }
}

function loadAllBests() {
  const map = {};
  for (const def of COURSE_DEFS) map[def.id] = readBest(def.id);
  return map;
}

function runShot(name) {
  const scene = stageShot(name, world, cam);
  const courseId = world.state.course.def.id;
  const bestScores = scene.bestScore > 0 ? { [courseId]: scene.bestScore } : {};
  const opts = {
    stallSpeed: world.stallSpeedOf(world.state.plane),
    camMode: cam.mode,
    invertPitch: false,
    muted: false,
    bestScores,
    bestScore: scene.bestScore,
    isNewRecord: scene.isNewRecord,
  };
  renderer.draw(world.state, cam, scene.screen, opts);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, cam, scene.screen, opts);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.clientToLogical);
  const audio = createAudio();
  const bestScores = loadAllBests();

  let screen = SCREEN_TITLE;
  let invertPitch = false;
  let isNewRecord = false;
  let accumulator = 0;
  let last = performance.now();

  function announce(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function startTitleDemo(courseIndex) {
    world.setCourse(courseIndex);
    // Advance real autopilot takeoff climb past Runway 36 so title backdrop matches ?shot=title
    for (let i = 0; i < 60 * 15; i += 1) {
      world.step(STEP, computeAutopilot(world));
      syncCameraToPlane(cam, world.state.plane, STEP);
      if (world.state.plane.z > 475) break;
    }
    screen = SCREEN_TITLE;
    announce(`Skyward Rings. ${world.state.course.def.name}. Press Space or click to fly.`);
  }

  function startFlight(courseIndex = world.state.courseIndex) {
    audio.ensureStarted();
    world.setCourse(courseIndex);
    syncCameraToPlane(cam, world.state.plane, STEP);
    isNewRecord = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Cleared for takeoff on Runway 36, ${world.state.course.def.name}.`);
  }

  function finishFlight() {
    screen = SCREEN_OVER;
    const id = world.state.course.def.id;
    const prev = bestScores[id] || 0;
    if (world.state.totalScore > prev && world.state.grade !== 'D') {
      bestScores[id] = world.state.totalScore;
      saveBest(id, world.state.totalScore);
      isNewRecord = true;
    }
    announce(
      world.state.grade === 'D'
        ? `Flight terminated. ${world.state.crashReason}`
        : `Touchdown complete! Grade ${world.state.grade}. Score ${world.state.totalScore}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    const coursePick = input.takeCoursePick();
    const click = input.takePointerClick();

    if (actions & ACT_MUTE) audio.toggleMute();
    if (actions & ACT_CAM) cam.mode = cam.mode === 'chase' ? 'cockpit' : 'chase';
    if (actions & ACT_INVERT) invertPitch = !invertPitch;

    if (coursePick >= 0 && coursePick < COURSE_DEFS.length) {
      if (screen === SCREEN_TITLE) startTitleDemo(coursePick);
      else if (screen === SCREEN_OVER) startFlight(coursePick);
    }

    if (click) {
      audio.ensureStarted();
      if (screen === SCREEN_TITLE) {
        const btns = getTitleButtons();
        let hit = false;
        for (const b of btns) {
          if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
            hit = true;
            if (b.id === 'launch') startFlight();
            else if (b.courseIndex !== undefined) startTitleDemo(b.courseIndex);
            break;
          }
        }
        if (!hit) startFlight();
      } else if (screen === SCREEN_OVER) {
        startFlight();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
      }
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACT_CONFIRM) startFlight();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACT_PAUSE | ACT_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Flight resumed.');
      } else if (actions & ACT_RESTART) {
        startFlight();
      } else if (actions & ACT_TITLE) {
        startTitleDemo(world.state.courseIndex);
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACT_CONFIRM | ACT_RESTART)) startFlight();
      else if (actions & ACT_TITLE) startTitleDemo(world.state.courseIndex);
      return;
    }

    // Active play screen one-shot actions
    if (actions & ACT_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Flight paused.');
      return;
    }
    if (actions & ACT_RESTART) {
      startFlight();
      return;
    }

    return actions;
  }

  function stepPlay(queuedActions) {
    const flight = input.readFlight(invertPitch);
    const ctrl = {
      pitch: flight.pitch,
      roll: flight.roll,
      throttleDelta: flight.throttleDelta,
      brake: flight.brake,
      toggleGear: Boolean(queuedActions & ACT_GEAR),
      cycleFlaps: Boolean(queuedActions & ACT_FLAPS),
    };
    const ev = world.step(STEP, ctrl);
    syncCameraToPlane(cam, world.state.plane, STEP);

    if (ev & EVT_LIFTOFF) audio.playLiftoff();
    if (ev & EVT_RING) audio.playRing(world.state.streak, Boolean(ev & EVT_BULLSEYE));
    if (ev & EVT_RING_MISS) audio.playMiss();
    if (ev & (EVT_GEAR | EVT_FLAPS)) audio.playServo(world.state.plane.gearDown);
    if (ev & EVT_APPROACH) audio.playApproach();
    if (ev & EVT_TOUCHDOWN) {
      audio.playTouchdown();
      cam.shake = Math.min(1, world.state.plane.touchdownFpm / 520);
    }
    if (ev & EVT_COMPLETE) {
      audio.playComplete();
      finishFlight();
    } else if (ev & EVT_CRASH) {
      audio.playCrash();
      cam.shake = 1.2;
      finishFlight();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dt;
    last = now;

    let oneShot = handleActions() || 0;

    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        const ev = world.step(STEP, computeAutopilot(world));
        syncCameraToPlane(cam, world.state.plane, STEP);
        if (ev & (EVT_COMPLETE | EVT_CRASH)) startTitleDemo(world.state.courseIndex);
        accumulator -= STEP;
      }
      audio.update(world.state.plane, false, false, false, dt);
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepPlay(oneShot);
        oneShot = 0;
        accumulator -= STEP;
      }
      audio.update(world.state.plane, true, world.state.stallWarn, world.state.gearWarn, dt);
    } else {
      accumulator = 0;
      audio.update(world.state.plane, false, false, false, dt);
    }

    const courseId = world.state.course.def.id;
    renderer.draw(world.state, cam, screen, {
      stallSpeed: world.stallSpeedOf(world.state.plane),
      camMode: cam.mode,
      invertPitch,
      muted: audio.isMuted(),
      bestScores,
      bestScore: bestScores[courseId] || 0,
      isNewRecord,
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Flight paused.');
    }
  });

  startTitleDemo(0);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
