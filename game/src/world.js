// Pure 60 Hz flight simulation, ring progression, glideslope & touchdown grading,
// wingtip trails and particle pools. Zero DOM or Canvas dependencies.

import { FLIGHT, LANDING, M_TO_FT, MS_TO_FPM, MS_TO_KTS, RING, RUNWAY } from './config.js';
import { RIVER_X_MAX, RIVER_X_MIN, buildCourseWorld, coastX, riverCenterZ, riverHalfWidth, terrainHeight } from './courses.js';

export const PHASE_TAKEOFF = 'takeoff';
export const PHASE_COURSE = 'course';
export const PHASE_APPROACH = 'approach';
export const PHASE_ROLLOUT = 'rollout';
export const PHASE_COMPLETE = 'complete';
export const PHASE_CRASHED = 'crashed';

export const EVT_LIFTOFF = 1;
export const EVT_RING = 2;
export const EVT_BULLSEYE = 4;
export const EVT_RING_MISS = 8;
export const EVT_TOUCHDOWN = 16;
export const EVT_COMPLETE = 32;
export const EVT_CRASH = 64;
export const EVT_GEAR = 128;
export const EVT_FLAPS = 256;
export const EVT_APPROACH = 512;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  let r = a % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r;
}

export function angleDiff(target, current) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(randomFactory, courseIndex = 0) {
  const particles = [];
  for (let i = 0; i < 96; i += 1) {
    particles.push({ active: false, kind: 'spark', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 4, color: '#ffd24d' });
  }
  const trails = [[], []]; // Left & right wingtip ribbons

  const state = {
    courseIndex,
    course: null,
    phase: PHASE_TAKEOFF,
    time: 0,
    flightTime: 0,
    activeRing: 0,
    ringsHit: 0,
    bullseyes: 0,
    streak: 0,
    bestStreak: 0,
    ringScore: 0,
    ringTimeBonusSec: 0,
    landingScore: 0,
    tdzBonus: 0,
    timeBonus: 0,
    totalScore: 0,
    grade: 'B',
    stars: 0,
    offField: false,
    landingReport: null,
    failType: '',
    crashReason: '',
    stallTimer: 0,
    maxSpeedKts: 0,
    speedSum: 0,
    speedSamples: 0,
    bannerText: '',
    bannerSub: '',
    bannerColor: '#ffd24d',
    bannerTimer: 0,
    stallWarn: false,
    gearWarn: false,
    papiReds: 2, // 0..4 red lights
    locDev: 0,   // -1..1 localizer offset
    gsDev: 0,    // -1..1 glideslope offset
    plane: {
      x: 0,
      y: 0,
      z: 34,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      throttle: 0.18,
      rpm: 0.25,
      propAngle: 0,
      gearDown: true,
      gearAnim: 1,
      flaps: 0,      // 0, 1, 2
      flapAnim: 0,
      braking: false,
      onGround: true,
      aileron: 0,
      elevator: 0,
      rudder: 0,
      time: 0,
      prevRingDot: 0,
      touchdownFpm: 0,
      touchdownZ: 0,
      touchdownX: 0,
      touchdownRoll: 0,
      gLoad: 1,
    },
    particles,
    trails,
  };

  function spawnParticle(kind, x, y, z, vx, vy, vz, maxLife, size, color) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.active) {
        p.active = true;
        p.kind = kind;
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.size = size;
        p.color = color;
        return;
      }
    }
  }

  function showBanner(text, sub, color = '#ffd24d', duration = 2.4) {
    state.bannerText = text;
    state.bannerSub = sub;
    state.bannerColor = color;
    state.bannerTimer = duration;
  }

  function setCourse(idx) {
    state.courseIndex = idx;
    reset();
  }

  function reset() {
    state.course = buildCourseWorld(state.courseIndex, randomFactory());
    state.phase = PHASE_TAKEOFF;
    state.time = 0;
    state.flightTime = 0;
    state.activeRing = 0;
    state.ringsHit = 0;
    state.bullseyes = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.ringScore = 0;
    state.ringTimeBonusSec = 0;
    state.landingScore = 0;
    state.tdzBonus = 0;
    state.timeBonus = 0;
    state.totalScore = 0;
    state.grade = 'B';
    state.stars = 0;
    state.offField = false;
    state.landingReport = null;
    state.failType = '';
    state.crashReason = '';
    state.stallTimer = 0;
    state.maxSpeedKts = 0;
    state.speedSum = 0;
    state.speedSamples = 0;
    state.bannerText = 'CLEARED FOR TAKEOFF · RWY 36';
    state.bannerSub = 'Throttle Up [W] · Rotate at 55 KTS';
    state.bannerColor = '#7cf7c9';
    state.bannerTimer = 4.2;
    state.stallWarn = false;
    state.gearWarn = false;
    state.papiReds = 2;
    state.locDev = 0;
    state.gsDev = 0;

    const p = state.plane;
    Object.assign(p, {
      x: 0, y: 0, z: 34, vx: 0, vy: 0, vz: 0, speed: 0, yaw: 0, pitch: 0, roll: 0,
      throttle: 0.16, rpm: 0.22, propAngle: 0, gearDown: true, gearAnim: 1,
      flaps: 0, flapAnim: 0, braking: false, onGround: true,
      aileron: 0, elevator: 0, rudder: 0, time: 0, gLoad: 1, prevRingDot: -999,
    });
    const rings = state.course.rings;
    for (let i = 0; i < rings.length; i += 1) {
      rings[i].status = i === 0 ? 'active' : 'pending';
      rings[i].hitFlash = 0;
    }
    for (const pt of particles) pt.active = false;
    trails[0].length = 0;
    trails[1].length = 0;
  }

  function stallSpeedOf(plane) {
    if (plane.flaps === 2) return FLIGHT.stallFlap2;
    if (plane.flaps === 1) return FLIGHT.stallFlap1;
    return FLIGHT.stallClean;
  }

  function isOnRunway(x, z) {
    return Math.abs(x - RUNWAY.x) <= RUNWAY.width * 0.56 && z >= RUNWAY.zStart - 12 && z <= RUNWAY.zEnd + 16;
  }

  function waterKindAt(x, z) {
    if (x > coastX(z) + 18) return 'sea';
    if (x >= RIVER_X_MIN && x <= RIVER_X_MAX && Math.abs(z - riverCenterZ(x)) <= riverHalfWidth(x)) return 'river';
    return null;
  }

  function advanceRing(missed) {
    const rings = state.course.rings;
    const cur = rings[state.activeRing];
    if (missed && cur) {
      cur.status = 'missed';
      state.streak = 0;
      showBanner('RING MISSED', 'Stay aligned with the gold guide chevrons', '#ff8b6b', 1.7);
    }
    state.activeRing += 1;
    if (state.activeRing < rings.length) {
      rings[state.activeRing].status = 'active';
      state.plane.prevRingDot = -999;
    } else if (state.phase === PHASE_COURSE) {
      state.phase = PHASE_APPROACH;
      showBanner('CLEARED TO LAND · RWY 36', 'Lower Gear [G] · Flaps [F] · Aim for Touchdown Zone', '#7cf7c9', 3.6);
      return EVT_APPROACH;
    }
    return 0;
  }

  function finalizeFlight() {
    state.phase = PHASE_COMPLETE;
    const p = state.plane;
    const fpm = p.touchdownFpm;
    const onRwy = isOnRunway(p.touchdownX, p.touchdownZ);
    const inTdz = onRwy && p.touchdownZ >= RUNWAY.tdzStart && p.touchdownZ <= RUNWAY.tdzEnd && Math.abs(p.touchdownX) <= RUNWAY.width * 0.5;
    const avgKts = state.speedSamples > 0 ? Math.round((state.speedSum / state.speedSamples) * MS_TO_KTS) : 0;

    if (!onRwy) {
      // Off-field landing: distinct outcome, not normal runway mission completion
      state.offField = true;
      state.landingScore = 0;
      state.tdzBonus = 0;
      state.timeBonus = 0;
      state.totalScore = state.ringScore;
      state.grade = '—';
      state.stars = 0;
      state.landingReport = {
        smoothLabel: 'OFF-FIELD',
        fpm: Math.round(fpm),
        inTdz: false,
        onRwy: false,
        centerOffset: Math.round(Math.abs(p.touchdownX) * 10) / 10,
        zoneLabel: 'OFF-FIELD (MISSED RWY 36)',
        avgKts,
        maxKts: Math.round(state.maxSpeedKts),
      };
      return;
    }

    state.offField = false;
    let smoothLabel = 'FIRM';
    let smoothScore = 450;
    if (fpm <= LANDING.butterFpm) {
      smoothLabel = 'BUTTER!';
      smoothScore = LANDING.smoothMax;
    } else if (fpm <= LANDING.smoothFpm) {
      smoothLabel = 'SMOOTH';
      smoothScore = Math.round(740 + ((LANDING.smoothFpm - fpm) / (LANDING.smoothFpm - LANDING.butterFpm)) * 220);
    } else if (fpm <= LANDING.firmFpm) {
      smoothLabel = 'FIRM';
      smoothScore = Math.round(420 + ((LANDING.firmFpm - fpm) / (LANDING.firmFpm - LANDING.smoothFpm)) * 300);
    } else {
      smoothLabel = 'HARD';
      smoothScore = Math.round(160 + ((LANDING.maxSafeFpm - Math.min(fpm, LANDING.maxSafeFpm)) / (LANDING.maxSafeFpm - LANDING.firmFpm)) * 240);
    }
    const levelFactor = clamp(1 - Math.abs(p.touchdownRoll) * 0.8, 0.72, 1);
    state.landingScore = Math.round(smoothScore * levelFactor);

    const centerAcc = clamp(1 - Math.abs(p.touchdownX) / (RUNWAY.width * 0.45), 0, 1);
    state.tdzBonus = inTdz
      ? LANDING.tdzBonus + Math.round(centerAcc * LANDING.centerlineBonus)
      : Math.round(180 + centerAcc * 140);

    const par = state.course.def.parTime + state.ringTimeBonusSec;
    state.timeBonus = Math.round(clamp(420 + (par - state.flightTime) * 14, 0, LANDING.timeBonusMax));
    state.totalScore = state.ringScore + state.landingScore + state.tdzBonus + state.timeBonus;

    const ringCount = state.course.rings.length;
    const maxStreak = RING.streakStep * ((ringCount * (ringCount - 1)) / 2);
    const maxTheoretical =
      ringCount * (RING.passPoints + RING.bullseyeBonus) +
      maxStreak +
      LANDING.smoothMax +
      LANDING.tdzBonus +
      LANDING.centerlineBonus +
      LANDING.timeBonusMax;
    const ratio = state.totalScore / maxTheoretical;
    if (ratio >= 0.74 && state.ringsHit >= ringCount - 1 && inTdz && fpm <= LANDING.smoothFpm) state.grade = 'S';
    else if (ratio >= 0.56) state.grade = 'A';
    else if (ratio >= 0.36) state.grade = 'B';
    else state.grade = 'C';

    state.stars =
      state.grade === 'S' || (state.grade === 'A' && inTdz && state.ringsHit >= ringCount - 1) ? 3
      : state.grade === 'A' || state.grade === 'B' ? 2
      : 1;

    state.landingReport = {
      smoothLabel,
      fpm: Math.round(fpm),
      inTdz,
      onRwy,
      centerOffset: Math.round(Math.abs(p.touchdownX) * 10) / 10,
      zoneLabel: inTdz ? 'TOUCHDOWN ZONE' : 'RUNWAY (OUTSIDE TDZ)',
      avgKts,
      maxKts: Math.round(state.maxSpeedKts),
    };
  }

  function triggerCrash(failType, reason, inWater) {
    state.phase = PHASE_CRASHED;
    state.failType = failType;
    state.crashReason = reason;
    state.totalScore = state.ringScore;
    state.grade = 'D';
    state.stars = 0;
    const p = state.plane;
    for (let i = 0; i < 34; i += 1) {
      const a = (i / 34) * Math.PI * 2;
      const spd = 8 + (i % 5) * 6;
      spawnParticle(
        inWater ? 'splash' : 'dust',
        p.x,
        Math.max(1, p.y),
        p.z,
        Math.cos(a) * spd,
        6 + (i % 7) * 3.5,
        Math.sin(a) * spd,
        0.9 + (i % 4) * 0.25,
        8 + (i % 4) * 3,
        inWater ? '#d4f3ff' : '#f2c178',
      );
    }
    showBanner('FLIGHT TERMINATED', reason, '#ff6b6b', 4);
  }

  /**
   * Advance one fixed simulation step.
   * `controls`: { pitch: -1..1 (+1 climb), roll: -1..1 (+1 right), throttleDelta: -1..1,
   *               brake: bool, toggleGear: bool, cycleFlaps: bool, demoMode: bool }
   */
  function step(dt, controls) {
    let events = 0;
    state.time += dt;
    const p = state.plane;
    p.time = state.time;

    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);

    // Update particles always
    for (let i = 0; i < particles.length; i += 1) {
      const pt = particles[i];
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      if (pt.kind === 'splash' || pt.kind === 'dust') pt.vy -= 14 * dt;
      else if (pt.kind === 'smoke') { pt.vy += 1.6 * dt; pt.size += dt * 7; }
    }

    // Ring flash decay
    for (const r of state.course.rings) {
      if (r.hitFlash > 0) r.hitFlash = Math.max(0, r.hitFlash - dt * 1.9);
    }

    if (state.phase === PHASE_COMPLETE || state.phase === PHASE_CRASHED) {
      p.propAngle += (4 + p.rpm * 28) * dt;
      p.rpm = Math.max(0.14, p.rpm - dt * 0.25);
      return events;
    }

    // Toggle systems
    if (controls.toggleGear && !p.onGround) {
      p.gearDown = !p.gearDown;
      events |= EVT_GEAR;
      showBanner(p.gearDown ? 'LANDING GEAR DOWN' : 'LANDING GEAR UP', p.gearDown ? '3 Green · Ready for landing' : 'Clean wing · Higher cruise speed', '#7cf7c9', 1.4);
    }
    if (controls.cycleFlaps) {
      p.flaps = (p.flaps + 1) % 3;
      events |= EVT_FLAPS;
      const lbl = p.flaps === 0 ? 'FLAPS UP (0°)' : p.flaps === 1 ? 'FLAPS APPROACH (15°)' : 'FLAPS LANDING (30°)';
      const stallKts = formatKts(stallSpeedOf(p));
      showBanner(lbl, p.flaps === 2 ? `Low stall speed ${stallKts} KTS` : p.flaps === 1 ? `Extra lift · Stall ${stallKts} KTS` : `Cruise config · Stall ${stallKts} KTS`, '#ffd24d', 1.3);
    }

    // Smooth actuator animations
    const gearTarget = p.gearDown ? 1 : 0;
    p.gearAnim += clamp(gearTarget - p.gearAnim, -dt * 1.4, dt * 1.4);
    const flapTarget = p.flaps * 0.5;
    p.flapAnim += clamp(flapTarget - p.flapAnim, -dt * 1.8, dt * 1.8);

    // Throttle & engine spool
    if (controls.throttleSet !== undefined) {
      p.throttle = clamp(controls.throttleSet, 0, 1);
    } else if (controls.throttleDelta) {
      p.throttle = clamp(p.throttle + controls.throttleDelta * FLIGHT.throttleRate * dt, 0, 1);
    }
    p.rpm += (0.14 + p.throttle * 0.86 - p.rpm) * Math.min(1, dt * 4.5);
    p.propAngle += (8 + p.rpm * 46) * dt;
    p.braking = Boolean(controls.brake);

    // Start mission clock once throttle advances past 35%
    if (state.phase !== PHASE_TAKEOFF || p.speed > 3 || p.throttle > 0.35) {
      state.flightTime += dt;
    }

    // Smooth control surface visual deflection
    const pitchIn = clamp(controls.pitch || 0, -1, 1);
    const rollIn = clamp(controls.roll || 0, -1, 1);
    p.aileron += (rollIn - p.aileron) * Math.min(1, dt * 12);
    p.elevator += (pitchIn - p.elevator) * Math.min(1, dt * 12);
    p.rudder += (rollIn * 0.65 - p.rudder) * Math.min(1, dt * 10);

    const stallSpd = stallSpeedOf(p);
    const windX = state.course.def.windX;
    const windZ = state.course.def.windZ;

    if (p.onGround) {
      // Ground roll physics on Runway 36 (or grass)
      p.roll += (0 - p.roll) * Math.min(1, dt * 8);
      const onRwy = isOnRunway(p.x, p.z);
      const rollingDrag = onRwy ? 0.65 : 2.8;
      let accel = p.rpm * FLIGHT.thrustMax - rollingDrag - p.speed * p.speed * 0.0022;
      if (p.braking) accel -= FLIGHT.dragBrake;
      // Gentle rollout brake assist once landed, throttle idle, and slowing down
      if (state.phase === PHASE_ROLLOUT && p.throttle < 0.14 && p.speed < 24) {
        accel -= 7.5;
      }
      p.speed = clamp(p.speed + accel * dt, 0, FLIGHT.maxSpeed);

      // Nosewheel steering
      const steerAuth = clamp(p.speed / 18, 0, 1);
      p.yaw = wrapAngle(p.yaw + rollIn * FLIGHT.groundRollSteer * steerAuth * dt);

      // Nose pitch up during rotation
      const rotateReady = p.speed >= FLIGHT.rotateSpeed * (p.flaps > 0 ? 0.88 : 1);
      if (rotateReady && pitchIn > 0.08) {
        p.pitch = clamp(p.pitch + pitchIn * 1.15 * dt, 0, 0.28);
      } else {
        p.pitch += (0 - p.pitch) * Math.min(1, dt * 6);
      }

      p.vx = Math.sin(p.yaw) * p.speed;
      p.vz = Math.cos(p.yaw) * p.speed;
      p.vy = 0;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = 0;
      p.gLoad = 1;

      // Check lift-off!
      if (rotateReady && p.pitch > 0.095 && (state.phase === PHASE_TAKEOFF || p.throttle > 0.65)) {
        p.onGround = false;
        p.y = 0.6;
        p.vy = Math.sin(p.pitch) * p.speed;
        if (state.phase === PHASE_TAKEOFF) {
          state.phase = PHASE_COURSE;
          showBanner('AIRBORNE!', `Fly through all ${state.course.rings.length} glowing rings · Gear Up [G]`, '#ffd24d', 2.4);
        } else if (state.phase === PHASE_ROLLOUT) {
          // Go-around!
          state.phase = PHASE_APPROACH;
          showBanner('GO-AROUND', 'Climb out and re-align for Runway 36', '#ffd24d', 2.2);
        }
        events |= EVT_LIFTOFF;
      }

      // Check completion during rollout
      if (state.phase === PHASE_ROLLOUT && p.speed <= 2.2) {
        p.speed = 0;
        p.vx = 0;
        p.vz = 0;
        finalizeFlight();
        events |= EVT_COMPLETE;
      }

      // Check running into the sea or river off-runway
      const waterKind = waterKindAt(p.x, p.z);
      if (waterKind) {
        triggerCrash('WATER CRASH', waterKind === 'river' ? 'Ran off into the river!' : 'Ran off the coast into the sea!', true);
        events |= EVT_CRASH;
      }
      state.stallWarn = false;
      state.stallTimer = 0;
      state.gearWarn = false;
    } else {
      // Airborne 3D flight physics
      const ktsNow = p.speed * MS_TO_KTS;
      if (ktsNow > state.maxSpeedKts) state.maxSpeedKts = ktsNow;
      state.speedSum += p.speed;
      state.speedSamples += 1;

      const authority = clamp((p.speed - stallSpd * 0.55) / (stallSpd * 0.75), 0.22, 1);

      // Roll dynamics with subtle auto-level stability when stick released
      if (Math.abs(rollIn) > 0.02) {
        p.roll = clamp(p.roll + rollIn * FLIGHT.rollRate * authority * dt, -FLIGHT.rollMax, FLIGHT.rollMax);
      } else {
        const levelStep = FLIGHT.rollAutoLevel * dt;
        if (Math.abs(p.roll) <= levelStep) p.roll = 0;
        else p.roll -= Math.sign(p.roll) * levelStep;
      }

      // Pitch dynamics + stall warning & sustained climbing-stall fail state
      const stalling = p.speed < stallSpd;
      state.stallWarn = p.speed < stallSpd + 3.2 && p.y > 6;
      if (p.y > 10 && p.pitch > 0.12 && p.speed < stallSpd - 2.2) {
        state.stallTimer += dt;
        if (state.stallTimer >= FLIGHT.stallFailTime) {
          triggerCrash('AERODYNAMIC STALL', 'Stalled while climbing too slowly — add throttle [W] or lower nose!', false);
          return events | EVT_CRASH;
        }
      } else {
        state.stallTimer = Math.max(0, state.stallTimer - dt * 1.5);
      }
      if (Math.abs(pitchIn) > 0.02) {
        p.pitch = clamp(p.pitch + pitchIn * FLIGHT.pitchRate * authority * dt, FLIGHT.pitchMin, FLIGHT.pitchMax);
      } else if (stalling) {
        p.pitch = clamp(p.pitch - 0.42 * dt, FLIGHT.pitchMin, FLIGHT.pitchMax);
      } else {
        // Very gentle longitudinal stability damping toward level near small angles
        if (Math.abs(p.pitch) < 0.06) p.pitch *= Math.max(0, 1 - dt * 1.4);
      }

      // Coordinated turn from bank angle
      const speedTurnScale = clamp(46 / Math.max(24, p.speed), 0.68, 1.25);
      p.yaw = wrapAngle(p.yaw + Math.sin(p.roll) * FLIGHT.turnFactor * speedTurnScale * dt);

      // Thrust, aerodynamic drag, gravity along flight path
      const dragCoeff =
        FLIGHT.dragBase +
        p.gearAnim * FLIGHT.dragGear +
        p.flapAnim * 2 * FLIGHT.dragFlap +
        Math.abs(Math.sin(p.roll)) * 0.0009;
      const thrust = p.rpm * FLIGHT.thrustMax;
      const drag = p.speed * p.speed * dragCoeff + (p.braking ? FLIGHT.dragAirbrake : 0);
      const gravAlong = FLIGHT.gravity * Math.sin(p.pitch) * 0.55;
      p.speed = clamp(p.speed + (thrust - drag - gravAlong) * dt, 10, FLIGHT.maxSpeed);

      // Vertical flight path with realistic flap camber, slow-speed sink, and ground-effect cushion
      const sy = Math.sin(p.yaw);
      const cy = Math.cos(p.yaw);
      const sp = Math.sin(p.pitch);
      const cp = Math.cos(p.pitch);

      const speedRatio = p.speed / stallSpd;
      const slowSink = speedRatio < 1.24 ? (1.24 - speedRatio) * 2.5 : 0;
      const stallSink = stalling ? (stallSpd - p.speed) * 0.85 : 0;
      const bankSink = (1 - Math.cos(p.roll)) * 4.2;
      const flapCamber = p.flapAnim * 0.018;
      let targetVy = Math.sin(p.pitch + flapCamber) * p.speed - bankSink - slowSink - stallSink;
      if (p.y < 10 && targetVy < 0) {
        targetVy *= 1 - (1 - p.y / 10) * 0.32;
      }

      p.vx = sy * cp * p.speed + windX;
      p.vz = cy * cp * p.speed + windZ;
      p.vy += (targetVy - p.vy) * Math.min(1, dt * 6.5);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.gLoad = clamp(1 / Math.max(0.45, Math.cos(p.roll)) + pitchIn * 0.45, 0.4, 3.2);

      // Wingtip contrails during banking or brisk cruise
      const wingSpan = 6.9;
      const cr = Math.cos(p.roll);
      const sr = Math.sin(p.roll);
      const showTrail = p.speed > 34 && (Math.abs(p.roll) > 0.22 || p.speed > 50);
      if (showTrail) {
        for (let s = 0; s < 2; s += 1) {
          const dir = s === 0 ? -1 : 1;
          const wx = p.x + cy * cr * wingSpan * dir;
          const wy = p.y - sr * wingSpan * dir + 0.3;
          const wz = p.z - sy * cr * wingSpan * dir;
          const arr = trails[s];
          arr.push({ x: wx, y: wy, z: wz, life: 1 });
          if (arr.length > 26) arr.shift();
        }
      }
      for (let s = 0; s < 2; s += 1) {
        const arr = trails[s];
        for (let i = arr.length - 1; i >= 0; i -= 1) {
          arr[i].life -= dt * 1.45;
          if (arr[i].life <= 0) arr.splice(i, 1);
        }
      }

      // Gear warning on final approach below 180 ft (~55 m)
      state.gearWarn = state.phase === PHASE_APPROACH && !p.gearDown && p.y < 58;

      // Ground / Terrain / Water contact check!
      const gndY = terrainHeight(p.x, p.z);
      if (p.y <= gndY) {
        const sinkFpm = Math.max(0, -p.vy) * MS_TO_FPM;
        const touchKts = Math.round(p.speed * MS_TO_KTS);
        const waterKind = waterKindAt(p.x, p.z);
        const onRwy = gndY === 0 && !waterKind && isOnRunway(p.x, p.z);

        if (waterKind) {
          p.y = 0;
          triggerCrash('WATER CRASH', waterKind === 'river' ? 'Crashed into the river — watch your altitude over water!' : 'Crashed into the coastal bay — watch your altitude over water!', true);
          events |= EVT_CRASH;
        } else if (gndY > 1) {
          p.y = gndY;
          triggerCrash('TERRAIN CRASH', 'Collided with the mountain ridge — climb clear of high ground!', false);
          events |= EVT_CRASH;
        } else if (!p.gearDown || p.gearAnim < 0.7) {
          p.y = 0;
          triggerCrash('HARD LANDING', 'Belly impact — deploy landing gear [G] before touchdown!', false);
          events |= EVT_CRASH;
        } else if (Math.abs(p.roll) > LANDING.maxSafeRoll) {
          p.y = 0;
          triggerCrash('HARD LANDING', 'Wingtip strike — level wings before touchdown!', false);
          events |= EVT_CRASH;
        } else if (sinkFpm > LANDING.maxSafeFpm) {
          p.y = 0;
          triggerCrash('HARD LANDING', `Descent rate too high (${Math.round(sinkFpm)} fpm > ${LANDING.maxSafeFpm}) — flare gently!`, false);
          events |= EVT_CRASH;
        } else if (touchKts > LANDING.maxSafeKts) {
          p.y = 0;
          triggerCrash('HARD LANDING', `Touchdown too fast (${touchKts} KTS > ${LANDING.maxSafeKts} KTS) — deploy flaps [F] & cut throttle!`, false);
          events |= EVT_CRASH;
        } else {
          // Safe touchdown!!
          p.touchdownFpm = sinkFpm;
          p.touchdownX = p.x;
          p.touchdownZ = p.z;
          p.touchdownRoll = p.roll;
          p.y = 0;
          p.onGround = true;
          p.vy = 0;
          p.pitch = Math.max(0, p.pitch * 0.35);
          p.roll = 0;
          events |= EVT_TOUCHDOWN;

          for (let i = 0; i < 12; i += 1) {
            spawnParticle('smoke', p.x + (i % 2 === 0 ? -1.8 : 1.8), 0.4, p.z, Math.sin(i * 2.1) * 2.5, 1.4 + (i % 3) * 0.6, -p.vz * 0.15, 0.85, 5, 'rgba(242, 246, 250, 0.8)');
          }

          if (state.phase === PHASE_APPROACH || state.activeRing >= state.course.rings.length) {
            state.phase = PHASE_ROLLOUT;
            if (!onRwy) {
              showBanner('OFF-FIELD TOUCHDOWN', 'Missed Runway 36 · Hold [SPACE] to stop', '#ffb347', 3.2);
            } else {
              const inTdz = p.z >= RUNWAY.tdzStart && p.z <= RUNWAY.tdzEnd;
              const gradeTxt =
                sinkFpm <= LANDING.butterFpm
                  ? `BUTTER TOUCHDOWN! -${Math.round(sinkFpm)} FPM`
                  : sinkFpm <= LANDING.smoothFpm
                    ? `SMOOTH TOUCHDOWN · -${Math.round(sinkFpm)} FPM`
                    : `TOUCHDOWN · -${Math.round(sinkFpm)} FPM`;
              showBanner(
                gradeTxt,
                inTdz ? 'Inside Touchdown Zone! Hold [SPACE] to brake to a stop' : 'Hold [SPACE] to brake to a stop',
                sinkFpm <= LANDING.smoothFpm ? '#69f7c4' : '#ffd24d',
                3.2,
              );
            }
          } else {
            // Touched down early on runway during takeoff
            if (!onRwy) {
              triggerCrash('TERRAIN CRASH', 'Off-runway impact before completing the ring course', false);
              events |= EVT_CRASH;
            }
          }
        }
      }
    }

    // Ring intersection & course progression
    if (state.phase === PHASE_COURSE && state.activeRing < state.course.rings.length) {
      const ring = state.course.rings[state.activeRing];
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      const dz = p.z - ring.z;
      const dot = dx * ring.nx + dy * ring.ny + dz * ring.nz;
      const dist = Math.hypot(dx, dy, dz);
      // Radial distance perpendicular to ring normal
      const rx = dx - dot * ring.nx;
      const ry = dy - dot * ring.ny;
      const rz = dz - dot * ring.nz;
      const radial = Math.hypot(rx, ry, rz);

      const crossedPlane = p.prevRingDot <= 0 && dot >= 0 && p.prevRingDot > -90;
      const closePass = Math.abs(dot) < 16 && radial <= RING.radius + 4;

      if ((crossedPlane && radial <= RING.radius + 5.5) || closePass) {
        const bullseye = radial <= RING.bullseyeRadius;
        ring.status = bullseye ? 'bullseye' : 'hit';
        ring.hitFlash = 1;
        state.ringsHit += 1;
        state.streak += 1;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        if (bullseye) state.bullseyes += 1;

        const pts = RING.passPoints + (bullseye ? RING.bullseyeBonus : 0) + (state.streak - 1) * RING.streakStep;
        state.ringScore += pts;
        state.ringTimeBonusSec += RING.timeBonusSec;

        const nSparks = bullseye ? 28 : 18;
        for (let i = 0; i < nSparks; i += 1) {
          const a = (i / nSparks) * Math.PI * 2, spd = 12 + (i % 4) * 5;
          spawnParticle('spark', ring.x + Math.cos(a) * RING.radius * 0.65, ring.y + Math.sin(a) * RING.radius * 0.65, ring.z, Math.cos(a) * spd, Math.sin(a) * spd, (i % 2 === 0 ? 1 : -1) * 8, 0.75 + (i % 3) * 0.18, bullseye ? 6.5 : 5, bullseye ? '#fff08a' : '#7df7d4');
        }

        const sub = `Streak ×${state.streak} · +${RING.timeBonusSec}s Time Bonus · ${ring.label}`;
        showBanner(bullseye ? `BULLSEYE! +${pts}` : `RING CLEARED +${pts}`, sub, bullseye ? '#ffe066' : '#7cf7c9', 1.8);
        events |= bullseye ? EVT_RING | EVT_BULLSEYE : EVT_RING;
        events |= advanceRing(false);
      } else if (dot > RING.skipDistance && dist > RING.skipDistance) {
        events |= EVT_RING_MISS;
        events |= advanceRing(true);
      } else {
        p.prevRingDot = dot;
      }
    }

    // Update PAPI lights & ILS glideslope guidance for Runway 36
    const distToAim = RUNWAY.aimZ - p.z;
    if (distToAim > 10) {
      const angleDeg = Math.atan2(p.y, distToAim) * (180 / Math.PI);
      const ideal = RUNWAY.glideslopeDeg;
      if (angleDeg > ideal + 1.5) state.papiReds = 0;
      else if (angleDeg > ideal + 0.55) state.papiReds = 1;
      else if (angleDeg >= ideal - 0.55) state.papiReds = 2;
      else if (angleDeg >= ideal - 1.5) state.papiReds = 3;
      else state.papiReds = 4;

      state.gsDev = clamp((angleDeg - ideal) / 2.6, -1, 1);
      state.locDev = clamp((p.x - RUNWAY.x) / Math.max(40, distToAim * 0.18), -1, 1);
    } else {
      state.papiReds = 2;
      state.gsDev = 0;
      state.locDev = clamp((p.x - RUNWAY.x) / 30, -1, 1);
    }

    // Keep live score updated
    if (state.phase !== PHASE_COMPLETE) {
      state.totalScore = state.ringScore;
    }

    return events;
  }

  /** Helper returning active navigation target { x, y, z, label, isRunway }. */
  function getNavTarget() {
    if (state.activeRing < state.course.rings.length) {
      const r = state.course.rings[state.activeRing];
      return { x: r.x, y: r.y, z: r.z, label: `R${r.index + 1} ${r.label}`, isRunway: false };
    }
    return { x: RUNWAY.x, y: 2, z: RUNWAY.aimZ, label: 'RWY 36 TDZ', isRunway: true };
  }

  reset();
  return { state, reset, setCourse, step, getNavTarget, stallSpeedOf };
}

export function formatKts(speedMs) {
  return Math.round(speedMs * MS_TO_KTS);
}

export function formatFt(meters) {
  return Math.round(meters * M_TO_FT);
}

export function formatHdg(yawRad) {
  let deg = Math.round(((yawRad * 180) / Math.PI) % 360);
  if (deg <= 0) deg += 360;
  return String(deg).padStart(3, '0');
}
