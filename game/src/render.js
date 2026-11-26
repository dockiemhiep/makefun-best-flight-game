import { RING, RUNWAY, VIEW } from './config.js';
import { projectPolygon, projectWorld, updateCameraBasis } from './camera.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_TITLE,
  drawCockpitPanel,
  drawHud,
  drawPauseOverlay,
  drawSummaryOverlay,
  drawTitleOverlay,
} from './hud.js';
import { PHASE_APPROACH, PHASE_COMPLETE, PHASE_ROLLOUT } from './world.js';

const _polyOut = new Float64Array(128);
const _pA = { x: 0, y: 0, scale: 1, cz: 0 };
const _pB = { x: 0, y: 0, scale: 1, cz: 0 };
const _pC = { x: 0, y: 0, scale: 1, cz: 0 };
const _pD = { x: 0, y: 0, scale: 1, cz: 0 };

function fillPoly(ctx, cam, pts, fillStyle, strokeStyle = null, lineWidth = 1, nearZ = 12) {
  const m = projectPolygon(cam, pts, _polyOut, nearZ);
  if (m < 3) return false;
  ctx.beginPath();
  ctx.moveTo(_polyOut[0], _polyOut[1]);
  for (let i = 1; i < m; i += 1) {
    ctx.lineTo(_polyOut[i * 2], _polyOut[i * 2 + 1]);
  }
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  return true;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const drawList = [];

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth || VIEW.width;
    const cssH = window.innerHeight || VIEW.height;
    const width = Math.round(cssW * ratio);
    const height = Math.round(cssH * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function clientToLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / Math.max(1, rect.width);
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return {
      x: (px - view.x) / view.scale,
      y: (py - view.y) / view.scale,
    };
  }

  function drawSkyAndSea(cam, course, time) {
    const t = course.theme, horY = Math.tan(cam.pitch) * VIEW.focal, span = 1850;
    const sunDelta = ((t.sunAzimuth - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const sunX = Math.tan(sunDelta) * VIEW.focal;
    ctx.save();
    ctx.translate(VIEW.horizonX + cam.shakeX, VIEW.horizonY + cam.shakeY);
    ctx.rotate(-cam.roll);

    const sky = ctx.createLinearGradient(0, horY - 455, 0, horY + 2);
    sky.addColorStop(0, t.skyTop);
    sky.addColorStop(0.47, t.skyMid);
    sky.addColorStop(0.79, t.id === 'morning' ? '#bc889c' : t.skyMid);
    sky.addColorStop(0.94, t.skyHorizon);
    sky.addColorStop(1, t.sunColor);
    ctx.fillStyle = sky;
    ctx.fillRect(-span, horY - span, span * 2, span + 6);

    if (Math.abs(sunDelta) < 1.2) {
      const sunY = horY - Math.tan(t.sunElevation) * VIEW.focal / Math.cos(sunDelta);
      const glow = ctx.createRadialGradient(sunX, sunY, 14, sunX, sunY, 310);
      glow.addColorStop(0, '#fff3c4');
      glow.addColorStop(0.13, 'rgba(255,209,136,0.72)');
      glow.addColorStop(0.46, t.sunHalo);
      glow.addColorStop(1, 'rgba(255,160,96,0)');
      ctx.fillStyle = glow; ctx.fillRect(sunX - 310, sunY - 310, 620, 620);
      ctx.fillStyle = '#fffae1';
      ctx.beginPath(); ctx.arc(sunX, sunY, 25, 0, Math.PI * 2); ctx.fill();
    }

    // Two cirrus bands slide against the horizon at different rates as the camera turns.
    for (let i = 0; i < 20; i += 1) {
      const high = i % 2, drift = cam.yaw / (2 * Math.PI) * (high ? 4800 : 2400);
      const x = ((i * 317 - drift + time * (high ? 1.1 : 0.4)) % 2400 + 2400) % 2400 - 1200;
      const y = horY - (high ? 150 : 43) - (i * 41 % 71);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.08 - (i % 3) * 0.04);
      ctx.scale(1, high ? 0.12 : 0.058);
      const w = 83 + (i * 39 % 105), haze = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      haze.addColorStop(0, high ? 'rgba(255,205,185,0.40)' : 'rgba(255,229,194,0.70)');
      haze.addColorStop(0.55, 'rgba(255,201,173,0.24)');
      haze.addColorStop(1, 'rgba(255,201,173,0)');
      ctx.fillStyle = haze; ctx.fillRect(-w, -w, w * 2, w * 2);
      ctx.restore();
    }

    const sea = ctx.createLinearGradient(0, horY, 0, horY + 385);
    sea.addColorStop(0, t.seaHorizon);
    sea.addColorStop(0.22, t.seaNear);
    sea.addColorStop(1, t.seaDeep);
    ctx.fillStyle = sea; ctx.fillRect(-span, horY - 1, span * 2, span);
    drawWaterLight(cam, horY, sunX, Math.abs(sunDelta) < 1.2, time);

    const ridge = course.horizonRidge;
    const pxPerRad = VIEW.focal;
    for (let layer = 0; layer < 2; layer += 1) {
      ctx.beginPath();
      const firstX = -980;
      ctx.moveTo(firstX, horY + 3);
      for (let sx = firstX; sx <= 980; sx += 28) {
        let ang = (cam.yaw + sx / pxPerRad) % (Math.PI * 2);
        if (ang < 0) ang += Math.PI * 2;
        const fIdx = (ang / (Math.PI * 2)) * ridge.length;
        const i0 = Math.floor(fIdx) % ridge.length;
        const i1 = (i0 + 1) % ridge.length;
        const frac = fIdx - Math.floor(fIdx);
        const h0 = layer === 0 ? ridge[i0].hFar : ridge[i0].hNear;
        const h1 = layer === 0 ? ridge[i1].hFar : ridge[i1].hNear;
        const h = (h0 + (h1 - h0) * frac) * 1.6;
        ctx.lineTo(sx, horY - h + 2);
      }
      ctx.lineTo(980, horY + 3);
      ctx.closePath();
      ctx.fillStyle = layer === 0 ? t.mountainFar : t.mountainNear;
      ctx.globalAlpha = layer === 0 ? 0.56 : 0.72;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const mist = ctx.createLinearGradient(0, horY - 10, 0, horY + 16);
    mist.addColorStop(0, 'transparent');
    mist.addColorStop(0.4, t.haze);
    mist.addColorStop(1, 'transparent');
    ctx.fillStyle = mist; ctx.fillRect(-span, horY - 10, span * 2, 26);
    ctx.restore();
  }

  function drawWaterLight(cam, horY, sunX, sunVisible, time) {
    ctx.beginPath();
    for (let i = 0; i < 190; i += 1) {
      const depth = (i * 73 % 191) / 190;
      const offset = cam.x * depth * 0.07 + cam.yaw / (2 * Math.PI) * 1800;
      const x = ((i * 719 - offset) % 1800 + 1800) % 1800 - 900;
      const y = horY + 7 + depth ** 2 * 465;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2 + depth * (5 + i % 23), y);
    }
    ctx.strokeStyle = 'rgba(186,232,220,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    if (!sunVisible) return;

    ctx.beginPath();
    for (let i = 0; i < 105; i += 1) {
      const depth = (i * 43 % 107) / 106, spread = 36 + depth * 244;
      const x = sunX + ((i * 277 % 109) / 54 - 1) * spread;
      const y = horY + 3 + depth ** 2 * 435 + Math.sin(time * 1.2 + i) * depth * 2;
      const w = 4 + depth * (4 + i % 30);
      ctx.moveTo(x - w, y); ctx.lineTo(x + w, y);
    }
    ctx.strokeStyle = 'rgba(255,194,124,0.27)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,178,0.50)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawGroundWorld(cam, state) {
    const course = state.course;
    const t = course.theme;
    const time = state.time;

    const land = ctx.createLinearGradient(0, 250, 0, 594);
    land.addColorStop(0, t.landFar);
    land.addColorStop(1, t.landBase);
    fillPoly(ctx, cam, course.landPoly, land);
    fillPoly(ctx, cam, course.islandBeach, t.beach);
    fillPoly(ctx, cam, course.islandPoly, land);

    for (const strip of course.beachStrips) fillPoly(ctx, cam, strip, t.beach);
    for (const [a, b, c, d] of course.surfStrips) {
      fillPoly(ctx, cam, [a, b, c, d], 'rgba(116,194,174,0.43)');
      for (let wave = 0; wave < 2; wave += 1) {
        const u = 5 + wave * 13 + 3 * Math.sin(time * 1.7 + a[2] * 0.014 + wave);
        fillPoly(ctx, cam, [[a[0] + u, 0, a[2]], [a[0] + u + 2.2, 0, a[2]],
          [d[0] + u + 3.8, 0, d[2]], [d[0] + u, 0, d[2]]],
        wave === 0 ? t.surf : 'rgba(218,247,227,0.39)');
      }
    }

    for (const f of course.fields) {
      if (fillPoly(ctx, cam, f.poly, f.color, 'rgba(43,65,39,0.64)', 1.2)) drawFurrows(cam, f);
    }
    drawAirfieldVerge(cam);

    for (let i = 0; i < course.riverSegments.length; i += 1) {
      const seg = course.riverSegments[i];
      fillPoly(ctx, cam, seg.bank, t.beach);
      fillPoly(ctx, cam, seg.water, t.riverDeep);
      fillPoly(ctx, cam, seg.highlight, t.riverShallow);
    }

    drawHarborRoads(cam);

    drawRunway36(cam, state);

    const rings = course.rings;
    for (let i = state.activeRing; i < Math.min(rings.length, state.activeRing + 2); i += 1) {
      const r = rings[i];
      const isAct = i === state.activeRing;
      if (projectWorld(cam, r.x, 0.5, r.z, _pA)) {
        const rad = Math.min(48, Math.max(5, _pA.scale * 16));
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(_pA.x, _pA.y, rad, rad * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = isAct ? 'rgba(255, 210, 77, 0.25)' : 'rgba(99, 226, 255, 0.14)';
        ctx.fill();
        ctx.strokeStyle = isAct ? 'rgba(255, 220, 105, 0.65)' : 'rgba(99, 226, 255, 0.3)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        if (isAct && projectWorld(cam, r.x, r.y - RING.radius, r.z, _pB)) {
          const beamG = ctx.createLinearGradient(_pA.x, _pA.y, _pB.x, _pB.y);
          beamG.addColorStop(0, 'rgba(255, 210, 77, 0.28)');
          beamG.addColorStop(1, 'rgba(255, 210, 77, 0.05)');
          ctx.strokeStyle = beamG;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(_pA.x, _pA.y);
          ctx.lineTo(_pB.x, _pB.y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawPlaneShadow(cam, state.plane);
  }

  function drawFurrows(cam, field) {
    const [a, b, c, d] = field.poly;
    const along = field.stripe ? [a, b, d, c] : [a, d, b, c];
    const [p, q, r, s] = along;
    const cropPoint = (start, end, u) => [start[0] + (end[0] - start[0]) * u, 0, start[2] + (end[2] - start[2]) * u];
    const rows = Math.hypot(field.cx - cam.x, field.cz - cam.z) < 900 ? 12 : 6;
    for (let i = 1; i < rows; i += 1) {
      const u = i / rows, v = u + 0.30 / rows;
      fillPoly(ctx, cam, [cropPoint(p, q, u), cropPoint(p, q, v), cropPoint(r, s, v), cropPoint(r, s, u)],
        i % 2 ? 'rgba(44,58,36,0.19)' : 'rgba(255,220,144,0.19)');
    }
  }

  function drawAirfieldVerge(cam) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i += 1) {
        const x = side * (48 + i * 8), z = -310 - i * 4;
        fillPoly(ctx, cam, [[x, 0, z], [x + side * 4, 0, z + 3],
          [x + side * 4, 0, 22], [x, 0, 22]], 'rgba(223,199,122,0.13)');
      }
    }
  }

  function drawHarborRoads(cam) {
    for (const z of [902, 1040]) {
      fillPoly(ctx, cam, [[117, 0, z], [401, 0, z], [401, 0, z + 8], [117, 0, z + 8]], '#bba57f');
    }
    for (const x of [157, 367]) {
      fillPoly(ctx, cam, [[x, 0, 881], [x + 8, 0, 881], [x + 8, 0, 1054], [x, 0, 1054]], '#bba57f');
    }
  }

  function drawRunway36(cam, state) {
    const hw = RUNWAY.width * 0.5;
    const z0 = RUNWAY.zStart;
    const z1 = RUNWAY.zEnd;
    const onApproach = state.phase === PHASE_APPROACH || state.phase === PHASE_ROLLOUT;

    fillPoly(ctx, cam, [[-hw - 10, 0, z0 - 16], [hw + 10, 0, z0 - 16], [hw + 10, 0, z1 + 16], [-hw - 10, 0, z1 + 16]], '#61584f');
    fillPoly(ctx, cam, [[-hw - 55, 0, 110], [-hw, 0, 110], [-hw, 0, 185], [-hw - 55, 0, 185]], '#555261');
    fillPoly(ctx, cam, [[-hw, 0, z0], [hw, 0, z0], [hw, 0, z1], [-hw, 0, z1]], '#41404b');

    fillPoly(ctx, cam, [[-hw + 1.4, 0, z0 + 2], [-hw + 2.8, 0, z0 + 2], [-hw + 2.8, 0, z1 - 2], [-hw + 1.4, 0, z1 - 2]], '#e9eef4');
    fillPoly(ctx, cam, [[hw - 2.8, 0, z0 + 2], [hw - 1.4, 0, z0 + 2], [hw - 1.4, 0, z1 - 2], [hw - 2.8, 0, z1 - 2]], '#e9eef4');

    for (let sx = -16; sx <= 16; sx += 6.4) {
      fillPoly(ctx, cam, [[sx - 1.5, 0, z0 + 6], [sx + 1.5, 0, z0 + 6], [sx + 1.5, 0, z0 + 26], [sx - 1.5, 0, z0 + 26]], '#f9edd3');
    }

    const nZ0 = z0 + 33, nZ1 = z0 + 49, nZm = z0 + 41;
    const strokeSeg = (x0, za, x1, zb) => {
      if (projectWorld(cam, x0, 0.1, za, _pA) && projectWorld(cam, x1, 0.1, zb, _pB)) {
        ctx.strokeStyle = '#edf3f8';
        ctx.lineWidth = Math.max(1.5, Math.min(5, (_pA.scale + _pB.scale) * 0.55));
        ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pB.x, _pB.y); ctx.stroke();
      }
    };
    strokeSeg(-8, nZ1, -2, nZ1); strokeSeg(-2, nZ1, -2, nZ0); strokeSeg(-8, nZm, -2, nZm); strokeSeg(-8, nZ0, -2, nZ0);
    strokeSeg(8, nZ1, 2, nZ1); strokeSeg(2, nZ1, 2, nZ0); strokeSeg(2, nZm, 8, nZm); strokeSeg(8, nZm, 8, nZ0); strokeSeg(2, nZ0, 8, nZ0);

    if (onApproach) {
      const pulse = 0.22 + 0.14 * Math.sin(state.time * 5.2);
      fillPoly(
        ctx, cam,
        [[-hw + 3, 0, RUNWAY.tdzStart], [hw - 3, 0, RUNWAY.tdzStart], [hw - 3, 0, RUNWAY.tdzEnd], [-hw + 3, 0, RUNWAY.tdzEnd]],
        `rgba(74, 245, 165, ${pulse.toFixed(3)})`,
        'rgba(110, 255, 190, 0.85)',
        2,
      );
    }
    fillPoly(ctx, cam, [[-12.5, 0, RUNWAY.aimZ - 14], [-6.5, 0, RUNWAY.aimZ - 14], [-6.5, 0, RUNWAY.aimZ + 14], [-12.5, 0, RUNWAY.aimZ + 14]], '#f0f5fa');
    fillPoly(ctx, cam, [[6.5, 0, RUNWAY.aimZ - 14], [12.5, 0, RUNWAY.aimZ - 14], [12.5, 0, RUNWAY.aimZ + 14], [6.5, 0, RUNWAY.aimZ + 14]], '#f0f5fa');

    for (let z = z0 + 36; z < z1 - 14; z += 36) {
      fillPoly(ctx, cam, [[-0.9, 0, z], [0.9, 0, z], [0.9, 0, z + 18], [-0.9, 0, z + 18]], '#f9edd3');
    }

    const strobeIdx = Math.floor(state.time * 7) % 6;
    for (let i = 0; i < 6; i += 1) {
      const lz = -30 - (5 - i) * 42;
      if (projectWorld(cam, 0, 1.2, lz, _pA)) {
        const bright = i === strobeIdx || onApproach;
        const r = Math.max(2, Math.min(9, _pA.scale * (i === strobeIdx ? 2.6 : 1.5)));
        ctx.fillStyle = i === strobeIdx ? '#ffffff' : bright ? '#ffd87a' : 'rgba(255, 215, 120, 0.5)';
        ctx.beginPath();
        ctx.arc(_pA.x, _pA.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let z = z0; z <= z1; z += 58) {
      for (const side of [-1, 1]) {
        if (projectWorld(cam, side * (hw + 2.5), 1, z, _pA)) {
          const r = Math.max(1.5, Math.min(5.5, _pA.scale * 1.3));
          const col = z === z0 ? '#5cf79e' : z >= z1 - 40 ? '#ff6454' : '#ffeaad';
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(_pA.x, _pA.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // PAPI lights
    for (let i = 0; i < 4; i += 1) {
      const px = RUNWAY.papiX - i * 4.2;
      if (projectWorld(cam, px, 1.8, RUNWAY.papiZ, _pA)) {
        const isRed = i < state.papiReds;
        const r = Math.max(2.6, Math.min(10, _pA.scale * 2.1));
        ctx.save();
        ctx.fillStyle = isRed ? 'rgba(255, 65, 65, 0.32)' : 'rgba(255, 250, 210, 0.32)';
        ctx.beginPath();
        ctx.arc(_pA.x, _pA.y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isRed ? '#ff4242' : '#fffbe0';
        ctx.beginPath();
        ctx.arc(_pA.x, _pA.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawPlaneShadow(cam, p) {
    if (p.y > 220) return;
    const alpha = Math.max(0.06, 0.44 - p.y * 0.0022);
    const shrink = Math.max(0.55, 1 - p.y * 0.003);
    const sy = Math.sin(p.yaw);
    const cy = Math.cos(p.yaw);
    const span = 6.8 * shrink;
    const len = 5.4 * shrink;

    const pts = [
      [p.x + sy * len, 0.1, p.z + cy * len],
      [p.x + cy * span, 0.1, p.z - sy * span],
      [p.x - sy * len, 0.1, p.z - cy * len],
      [p.x - cy * span, 0.1, p.z + sy * span],
    ];
    fillPoly(ctx, cam, pts, `rgba(10, 22, 32, ${alpha.toFixed(3)})`, null, 1, 6);
  }

  function drawAll3DObjects(cam, state) {
    drawList.length = 0;
    const course = state.course;

    for (let i = 0; i < course.clouds.length; i += 1) {
      const c = course.clouds[i];
      if (projectWorld(cam, c.x, c.y, c.z, _pA) && _pA.cz < 3200) {
        drawList.push({ cz: _pA.cz, kind: 'cloud', obj: c, sx: _pA.x, sy: _pA.y, scale: _pA.scale });
      }
    }

    for (let i = 0; i < course.props.length; i += 1) {
      const pr = course.props[i];
      if (projectWorld(cam, pr.x, pr.y, pr.z, _pA) && _pA.cz < 2600) {
        drawList.push({ cz: _pA.cz, kind: 'prop', obj: pr, sx: _pA.x, sy: _pA.y, scale: _pA.scale });
      }
    }

    const rings = course.rings;
    if (state.activeRing < rings.length) {
      const cur = rings[state.activeRing];
      const next = state.activeRing + 1 < rings.length
        ? rings[state.activeRing + 1]
        : { x: RUNWAY.x, y: 12, z: RUNWAY.aimZ };
      for (let k = 1; k <= 4; k += 1) {
        const u = k / 5;
        const gx = cur.x + (next.x - cur.x) * u;
        const gy = cur.y + (next.y - cur.y) * u + Math.sin(u * Math.PI) * 14;
        const gz = cur.z + (next.z - cur.z) * u;
        if (projectWorld(cam, gx, gy, gz, _pA) && _pA.cz < 1900) {
          drawList.push({ cz: _pA.cz, kind: 'guide', u, sx: _pA.x, sy: _pA.y, scale: _pA.scale });
        }
      }
    }

    for (let i = 0; i < rings.length; i += 1) {
      const r = rings[i];
      if (projectWorld(cam, r.x, r.y, r.z, _pA) && _pA.cz < 2400) {
        drawList.push({ cz: _pA.cz, kind: 'ring', obj: r, sx: _pA.x, sy: _pA.y, scale: _pA.scale });
      }
    }

    for (let i = 0; i < state.particles.length; i += 1) {
      const pt = state.particles[i];
      if (!pt.active) continue;
      if (projectWorld(cam, pt.x, pt.y, pt.z, _pA)) {
        drawList.push({ cz: _pA.cz, kind: 'particle', obj: pt, sx: _pA.x, sy: _pA.y, scale: _pA.scale });
      }
    }

    const p = state.plane;
    if (cam.mode === 'chase' && projectWorld(cam, p.x, p.y + 1.5, p.z, _pA)) {
      drawList.push({ cz: _pA.cz, kind: 'plane', sx: _pA.x, sy: _pA.y, scale: _pA.scale });
    }

    // Painter's algorithm: far to near
    drawList.sort((a, b) => b.cz - a.cz);

    drawWingtipTrails(cam, state.trails);

    for (let i = 0; i < drawList.length; i += 1) {
      const item = drawList[i];
      if (item.kind === 'cloud') drawCloud(item, course.theme, cam.roll);
      else if (item.kind === 'prop') drawProp(cam, item, state);
      else if (item.kind === 'guide') drawGuideChevron(item, state.time);
      else if (item.kind === 'ring') drawTargetRing(cam, item.obj, state);
      else if (item.kind === 'particle') drawParticle(item);
      else if (item.kind === 'plane') drawHeroPlane(cam, state.plane, state.time);
    }

    if (cam.mode === 'cockpit') {
      drawCockpitCowling(state.plane);
    }
  }

  const cloudSprites = new WeakMap();

  function drawCloud(item, theme, bank) {
    const c = item.obj, rad = c.size * item.scale;
    if (rad < 3 || rad > 320 || item.sx + rad * 2 < 0 || item.sx - rad * 2 > VIEW.width) return;
    const fade = Math.min(1, (item.cz - 96) / 170, (3300 - item.cz) / 1400);
    if (fade < 0.03) return;

    let sprite = cloudSprites.get(c);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = 400; sprite.height = 104;
      const ink = sprite.getContext('2d');
      const cloud = (x, y, w, h, color, strength) => {
        ink.save();
        ink.translate(x, y); ink.scale(w, h);
        const fog = ink.createRadialGradient(-0.15, -0.25, 0.06, 0, 0, 1);
        fog.addColorStop(0, color); fog.addColorStop(0.45, color);
        fog.addColorStop(1, color + '00');
        ink.fillStyle = fog; ink.globalAlpha = strength;
        ink.fillRect(-1, -1, 2, 2);
        ink.restore();
      };
      cloud(200, 67, 196, 32, theme.cloudShadow, 0.95);
      cloud(203, 60, 189, 23, theme.cloudTop, 0.59);
      for (let i = 0; i < 11; i += 1) {
        const u = i / 10, x = 48 + i * 30;
        const h = 12 + Math.sin(u * Math.PI) * (12 + 10 * Math.sin(i * 1.65 + c.seed));
        const y = 66 - h + Math.sin(i * 2.4 + c.seed) * 6;
        cloud(x, y + 9, 43 - i % 3 * 4, h * 0.96, theme.cloudShadow, 0.47);
        cloud(x, y, 40 - i % 3 * 4, h, theme.cloudTop, 0.77);
      }
      cloudSprites.set(c, sprite);
    }
    ctx.save();
    ctx.translate(item.sx, item.sy);
    ctx.rotate(-bank);
    ctx.globalAlpha = fade * 0.88;
    ctx.drawImage(sprite, -rad * 1.83, -rad * 0.45, rad * 3.66, rad * 0.9);
    ctx.restore();
  }

  function drawProp(cam, item, state) {
    const pr = item.obj;
    const s = item.scale * (pr.scale || 1);
    if (s < 0.05) return;

    if (pr.type === 'bridge') {
      const z0 = pr.z - pr.span * 0.55, z1 = pr.z + pr.span * 0.55, deckH = 16, archH = 38;
      if (projectWorld(cam, pr.x, deckH, z0, _pA) && projectWorld(cam, pr.x, deckH, z1, _pB)) {
        ctx.strokeStyle = '#3e4854'; ctx.lineWidth = Math.max(2.5, item.scale * 7);
        ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pB.x, _pB.y); ctx.stroke();
        for (const pz of [z0 + 18, z1 - 18]) {
          if (projectWorld(cam, pr.x, 0, pz, _pC) && projectWorld(cam, pr.x, deckH, pz, _pD)) {
            ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = Math.max(2, _pC.scale * 5.5);
            ctx.beginPath(); ctx.moveTo(_pC.x, _pC.y); ctx.lineTo(_pD.x, _pD.y); ctx.stroke();
          }
        }
        ctx.strokeStyle = '#c84b3a'; ctx.lineWidth = Math.max(1.8, item.scale * 3.8);
        ctx.beginPath();
        for (let k = 0; k <= 10; k += 1) {
          const u = k / 10;
          if (projectWorld(cam, pr.x, deckH + Math.sin(u * Math.PI) * (archH - deckH), z0 + (z1 - z0) * u, _pC)) {
            if (k === 0) ctx.moveTo(_pC.x, _pC.y); else ctx.lineTo(_pC.x, _pC.y);
          }
        }
        ctx.stroke();
      }
      return;
    }

    // Keep billboards upright in world space.
    ctx.save();
    ctx.translate(item.sx, item.sy);
    ctx.rotate(-cam.roll);
    const shape = (fill, pts) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
    };

    if (pr.type === 'tree') {
      const h = 19 * s, w = 11 * s;
      if (h >= 2) {
        ctx.fillStyle = 'rgba(18, 36, 20, 0.28)';
        ctx.beginPath(); ctx.ellipse(w * 0.2, 0, w * 0.65, w * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a3d28'; ctx.fillRect(-w * 0.12, -h * 0.28, w * 0.24, h * 0.3);
        shape(pr.tint > 0.5 ? '#265c36' : '#2f6b3c', [[0, -h], [-w * 0.58, -h * 0.22], [w * 0.58, -h * 0.22]]);
        shape(pr.tint > 0.5 ? '#3b7e48' : '#468a4d', [[0, -h * 1.05], [-w * 0.44, -h * 0.45], [w * 0.44, -h * 0.45]]);
      }
    } else if (pr.type === 'lighthouse') {
      const h = 66 * s, bw = 13 * s, tw = 7.5 * s;
      ctx.fillStyle = '#6c7275';
      ctx.beginPath(); ctx.ellipse(0, 2 * s, bw * 1.9, bw * 0.65, 0, 0, Math.PI * 2); ctx.fill();
      shape('#f7f4ec', [[-bw, 0], [-tw, -h], [tw, -h], [bw, 0]]);
      for (const f of [0.28, 0.66]) {
        const y0 = -h * f, y1 = -h * (f + 0.18), w0 = bw + (tw - bw) * f, w1 = bw + (tw - bw) * (f + 0.18);
        shape('#d93d32', [[-w0, y0], [-w1, y1], [w1, y1], [w0, y0]]);
      }
      ctx.fillStyle = '#1f2d3d'; ctx.fillRect(-tw * 1.3, -h - 4 * s, tw * 2.6, 4 * s);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(-tw * 0.85, -h - 12 * s, tw * 1.7, 8 * s);
      ctx.fillStyle = '#d93d32'; ctx.beginPath(); ctx.arc(0, -h - 12 * s, tw * 1.05, Math.PI, 0); ctx.fill();
      const beamDir = Math.sin(state.time * 1.4), ly = -h - 8 * s, bLen = 115 * s;
      const bg = ctx.createLinearGradient(0, ly, beamDir * bLen, ly - 12 * s);
      bg.addColorStop(0, 'rgba(255, 240, 155, 0.55)'); bg.addColorStop(1, 'rgba(255, 240, 155, 0)');
      shape(bg, [[0, ly], [beamDir * bLen, ly - 22 * s], [beamDir * bLen, ly + 12 * s]]);
    } else if (pr.type === 'tower') {
      const h = 34 * s, w = 11 * s;
      ctx.fillStyle = '#d9dfe6'; ctx.fillRect(-w * 0.5, -h, w, h);
      ctx.fillStyle = '#c94338'; ctx.fillRect(-w * 0.5, -h * 0.65, w, h * 0.16);
      shape('#264b6e', [[-w * 0.85, -h - 9 * s], [w * 0.85, -h - 9 * s], [w * 0.62, -h], [-w * 0.62, -h]]);
      ctx.fillStyle = '#f9edd3'; ctx.fillRect(-w * 0.95, -h - 11.5 * s, w * 1.9, 2.8 * s);
      ctx.fillStyle = '#5ff5a8'; ctx.beginPath(); ctx.arc(0, -h - 14 * s, Math.max(1.6, 2.2 * s), 0, Math.PI * 2); ctx.fill();
    } else if (pr.type === 'hangar') {
      const w = 34 * s, h = 15 * s;
      ctx.fillStyle = '#e3e8ee'; ctx.fillRect(-w * 0.5, -h, w, h);
      ctx.fillStyle = '#2d445c'; ctx.fillRect(-w * 0.34, -h * 0.72, w * 0.68, h * 0.72);
      ctx.fillStyle = '#4f6d8a'; ctx.beginPath(); ctx.ellipse(0, -h, w * 0.52, h * 0.45, 0, Math.PI, 0); ctx.fill();
    } else if (pr.type === 'windsock') {
      const h = 16 * s, dir = state.course.def.windX >= 0 ? 1 : -1, len = 11 * s;
      const fl = Math.sin(state.time * 7.5) * 1.6 * s;
      ctx.strokeStyle = '#dde5ee'; ctx.lineWidth = Math.max(1.2, 1.8 * s);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
      shape('#ff6b2b', [[0, -h], [dir * len, -h + 2 * s + fl], [dir * len, -h + 4.5 * s + fl], [0, -h + 4.5 * s]]);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(dir * len * 0.32, -h + 0.8 * s, dir * len * 0.28, 3.2 * s);
    } else if (pr.type === 'barn') {
      const w = 22 * s, h = 14 * s;
      ctx.fillStyle = '#b83c2e'; ctx.fillRect(-w * 0.5, -h, w, h);
      shape('#5c2c24', [[-w * 0.6, -h], [0, -h * 1.65], [w * 0.6, -h]]);
      ctx.fillStyle = '#dde3e8'; ctx.fillRect(w * 0.54, -h * 1.45, w * 0.32, h * 1.45);
      ctx.fillStyle = '#8b99a8'; ctx.beginPath(); ctx.arc(w * 0.7, -h * 1.45, w * 0.16, Math.PI, 0); ctx.fill();
    } else if (pr.type === 'turbine') {
      const h = 44 * s, bLen = 17 * s;
      ctx.strokeStyle = '#eef4f8'; ctx.lineWidth = Math.max(1.4, 2.6 * s);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
      ctx.lineWidth = Math.max(1.1, 1.8 * s);
      for (let b = 0; b < 3; b += 1) {
        const a = state.time * 2.1 + pr.phase + (b * Math.PI * 2) / 3;
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(Math.cos(a) * bLen, -h + Math.sin(a) * bLen); ctx.stroke();
      }
    } else if (pr.type === 'cliff') {
      const w = 34 * s, h = 24 * s;
      shape('#756f66', [[-w, 2 * s], [-w * 0.55, -h], [w * 0.35, -h * 0.85], [w, 2 * s]]);
      shape('#5c8549', [[-w * 0.55, -h], [w * 0.35, -h * 0.85], [w * 0.15, -h * 0.55], [-w * 0.4, -h * 0.65]]);
    } else if (pr.type === 'house') {
      const w = 18 * s, h = 11 * s, eave = h * 1.66;
      if (h >= 1.8) {
        shape('rgba(40,38,33,0.23)', [[-w * 0.54, 0], [w * 0.9, 0], [w * 1.4, 3 * s], [-w * 0.18, 3 * s]]);
        ctx.fillStyle = '#eacb9f'; ctx.fillRect(-w * 0.5, -h, w, h);
        shape('#a27762', [[w * 0.5, -h], [w * 0.88, -h - 4 * s], [w * 0.88, -4 * s], [w * 0.5, 0]]);
        shape(pr.roof, [[-w * 0.62, -h], [-w * 0.02, -eave], [w * 0.42, -eave - 4 * s], [w * 0.98, -h - 4 * s], [w * 0.62, -h]]);
        shape('rgba(255,230,183,0.28)', [[-w * 0.62, -h], [-w * 0.02, -eave], [w * 0.62, -h]]);
        ctx.fillStyle = '#514a59'; ctx.fillRect(-w * 0.08, -h * 0.44, w * 0.16, h * 0.44);
        ctx.fillStyle = '#ffebbe';
        ctx.fillRect(-w * 0.36, -h * 0.68, w * 0.2, h * 0.27);
        ctx.fillRect(w * 0.16, -h * 0.68, w * 0.2, h * 0.27);
      }
    } else if (pr.type === 'steeple') {
      const w = 13 * s, h = 28 * s;
      ctx.fillStyle = '#f5f0e4'; ctx.fillRect(-w * 0.5, -h, w, h);
      shape('#3a5472', [[-w * 0.65, -h], [0, -h * 1.65], [w * 0.65, -h]]);
      ctx.fillStyle = '#ffd86b'; ctx.beginPath(); ctx.arc(0, -h * 0.72, Math.max(1.4, w * 0.24), 0, Math.PI * 2); ctx.fill();
    } else if (pr.type === 'mountain') {
      const w = 155 * s, h = 108 * s;
      if (h >= 6) {
        shape('#66627c', [[-w, 2 * s], [-w * 0.62, -h * 0.31], [-w * 0.12, -h], [w * 0.11, -h * 0.9], [w * 0.48, -h * 0.40], [w, 2 * s]]);
        shape('#9d8290', [[-w * 0.12, -h], [w * 0.11, -h * 0.9], [w * 0.48, -h * 0.40], [w, 2 * s], [w * 0.09, 2 * s], [w * 0.23, -h * 0.34]]);
        shape('#d9b59e', [[-w * 0.12, -h], [w * 0.11, -h * 0.9], [w * 0.29, -h * 0.66], [w * 0.02, -h * 0.78], [-w * 0.07, -h * 0.66], [-w * 0.25, -h * 0.74]]);
      }
    } else if (pr.type === 'boat') {
      const bob = Math.sin(state.time * 2.4 + pr.phase) * 1.4 * s, w = 13 * s, h = 18 * s;
      if (h >= 2) {
        ctx.strokeStyle = 'rgba(235, 250, 255, 0.45)'; ctx.lineWidth = Math.max(1, 1.4 * s);
        ctx.beginPath(); ctx.moveTo(-w * 1.1, 2 * s); ctx.lineTo(0, bob); ctx.lineTo(w * 1.1, 2 * s); ctx.stroke();
        shape('#f5f5f2', [[-w * 0.7, -2 * s + bob], [w * 0.7, -2 * s + bob], [w * 0.45, 2 * s + bob], [-w * 0.45, 2 * s + bob]]);
        shape(pr.sailColor, [[0, -h + bob], [w * 0.62, -2.5 * s + bob], [-w * 0.1, -2.5 * s + bob]]);
      }
    }
    ctx.restore();
  }

  function drawGuideChevron(item, time) {
    const r = Math.max(4, Math.min(20, item.scale * 6.5));
    const pulse = 0.56 + 0.28 * Math.sin(time * 5 - item.u * 6);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(item.sx - r, item.sy + r * 0.4);
    ctx.lineTo(item.sx, item.sy - r * 0.55);
    ctx.lineTo(item.sx + r, item.sy + r * 0.4);
    ctx.strokeStyle = 'rgba(10, 20, 34, 0.78)';
    ctx.lineWidth = Math.max(3.6, r * 0.48);
    ctx.stroke();
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = Math.max(1.8, r * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetRing(cam, ring, state) {
    const isActive = ring.status === 'active';
    const isNext = ring.index === state.activeRing + 1;
    const isDone = ring.status === 'hit' || ring.status === 'bullseye';
    const isMissed = ring.status === 'missed';

    const cosY = Math.cos(ring.yaw);
    const sinY = Math.sin(ring.yaw);
    const rx = cosY;
    const rz = -sinY;

    const segs = 48;
    const radius = RING.radius * (1 + ring.hitFlash * 0.35);
    ctx.beginPath();
    let scale = 1;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const wx = ring.x + rx * ca * radius;
      const wy = ring.y + sa * radius;
      const wz = ring.z + rz * ca * radius;
      if (!projectWorld(cam, wx, wy, wz, _pA)) return;
      if (i === 0) {
        ctx.moveTo(_pA.x, _pA.y);
        scale = _pA.scale;
      } else ctx.lineTo(_pA.x, _pA.y);
    }
    ctx.closePath();

    const theme = state.course.theme;
    const baseColor = isActive
      ? theme.ringActive
      : isNext
        ? theme.ringNext
        : isDone
          ? theme.ringDone
          : isMissed
            ? 'rgba(220, 100, 90, 0.35)'
            : 'rgba(200, 232, 255, 0.26)';

    const strokeW = Math.max(2, Math.min(18, scale * (isActive ? 3.2 : isNext ? 2.1 : 1.5)));

    ctx.save();
    if (isDone && ring.hitFlash <= 0) ctx.globalAlpha = 0.25;
    else if (!isActive && !isNext && !isDone) ctx.globalAlpha = 0.32;

    if (isActive || ring.hitFlash > 0) {
      ctx.strokeStyle = ring.hitFlash > 0 ? 'rgba(130, 255, 195, 0.55)' : theme.ringActiveGlow;
      ctx.lineWidth = strokeW * 3.7;
      ctx.shadowColor = theme.ringActive;
      ctx.shadowBlur = isActive ? Math.min(23, strokeW * 2.8) : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = strokeW;
    ctx.stroke();

    if (isActive) {
      ctx.strokeStyle = '#fff9d6';
      ctx.lineWidth = Math.max(1.2, strokeW * 0.35);
      ctx.stroke();

      ctx.beginPath();
      let visible = true;
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2 + state.time * 1.4;
        const u = Math.cos(a) * RING.bullseyeRadius;
        if (!projectWorld(cam, ring.x + rx * u, ring.y + Math.sin(a) * RING.bullseyeRadius, ring.z + rz * u, _pA)) {
          visible = false;
          break;
        }
        if (i === 0) ctx.moveTo(_pA.x, _pA.y); else ctx.lineTo(_pA.x, _pA.y);
      }
      if (visible) {
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 245, 175, 0.52)';
        ctx.lineWidth = Math.max(1, strokeW * 0.28);
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawWingtipTrails(cam, trails) {
    for (let s = 0; s < 2; s += 1) {
      const arr = trails[s];
      if (arr.length < 2) continue;
      for (let i = 1; i < arr.length; i += 1) {
        const a = arr[i - 1];
        const b = arr[i];
        if (projectWorld(cam, a.x, a.y, a.z, _pA) && projectWorld(cam, b.x, b.y, b.z, _pB)) {
          ctx.strokeStyle = `rgba(245, 252, 255, ${(b.life * 0.45).toFixed(3)})`;
          ctx.lineWidth = Math.max(1, Math.min(4.5, _pB.scale * 0.55 * b.life));
          ctx.beginPath();
          ctx.moveTo(_pA.x, _pA.y);
          ctx.lineTo(_pB.x, _pB.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawParticle(item) {
    const pt = item.obj;
    const alpha = Math.max(0, pt.life / pt.maxLife);
    const r = Math.max(1.5, Math.min(28, pt.size * item.scale * (pt.kind === 'smoke' ? 1.4 - alpha * 0.5 : 1)));
    ctx.save();
    ctx.globalAlpha = alpha * 0.52;
    const puff = ctx.createRadialGradient(item.sx, item.sy, 0, item.sx, item.sy, r);
    puff.addColorStop(0, pt.color);
    puff.addColorStop(1, 'rgba(203,179,153,0)');
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(item.sx, item.sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeroPlane(cam, p, time) {
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch), cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const fx = sy * cp, fy = sp, fz = cy * cp;
    const r0x = cy, r0z = -sy, u0x = -sy * sp, u0y = cp, u0z = -cy * sp;
    const rx = r0x * cr - u0x * sr, ry = -u0y * sr, rz = r0z * cr - u0z * sr;
    const ux = u0x * cr + r0x * sr, uy = u0y * cr, uz = u0z * cr + r0z * sr;
    const baseY = p.y + 1.55;
    const toW = (lx, ly, lz) => [p.x + rx * lx + ux * ly + fx * lz, baseY + ry * lx + uy * ly + fy * lz, p.z + rz * lx + uz * ly + fz * lz];
    const poly = (pts, fill, stroke = null, lw = 1) => fillPoly(ctx, cam, pts.map(([lx, ly, lz]) => toW(lx, ly, lz)), fill, stroke, lw, 2);

    if (p.gearAnim > 0.06) {
      const drop = p.gearAnim;
      for (const side of [-1, 1]) {
        const a = toW(side * 1.4, -0.35, 0.5), b = toW(side * (1.4 + 0.7 * drop), -0.35 - 1.25 * drop, 0.5);
        if (projectWorld(cam, a[0], a[1], a[2], _pA) && projectWorld(cam, b[0], b[1], b[2], _pB)) {
          ctx.strokeStyle = '#313a45'; ctx.lineWidth = Math.max(2, _pB.scale * 0.22);
          ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pB.x, _pB.y); ctx.stroke();
          ctx.fillStyle = '#1b2028'; ctx.beginPath(); ctx.ellipse(_pB.x, _pB.y, Math.max(2.5, _pB.scale * 0.34), Math.max(3.5, _pB.scale * 0.48), -p.roll * 0.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      const nA = toW(0, -0.45, 3.3), nB = toW(0, -0.45 - 1.1 * drop, 3.3);
      if (projectWorld(cam, nA[0], nA[1], nA[2], _pA) && projectWorld(cam, nB[0], nB[1], nB[2], _pB)) {
        ctx.strokeStyle = '#313a45'; ctx.lineWidth = Math.max(1.8, _pB.scale * 0.2);
        ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pB.x, _pB.y); ctx.stroke();
        ctx.fillStyle = '#1b2028'; ctx.beginPath(); ctx.arc(_pB.x, _pB.y, Math.max(2.2, _pB.scale * 0.34), 0, Math.PI * 2); ctx.fill();
      }
    }

    const propC = toW(0, 0.05, 5.15);
    if (projectWorld(cam, propC[0], propC[1], propC[2], _pA)) {
      const pr = Math.max(5, _pA.scale * 1.45);
      ctx.save();
      ctx.fillStyle = `rgba(235, 244, 255, ${(0.12 + p.rpm * 0.22).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(_pA.x, _pA.y, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(38, 46, 58, ${(0.65 - p.rpm * 0.35).toFixed(3)})`; ctx.lineWidth = Math.max(1.8, pr * 0.16);
      for (let b = 0; b < 2; b += 1) {
        const a = p.propAngle + b * Math.PI;
        ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pA.x + Math.cos(a) * pr * 0.95, _pA.y + Math.sin(a) * pr * 0.95); ctx.stroke();
      }
      ctx.fillStyle = '#b22f37'; ctx.beginPath(); ctx.arc(_pA.x, _pA.y, Math.max(2.4, pr * 0.24), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const flapDrop = -p.flapAnim * 0.55, ailL = p.aileron * 0.28, ailR = -p.aileron * 0.28;
    for (const side of [-1, 1]) {
      const a = toW(side * 0.75, -0.35, 0.75), b = toW(side * 3.8, 0.34, 0.75);
      if (projectWorld(cam, a[0], a[1], a[2], _pA) && projectWorld(cam, b[0], b[1], b[2], _pB)) {
        ctx.strokeStyle = '#737b85'; ctx.lineWidth = Math.max(1.4, _pB.scale * 0.14);
        ctx.beginPath(); ctx.moveTo(_pA.x, _pA.y); ctx.lineTo(_pB.x, _pB.y); ctx.stroke();
      }
    }
    poly([[-0.8, 0.22, 1.85], [-6.8, 0.48, 0.95], [-6.8, 0.44, -0.35], [-0.8, 0.18, -0.55]], '#f5dfb8', '#c7c2b6');
    poly([[0.8, 0.22, 1.85], [6.8, 0.48, 0.95], [6.8, 0.44, -0.35], [0.8, 0.18, -0.55]], '#f5dfb8', '#c7c2b6');
    poly([[-5.4, 0.42, 1.15], [-6.95, 0.5, 0.92], [-6.95, 0.46, -0.35], [-5.4, 0.38, -0.4]], '#b22f37');
    poly([[5.4, 0.42, 1.15], [6.95, 0.5, 0.92], [6.95, 0.46, -0.35], [5.4, 0.38, -0.4]], '#b22f37');
    poly([[-0.9, 0.16, -0.52], [-3.2, 0.28, -0.45], [-3.2, 0.28 + flapDrop, -1.05], [-0.9, 0.16 + flapDrop, -1.1]], '#d8d2c5', '#8f897e');
    poly([[0.9, 0.16, -0.52], [3.2, 0.28, -0.45], [3.2, 0.28 + flapDrop, -1.05], [0.9, 0.16 + flapDrop, -1.1]], '#d8d2c5', '#8f897e');
    poly([[-3.4, 0.29, -0.44], [-5.35, 0.38, -0.39], [-5.35, 0.38 + ailL, -0.82], [-3.4, 0.29 + ailL, -0.88]], '#e4dfd2', '#9d978b', 0.9);
    poly([[3.4, 0.29, -0.44], [5.35, 0.38, -0.39], [5.35, 0.38 + ailR, -0.82], [3.4, 0.29 + ailR, -0.88]], '#e4dfd2', '#9d978b', 0.9);

    poly([[-0.72, -0.5, 3.6], [0.72, -0.5, 3.6], [0.5, -0.35, -3.9], [-0.5, -0.35, -3.9]], '#c9c4b8');
    poly([[-0.82, 0.28, 3.4], [-0.86, -0.45, 3.4], [-0.46, -0.32, -4.1], [-0.4, 0.24, -4.1]], '#e9e5db');
    poly([[0.82, 0.28, 3.4], [0.86, -0.45, 3.4], [0.46, -0.32, -4.1], [0.4, 0.24, -4.1]], '#e9e5db');
    poly([[-0.78, 0.34, 3.5], [0.78, 0.34, 3.5], [0.36, 0.32, -4.15], [-0.36, 0.32, -4.15]], '#ffedd0');
    poly([[-0.64, 0.26, 4.9], [0.64, 0.26, 4.9], [0.78, 0.34, 3.4], [-0.78, 0.34, 3.4]], '#b22f37');
    poly([[-0.22, 0.36, 3.5], [0.22, 0.36, 3.5], [0.12, 0.34, -4.0], [-0.12, 0.34, -4.0]], '#b22f37');
    poly([[-0.62, 0.36, 1.9], [0.62, 0.36, 1.9], [0.54, 1.05, 0.55], [-0.54, 1.05, 0.55]], '#1e3e63', '#e4af85');
    poly([[-0.54, 1.05, 0.55], [0.54, 1.05, 0.55], [0.38, 0.42, -1.6], [-0.38, 0.42, -1.6]], '#1a3554', '#6ea4cf');
    poly([[-0.28, 0.98, 0.6], [0.08, 0.98, 0.6], [0.02, 0.54, -1.2], [-0.22, 0.54, -1.2]], 'rgba(180, 228, 255, 0.34)');

    const elevDrop = -p.elevator * 0.35, rudShift = p.rudder * 0.32;
    poly([[-0.32, 0.28, -3.45], [-2.55, 0.32, -3.75], [-2.55, 0.32, -4.45], [-0.32, 0.28, -4.35]], '#f4f0e6', '#bfb9ac');
    poly([[0.32, 0.28, -3.45], [2.55, 0.32, -3.75], [2.55, 0.32, -4.45], [0.32, 0.28, -4.35]], '#f4f0e6', '#bfb9ac');
    poly([[-2.45, 0.32, -4.42], [2.45, 0.32, -4.42], [2.35, 0.32 + elevDrop, -4.95], [-2.35, 0.32 + elevDrop, -4.95]], '#b22f37', '#b83526', 0.9);
    poly([[0.82, 0.10, 3.2], [0.86, -0.01, 3.2], [0.47, -0.06, -4.0], [0.43, 0.06, -4.0]], '#a73439');
    poly([[0, 0.3, -2.65], [0, 2.25, -4.1], [0, 2.25, -4.62], [0, 0.3, -4.45]], '#faf7ef', '#bfb9ac');
    poly([[0, 0.32, -4.45], [0, 2.22, -4.62], [rudShift, 2.1, -5.12], [rudShift, 0.35, -4.95]], '#b22f37', '#b33223');

    const strobe = Math.sin(time * 11) > 0.82;
    for (const [lx, col] of [[-6.95, '#ff4747'], [6.95, '#47ff88']]) {
      const wp = toW(lx, 0.48, 0.5);
      if (projectWorld(cam, wp[0], wp[1], wp[2], _pA)) {
        ctx.fillStyle = strobe ? '#ffffff' : col;
        ctx.beginPath(); ctx.arc(_pA.x, _pA.y, Math.max(2, _pA.scale * (strobe ? 0.32 : 0.22)), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawCockpitCowling() {
    const base = VIEW.height - VIEW.panelHeight;
    ctx.save();
    const g = ctx.createRadialGradient(VIEW.horizonX, base + 20, 40, VIEW.horizonX, base + 20, 220);
    g.addColorStop(0, 'rgba(235, 245, 255, 0.16)'); g.addColorStop(0.7, 'rgba(235, 245, 255, 0.05)'); g.addColorStop(1, 'rgba(235, 245, 255, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(VIEW.horizonX, base + 20, 220, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ebe6db';
    ctx.beginPath(); ctx.moveTo(VIEW.horizonX - 240, base); ctx.quadraticCurveTo(VIEW.horizonX, base - 76, VIEW.horizonX + 240, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b22f37';
    ctx.beginPath(); ctx.moveTo(VIEW.horizonX - 38, base); ctx.quadraticCurveTo(VIEW.horizonX, base - 72, VIEW.horizonX + 38, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(22, 31, 45, 0.72)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(0, 140); ctx.lineTo(145, 0); ctx.moveTo(VIEW.width, 140); ctx.lineTo(VIEW.width - 145, 0); ctx.stroke();
    ctx.restore();
  }

  function drawTitleShade() {
    const shade = ctx.createRadialGradient(97, 283, 150, 125, 317, 715);
    shade.addColorStop(0, 'rgba(16,23,41,0.76)');
    shade.addColorStop(0.57, 'rgba(16,23,41,0.46)');
    shade.addColorStop(1, 'rgba(16,23,41,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height - VIEW.panelHeight);
  }

  function composeShot(cam, state, screen, shot) {
    if (cam.mode !== 'chase') return cam;
    const p = state.plane;
    if (shot === 'chase' || shot === 'play') {
      const ring = state.course.rings[state.activeRing];
      if (!ring) return cam;
      const x = cam.x + Math.sin(p.yaw) * 7 + Math.cos(p.yaw) * 2;
      const z = cam.z + Math.cos(p.yaw) * 7 - Math.sin(p.yaw) * 2;
      cam = { ...cam, x, z, y: cam.y + 0.6, yaw: Math.atan2(ring.x - x, ring.z - z), pitch: -0.010, roll: cam.roll * 0.83 };
    } else if (screen === SCREEN_TITLE) {
      cam = { ...cam, yaw: cam.yaw - 0.27, pitch: cam.pitch + 0.085 };
    } else if (shot === 'approach') {
      cam = { ...cam, x: cam.x + 1.8, yaw: cam.yaw + 0.026, pitch: cam.pitch + 0.025 };
    } else if (screen === SCREEN_OVER && state.phase === PHASE_COMPLETE && !state.offField) {
      cam = { ...cam, yaw: cam.yaw - 0.39, pitch: cam.pitch + 0.06 };
    } else {
      return cam;
    }
    updateCameraBasis(cam);
    return cam;
  }

  function draw(state, cam, screen, options) {
    cam = composeShot(cam, state, screen, options.shot);
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#09101a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.beginPath(); ctx.rect(0, 0, VIEW.width, VIEW.height); ctx.clip();

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, VIEW.width, VIEW.height - VIEW.panelHeight); ctx.clip();
    drawSkyAndSea(cam, state.course, state.time);
    drawGroundWorld(cam, state);
    drawAll3DObjects(cam, state);
    if (screen === SCREEN_TITLE) drawTitleShade();
    ctx.restore();

    drawHud(ctx, state, cam, { screen, stallSpeed: options.stallSpeed });
    drawCockpitPanel(ctx, state, { ...options, screen });
    if (screen === SCREEN_TITLE) drawTitleOverlay(ctx, state, options.bestScores);
    else if (screen === SCREEN_PAUSED) drawPauseOverlay(ctx, options);
    else if (screen === SCREEN_OVER) drawSummaryOverlay(ctx, state, options.bestScore, options.isNewRecord);
    ctx.restore();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, clientToLogical };
}
