import { COURSE_DEFS, coastX, riverCenterZ } from './courses.js';
import { FLIGHT, FONT, M_TO_FT, MONO, MS_TO_FPM, MS_TO_KTS, RUNWAY, VIEW } from './config.js';
import {
  PHASE_APPROACH, PHASE_COMPLETE, PHASE_CRASHED, PHASE_ROLLOUT, PHASE_TAKEOFF,
  angleDiff, formatFt, formatHdg, formatKts,
} from './world.js';
import { projectWorld } from './camera.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function pill(ctx, x, y, w, h, r, fill, stroke, lw = 1.2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function fmtClock(sec) {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const mins = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  const frac = tenths % 10;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${frac}`;
}

export function drawHud(ctx, state, cam, options) {
  const p = state.plane;
  const theme = state.course.theme;
  const kts = formatKts(p.speed);
  const altFt = formatFt(p.y);
  const vSpeedFpm = Math.round(p.vy * MS_TO_FPM);
  const hdgDeg = ((p.yaw * 180) / Math.PI + 360) % 360;
  const target = state.activeRing < state.course.rings.length
    ? state.course.rings[state.activeRing]
    : { x: RUNWAY.x, y: 2, z: RUNWAY.aimZ, label: 'RWY 36 TDZ' };

  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const targetDist = Math.hypot(dx, target.y - p.y, dz);
  const targetBear = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  const targetRelRad = angleDiff(Math.atan2(dx, dz), p.yaw);

  if (options.screen !== SCREEN_TITLE) {
    if (cam.mode === 'cockpit') {
      ctx.save();
      ctx.beginPath(); ctx.rect(VIEW.horizonX - 175, 92, 350, VIEW.height - VIEW.panelHeight - 122); ctx.clip();
      ctx.translate(VIEW.horizonX, VIEW.horizonY); ctx.rotate(-p.roll * 0.85);
      const pitchDeg = (p.pitch * 180) / Math.PI;
      ctx.lineWidth = 1.6; ctx.font = `700 10px ${MONO}`; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(6, 14, 24, 0.85)'; ctx.shadowBlur = 4;
      ctx.strokeStyle = theme.hud; ctx.fillStyle = theme.hud;
      for (let deg = -20; deg <= 20; deg += 10) {
        const y = (pitchDeg - deg) * 6.0;
        if (Math.abs(y) > 140) continue;
        const w = deg === 0 ? 110 : deg > 0 ? 52 : 44;
        ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(-24, y); ctx.moveTo(24, y); ctx.lineTo(w, y); ctx.stroke();
        if (deg !== 0) { ctx.textAlign = 'right'; ctx.fillText(String(deg), -w - 5, y); ctx.textAlign = 'left'; ctx.fillText(String(deg), w + 5, y); }
      }
      ctx.restore();
    }

    if (state.phase === PHASE_APPROACH && !p.onGround) {
      drawIlsGuidance(ctx, state, theme);
      drawLandingChecklist(ctx, state);
    }
  }

  drawHeadingTape(ctx, hdgDeg, targetBear, theme, state.course.def.windLabel);
  drawSpeedTape(ctx, kts, p.speed * MS_TO_KTS, Math.round(options.stallSpeed * MS_TO_KTS), Math.round(FLIGHT.rotateSpeed * MS_TO_KTS), p.gLoad, theme, state.stallWarn);
  drawAltTape(ctx, altFt, p.y * M_TO_FT, vSpeedFpm, theme);
  drawMissionCard(ctx, state, options.screen);
  drawCourseRadar(ctx, state);

  if (options.screen === SCREEN_PLAY && state.phase !== PHASE_COMPLETE && state.phase !== PHASE_CRASHED && state.phase !== PHASE_ROLLOUT) {
    drawTargetIndicator(ctx, state, cam, target, targetDist, targetRelRad, theme);
  }

  if (options.screen === SCREEN_PLAY && state.bannerTimer > 0 && state.bannerText) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.bannerTimer * 3.0);
    const bw = 432, bx = VIEW.horizonX - bw / 2;
    pill(ctx, bx, 86, bw, 52, 10, 'rgba(9, 17, 29, 0.92)', state.bannerColor, 1.8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 17px ${FONT}`; ctx.fillStyle = state.bannerColor;
    ctx.fillText(state.bannerText, VIEW.horizonX, 105);
    if (state.bannerSub) {
      ctx.font = `600 12px ${FONT}`; ctx.fillStyle = '#eef7ff';
      ctx.fillText(state.bannerSub, VIEW.horizonX, 124);
    }
    ctx.restore();
  }

  if (options.screen === SCREEN_PLAY && (state.stallWarn || state.gearWarn)) {
    ctx.save();
    ctx.globalAlpha = 0.58 + 0.42 * Math.sin(state.time * 14);
    const msg = state.gearWarn ? 'LANDING GEAR — PRESS [G]' : 'STALL WARNING — ADD THROTTLE [W]';
    pill(ctx, VIEW.horizonX - 155, 146, 310, 28, 6, 'rgba(185, 28, 28, 0.9)', '#ff9d9d', 1.5);
    ctx.font = `700 12.5px ${MONO}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, VIEW.horizonX, 160);
    ctx.restore();
  }
}

function drawIlsGuidance(ctx, state, theme) {
  const cx = VIEW.horizonX, cy = VIEW.horizonY, gx = cx + 158, ly = 132;
  ctx.save();
  pill(ctx, gx - 14, cy - 66, 28, 132, 8, 'rgba(10, 18, 30, 0.72)', 'rgba(124, 247, 201, 0.3)', 1);
  ctx.strokeStyle = 'rgba(124, 247, 201, 0.65)'; ctx.lineWidth = 1.3;
  for (let i = -2; i <= 2; i += 1) {
    const yy = cy + i * 24;
    if (i === 0) { ctx.beginPath(); ctx.moveTo(gx - 8, yy); ctx.lineTo(gx + 8, yy); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(gx, yy, 3, 0, Math.PI * 2); ctx.stroke(); }
  }
  const gsY = cy + state.gsDev * 48;
  ctx.fillStyle = Math.abs(state.gsDev) < 0.35 ? '#69f7c4' : '#ffd24d';
  ctx.beginPath(); ctx.moveTo(gx, gsY - 6); ctx.lineTo(gx + 6, gsY); ctx.lineTo(gx, gsY + 6); ctx.lineTo(gx - 6, gsY); ctx.closePath(); ctx.fill();

  pill(ctx, cx - 86, ly - 13, 172, 26, 8, 'rgba(10, 18, 30, 0.56)', 'rgba(124, 247, 201, 0.32)', 1);
  for (let i = -2; i <= 2; i += 1) {
    const xx = cx + i * 28;
    if (i === 0) { ctx.beginPath(); ctx.moveTo(xx, ly - 7); ctx.lineTo(xx, ly + 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(xx, ly, 3, 0, Math.PI * 2); ctx.stroke(); }
  }
  const locX = cx - state.locDev * 56;
  ctx.fillStyle = Math.abs(state.locDev) < 0.3 ? '#69f7c4' : '#ffd24d';
  ctx.beginPath(); ctx.moveTo(locX, ly - 6); ctx.lineTo(locX + 6, ly); ctx.lineTo(locX, ly + 6); ctx.lineTo(locX - 6, ly); ctx.closePath(); ctx.fill();

  pill(ctx, cx - 72, ly - 31, 144, 15, 4, 'rgba(10, 18, 30, 0.72)', null);
  ctx.font = `700 9.5px ${MONO}`; ctx.fillStyle = theme.hud; ctx.textAlign = 'center';
  ctx.fillText('ILS RWY 36 · LOC / GS', cx, ly - 21);
  ctx.restore();
}

function drawLandingChecklist(ctx, state) {
  const p = state.plane, kts = formatKts(p.speed), x = 128, y = 176;
  const items = [['GEAR DOWN [G]', p.gearDown && p.gearAnim > 0.9], ['FLAPS 15°/30° [F]', p.flaps >= 1], ['SPEED < 62 KTS', kts < 62], ['ON GLIDESLOPE', state.papiReds === 2]];
  ctx.save();
  pill(ctx, x, y, 178, 118, 8, 'rgba(10, 18, 30, 0.78)', 'rgba(105, 247, 196, 0.45)', 1.2);
  ctx.font = `700 10px ${MONO}`; ctx.fillStyle = '#ffd24d'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('LANDING CHECKLIST', x + 12, y + 16);
  items.forEach(([lbl, ok], i) => {
    const ry = y + 38 + i * 21;
    ctx.font = `700 10.5px ${MONO}`; ctx.fillStyle = ok ? '#69f7c4' : '#ffd24d'; ctx.fillText(ok ? '✓' : '○', x + 12, ry);
    ctx.fillStyle = ok ? '#e2f7ee' : '#bfd6e8'; ctx.fillText(lbl, x + 28, ry);
  });
  ctx.restore();
}

function drawHeadingTape(ctx, hdgDeg, targetBear, theme, windLabel) {
  const w = 360, h = 42, x = VIEW.horizonX - w / 2, y = 14;
  ctx.save();
  pill(ctx, x, y, w, h, 8, 'rgba(16, 26, 40, 0.88)', 'rgba(124, 247, 201, 0.4)', 1.2);
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 8, y + 2, w - 16, h - 4); ctx.clip();
  const pxPerDeg = 3.2, card = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  ctx.strokeStyle = 'rgba(205, 238, 255, 0.65)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let d = Math.floor((hdgDeg - 58) / 5) * 5; d <= Math.ceil((hdgDeg + 58) / 5) * 5; d += 5) {
    const sx = VIEW.horizonX + (d - hdgDeg) * pxPerDeg, norm = ((d % 360) + 360) % 360, maj = norm % 15 === 0;
    ctx.beginPath(); ctx.moveTo(sx, y + h - 4); ctx.lineTo(sx, y + h - (maj ? 14 : 9)); ctx.stroke();
    if (norm in card) { ctx.font = `700 12px ${MONO}`; ctx.fillStyle = norm === 0 ? '#ffd24d' : theme.hud; ctx.fillText(card[norm], sx, y + 6); }
    else if (norm % 30 === 0) { ctx.font = `600 11px ${MONO}`; ctx.fillStyle = '#d4e8f7'; ctx.fillText(String(norm).padStart(3, '0'), sx, y + 7); }
  }
  const bugX = VIEW.horizonX + Math.max(-52, Math.min(52, ((targetBear - hdgDeg + 540) % 360) - 180)) * pxPerDeg;
  ctx.fillStyle = '#ffd24d'; ctx.beginPath(); ctx.moveTo(bugX, y + h - 2); ctx.lineTo(bugX - 6, y + h - 11); ctx.lineTo(bugX + 6, y + h - 11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(VIEW.horizonX, y + 7); ctx.lineTo(VIEW.horizonX - 5, y + 1); ctx.lineTo(VIEW.horizonX + 5, y + 1); ctx.closePath(); ctx.fill();
  ctx.restore();

  pill(ctx, VIEW.horizonX - 34, y + h - 2, 68, 22, 5, '#0c1624', theme.hud, 1.4);
  ctx.font = `700 13px ${MONO}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${formatHdg((hdgDeg * Math.PI) / 180)}°`, VIEW.horizonX, y + h + 9);
  pill(ctx, VIEW.horizonX + 42, y + h, 102, 19, 5, 'rgba(10, 18, 30, 0.72)', 'rgba(165, 214, 240, 0.28)', 1);
  ctx.font = `600 10px ${MONO}`; ctx.fillStyle = '#d8eefc';
  ctx.fillText(`WIND ${windLabel}`, VIEW.horizonX + 93, y + h + 9.5);
  ctx.restore();
}

function drawSpeedTape(ctx, ktsInt, ktsFloat, stallKts, vrKts, gLoad, theme, stallWarn) {
  const x = 22, y = 176, w = 78, h = 236, cy = y + h / 2, pxPerKt = 3.1;
  ctx.save();
  pill(ctx, x, y - 22, w, 18, 5, 'rgba(10, 18, 30, 0.78)', 'rgba(124, 247, 201, 0.34)', 1);
  ctx.font = `700 10px ${MONO}`; ctx.fillStyle = theme.hud; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SPD KTS', x + w / 2, y - 13);

  pill(ctx, x, y, w, h, 8, 'rgba(12, 22, 34, 0.83)', stallWarn ? '#ff6b6b' : 'rgba(175, 224, 204, 0.52)', 1.2);
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 2, y + 4, w - 4, h - 8); ctx.clip();
  const stallY = cy - (stallKts - ktsFloat) * pxPerKt;
  const zeroY = cy + ktsFloat * pxPerKt;
  const stallH = Math.max(0, zeroY - stallY);
  ctx.fillStyle = 'rgba(235, 64, 64, 0.38)';
  ctx.fillRect(x + w - 8, stallY, 6, stallH);
  const vrY = cy - (vrKts - ktsFloat) * pxPerKt;
  if (vrY > y && vrY < y + h) { ctx.fillStyle = '#ffd24d'; ctx.fillRect(x + w - 12, vrY - 1.5, 10, 3); }

  ctx.strokeStyle = 'rgba(205, 238, 255, 0.6)'; ctx.fillStyle = '#d4e9f7';
  ctx.font = `600 11px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = Math.max(0, Math.floor((ktsFloat - 42) / 10) * 10); k <= Math.ceil((ktsFloat + 42) / 10) * 10; k += 5) {
    const sy = cy - (k - ktsFloat) * pxPerKt;
    const maj = k % 10 === 0;
    ctx.beginPath(); ctx.moveTo(x + w - 4, sy); ctx.lineTo(x + w - (maj ? 14 : 9), sy); ctx.stroke();
    if (maj) ctx.fillText(String(k), x + w - 18, sy);
  }
  ctx.restore();

  pill(ctx, x - 2, cy - 15, w + 12, 30, 5, '#0c1624', stallWarn ? '#ff6b6b' : theme.hud, 1.6);
  ctx.font = `700 17px ${MONO}`; ctx.fillStyle = stallWarn ? '#ff8b8b' : '#ffffff'; ctx.textAlign = 'center';
  ctx.fillText(String(ktsInt).padStart(3, ' '), x + w / 2 + 2, cy);

  pill(ctx, x + 8, y + h + 6, w - 16, 18, 5, 'rgba(10, 18, 30, 0.76)', 'rgba(165, 214, 240, 0.28)', 1);
  ctx.font = `700 10px ${MONO}`; ctx.fillStyle = '#d6ecff';
  ctx.fillText(`${gLoad.toFixed(1)}G`, x + w / 2, y + h + 15);
  ctx.restore();
}

function drawAltTape(ctx, altInt, altFloat, vSpeedFpm, theme) {
  const w = 82, h = 236, x = VIEW.width - w - 22, y = 176, cy = y + h / 2, pxPerFt = 0.5;
  ctx.save();
  pill(ctx, x, y - 22, w, 18, 5, 'rgba(10, 18, 30, 0.78)', 'rgba(124, 247, 201, 0.34)', 1);
  ctx.font = `700 10px ${MONO}`; ctx.fillStyle = theme.hud; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ALT FT', x + w / 2, y - 13);

  pill(ctx, x, y, w, h, 8, 'rgba(12, 22, 34, 0.83)', 'rgba(175, 224, 204, 0.52)', 1.2);
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 2, y + 4, w - 4, h - 8); ctx.clip();
  const gndY = cy + altFloat * pxPerFt;
  if (gndY < y + h + 10) { ctx.fillStyle = 'rgba(218, 152, 74, 0.38)'; ctx.fillRect(x + 2, gndY, 10, y + h - gndY + 40); }

  ctx.strokeStyle = 'rgba(205, 238, 255, 0.6)'; ctx.fillStyle = '#d4e9f7';
  ctx.font = `600 11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let a = Math.max(0, Math.floor((altFloat - 260) / 50) * 50); a <= Math.ceil((altFloat + 260) / 50) * 50; a += 50) {
    const sy = cy - (a - altFloat) * pxPerFt;
    const maj = a % 100 === 0;
    ctx.beginPath(); ctx.moveTo(x + 4, sy); ctx.lineTo(x + (maj ? 14 : 9), sy); ctx.stroke();
    if (maj) ctx.fillText(String(a), x + 18, sy);
  }
  ctx.restore();

  pill(ctx, x - 10, cy - 15, w + 12, 30, 5, '#0c1624', theme.hud, 1.6);
  ctx.font = `700 16px ${MONO}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.fillText(String(Math.max(0, altInt)), x + w / 2 - 4, cy);

  const sign = vSpeedFpm >= 0 ? '+' : '';
  pill(ctx, x - 4, y + h + 6, w + 8, 18, 5, 'rgba(10, 18, 30, 0.78)', 'rgba(165, 214, 240, 0.28)', 1);
  ctx.font = `700 10.5px ${MONO}`; ctx.fillStyle = vSpeedFpm < -420 ? '#ff8b6b' : theme.hud;
  ctx.fillText(`${sign}${vSpeedFpm} FPM`, x + w / 2, y + h + 15);
  ctx.restore();
}

function drawMissionCard(ctx, state, screen) {
  const x = 20, y = 14, w = 256, h = 90;
  const totalRings = state.course.rings.length;
  ctx.save();
  pill(ctx, x, y, w, h, 10, 'rgba(16, 26, 40, 0.88)', 'rgba(175, 224, 204, 0.52)', 1.2);

  ctx.font = `700 12px ${FONT}`; ctx.fillStyle = '#ffd24d'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(state.course.def.name, x + 14, y + 11);
  ctx.font = `700 13px ${MONO}`; ctx.fillStyle = '#e4f4ff'; ctx.textAlign = 'right';
  ctx.fillText(fmtClock(state.flightTime), x + w - 14, y + 10);

  ctx.font = `700 22px ${MONO}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
  ctx.fillText(String(state.totalScore).padStart(5, '0'), x + 14, y + 30);

  ctx.font = `700 12px ${MONO}`; ctx.textAlign = 'right';
  if (screen === SCREEN_TITLE) {
    ctx.fillStyle = '#9ec6e4';
    ctx.fillText('LIVE DEMO', x + w - 14, y + 35);
  } else if (state.streak >= 2) {
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`STREAK ×${state.streak}`, x + w - 14, y + 35);
  } else {
    ctx.fillStyle = '#9ec6e4';
    const lbl = state.phase === PHASE_TAKEOFF ? 'TAKEOFF'
      : state.phase === PHASE_APPROACH ? 'FINAL APP' : state.phase === PHASE_ROLLOUT ? 'ROLLOUT'
      : `RINGS ${state.ringsHit}/${totalRings}`;
    ctx.fillText(lbl, x + w - 14, y + 35);
  }

  const pipGap = 4;
  const pipW = (w - 28 - (totalRings - 1) * pipGap) / totalRings;
  for (let i = 0; i < totalRings; i += 1) {
    const r = state.course.rings[i];
    const col = r.status === 'bullseye' ? '#ffe066' : r.status === 'hit' ? '#69f7c4'
      : r.status === 'missed' ? '#e06458' : r.status === 'active' ? '#ffffff' : 'rgba(170, 204, 230, 0.25)';
    pill(ctx, x + 14 + i * (pipW + pipGap), y + 64, pipW, 9, 3, col, null);
  }
  ctx.restore();
}

function drawCourseRadar(ctx, state) {
  const rad = 58, cx = VIEW.width - rad - 22, cy = 14 + rad, p = state.plane;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(9, 20, 34, 0.8)'; ctx.fill();
  ctx.strokeStyle = 'rgba(124, 247, 201, 0.48)'; ctx.lineWidth = 1.6; ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rad - 2, 0, Math.PI * 2); ctx.clip();
  const s = 0.036, ox = 110, oz = 320;
  const rx = (wx) => cx + (wx - ox) * s;
  const ry = (wz) => cy - (wz - oz) * s;

  ctx.fillStyle = '#123d5c';
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);

  ctx.beginPath();
  for (let z = -1400; z <= 2100; z += 140) {
    if (z === -1400) ctx.moveTo(rx(coastX(z)), ry(z));
    else ctx.lineTo(rx(coastX(z)), ry(z));
  }
  ctx.lineTo(cx - rad - 10, cy - rad - 10);
  ctx.lineTo(cx - rad - 10, cy + rad + 10);
  ctx.closePath();
  ctx.fillStyle = '#29573b'; ctx.fill();

  ctx.beginPath();
  for (let x = -1500; x <= 520; x += 120) {
    if (x === -1500) ctx.moveTo(rx(x), ry(riverCenterZ(x)));
    else ctx.lineTo(rx(x), ry(riverCenterZ(x)));
  }
  ctx.strokeStyle = '#3ca1c9'; ctx.lineWidth = 2.6; ctx.stroke();

  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(rx(0), ry(RUNWAY.zStart)); ctx.lineTo(rx(0), ry(RUNWAY.zEnd)); ctx.stroke();

  const rings = state.course.rings;
  ctx.beginPath();
  ctx.moveTo(rx(0), ry(RUNWAY.zEnd));
  for (const r of rings) ctx.lineTo(rx(r.x), ry(r.z));
  ctx.lineTo(rx(0), ry(RUNWAY.aimZ));
  ctx.strokeStyle = 'rgba(255, 214, 102, 0.36)'; ctx.lineWidth = 1.1; ctx.stroke();

  for (const r of rings) {
    ctx.beginPath();
    if (r.status === 'active') {
      ctx.arc(rx(r.x), ry(r.z), 3.8 + Math.sin(state.time * 7) * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24d';
    } else {
      ctx.arc(rx(r.x), ry(r.z), 2.3, 0, Math.PI * 2);
      ctx.fillStyle = r.status === 'hit' || r.status === 'bullseye' ? '#69f7c4' : r.status === 'missed' ? '#e06458' : 'rgba(255,255,255,0.65)';
    }
    ctx.fill();
  }

  ctx.save();
  ctx.translate(rx(p.x), ry(p.z));
  ctx.rotate(p.yaw);
  ctx.fillStyle = '#ff604a'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(5, 5); ctx.lineTo(0, 2.8); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();

  ctx.font = `700 9px ${MONO}`; ctx.fillStyle = '#ffd24d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - rad + 8);
  ctx.restore();
}

const _proj = { x: 0, y: 0, scale: 1, cz: 0 };

function drawTargetIndicator(ctx, state, cam, target, dist, relYaw, theme) {
  const onScreen = projectWorld(cam, target.x, target.y, target.z, _proj);
  const topBound = 88, botBound = VIEW.height - VIEW.panelHeight - 36;
  const visible = onScreen && _proj.x > 128 && _proj.x < VIEW.width - 128 && _proj.y > topBound && _proj.y < botBound;
  const altDiffFt = Math.round((target.y - state.plane.y) * M_TO_FT);
  const altTxt = Math.abs(altDiffFt) < 25 ? 'LEVEL' : altDiffFt > 0 ? `▲ +${altDiffFt} FT` : `▼ ${altDiffFt} FT`;
  const distTxt = `${Math.round(dist)}m`;

  if (visible) {
    ctx.save();
    const label = `▼ ${target.label} · ${distTxt}`;
    ctx.font = `700 11px ${MONO}`;
    const tw = ctx.measureText(label).width + 16;
    const ty = Math.max(topBound + 14, _proj.y - Math.max(30, _proj.scale * 26));
    const col = state.phase === PHASE_APPROACH ? '#69f7c4' : '#ffe066';
    pill(ctx, _proj.x - tw / 2, ty - 11, tw, 20, 6, 'rgba(10, 18, 30, 0.76)', col, 1.1);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, _proj.x, ty - 1);
    ctx.restore();
    return;
  }

  const dirX = Math.sin(relYaw);
  const dirY = Math.max(-0.7, Math.min(0.7, -(target.y - state.plane.y) / Math.max(80, dist)));
  const mag = Math.hypot(dirX, dirY) || 1;
  const ix = VIEW.horizonX + (dirX / mag) * 470;
  const iy = Math.max(topBound + 26, Math.min(botBound - 24, VIEW.horizonY + (dirY / mag) * 210));

  ctx.save();
  ctx.translate(ix, iy);
  ctx.save();
  ctx.rotate(Math.atan2(dirY / mag, dirX / mag));
  ctx.fillStyle = '#ffd24d'; ctx.strokeStyle = '#0c1624'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-4, 0); ctx.lineTo(-9, 9); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  pill(ctx, -46, 13, 92, 30, 6, 'rgba(10, 18, 30, 0.82)', 'rgba(255, 210, 77, 0.55)', 1);
  ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24d'; ctx.fillText(distTxt, 0, 25);
  ctx.fillStyle = theme.hud; ctx.fillText(altTxt, 0, 38);
  ctx.restore();
}

export function drawCockpitPanel(ctx, state, options) {
  const p = state.plane;
  const py = VIEW.height - VIEW.panelHeight;
  ctx.save();

  const panelGrad = ctx.createLinearGradient(0, py, 0, VIEW.height);
  panelGrad.addColorStop(0, '#51404b');
  panelGrad.addColorStop(0.09, '#222a36');
  panelGrad.addColorStop(0.66, '#141e28');
  panelGrad.addColorStop(1, '#0b1018');
  ctx.fillStyle = panelGrad;
  ctx.fillRect(0, py, VIEW.width, VIEW.panelHeight);
  ctx.fillStyle = '#9d7964'; ctx.fillRect(0, py, VIEW.width, 2);
  ctx.fillStyle = 'rgba(124, 247, 201, 0.3)'; ctx.fillRect(0, py + 3, VIEW.width, 1);

  const dialY = py + 47;
  const dialR = 38;
  drawAttitudeDial(ctx, 198, dialY, dialR, p.pitch, p.roll);
  drawAirspeedDial(ctx, 326, dialY, dialR, p.speed * MS_TO_KTS);
  drawAltimeterDial(ctx, 454, dialY, dialR, Math.max(0, p.y * M_TO_FT));
  drawVsiDial(ctx, 582, dialY, dialR, p.vy * MS_TO_FPM);
  drawThrottleAndRpm(ctx, 684, py + 12, p.throttle, p.rpm);
  drawAnnunciatorBank(ctx, 840, py + 12, state, options);

  ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(164, 194, 224, 0.6)'; ctx.fillText('SKYWARD-180', 22, py + 26);
  ctx.fillStyle = '#69f7c4'; ctx.fillText(options.camMode === 'cockpit' ? 'CAM: COCKPIT' : 'CAM: CHASE', 22, py + 45);
  ctx.fillStyle = options.invertPitch ? '#ffd24d' : '#9cc2de'; ctx.fillText(options.invertPitch ? 'PITCH: SIM' : 'PITCH: ARCADE', 22, py + 64);
  ctx.fillStyle = options.muted ? '#ff8b6b' : '#69f7c4'; ctx.fillText(options.muted ? 'AUDIO: MUTE' : 'AUDIO: LIVE', 22, py + 83);

  ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
  ctx.fillRect(0, VIEW.height - 19, VIEW.width, 19);
  ctx.fillStyle = 'rgba(124, 247, 201, 0.14)';
  ctx.fillRect(0, VIEW.height - 19, VIEW.width, 1);
  ctx.font = `600 10.5px ${MONO}`;
  ctx.fillStyle = '#c1cbd2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    'W/S THROTTLE  ·  ↑↓ PITCH  ·  ←→ / A D BANK  ·  G GEAR  ·  F FLAPS  ·  SPACE BRAKE  ·  C CAM  ·  I INVERT  ·  M AUDIO  ·  P PAUSE  ·  R RESTART',
    VIEW.width / 2,
    VIEW.height - 9.5,
  );
  ctx.restore();
}

function drawDialBezel(ctx, cx, cy, r, label) {
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r + 6);
  glow.addColorStop(0, 'rgba(255, 205, 140, 0.30)');
  glow.addColorStop(1, 'rgba(105, 220, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();

  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, '#b89c86'); rim.addColorStop(0.32, '#586271'); rim.addColorStop(1, '#14212d');
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#131d26'; ctx.fill();

  ctx.font = `700 9px ${MONO}`; ctx.fillStyle = '#dfccbb'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(label, cx, cy + r + 5);
}

function drawDialGlass(ctx, cx, cy, r) {
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.5, cy + r * 0.5);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.fillStyle = sheen; ctx.fill();
}

function drawAttitudeDial(ctx, cx, cy, r, pitch, roll) {
  drawDialBezel(ctx, cx, cy, r, 'ATTITUDE');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy); ctx.rotate(-roll);
  const shift = Math.max(-r * 0.9, Math.min(r * 0.9, pitch * 64));
  ctx.fillStyle = '#307b99'; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 1.5 + shift);
  ctx.fillStyle = '#a47750'; ctx.fillRect(-r * 1.5, shift, r * 3, r * 1.5 - shift);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-r * 1.4, shift); ctx.lineTo(r * 1.4, shift); ctx.stroke();
  ctx.lineWidth = 1.1;
  for (const d of [-20, -10, 10, 20]) {
    const py = shift - (d * Math.PI / 180) * 64;
    const hw = Math.abs(d) === 20 ? 13 : 8;
    ctx.beginPath(); ctx.moveTo(-hw, py); ctx.lineTo(hw, py); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.1;
  for (const deg of [-45, -30, -15, 0, 15, 30, 45]) {
    const a = (-90 + deg) * (Math.PI / 180);
    const len = deg === 0 ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2)); ctx.lineTo(Math.cos(a) * (r - 2 - len), Math.sin(a) * (r - 2 - len)); ctx.stroke();
  }
  ctx.strokeStyle = '#ff9f2e'; ctx.lineWidth = 2.3;
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-5, 0); ctx.lineTo(-5, 4); ctx.moveTo(5, 4); ctx.lineTo(5, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.fillStyle = '#ff9f2e'; ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawDialGlass(ctx, cx, cy, r);
}

function drawAirspeedDial(ctx, cx, cy, r, kts) {
  drawDialBezel(ctx, cx, cy, r, 'AIRSPEED');
  const toA = (k) => -Math.PI * 0.5 + (Math.max(0, Math.min(150, k)) / 150) * Math.PI * 1.82;
  const arcR = r - 4.5;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4ad98b'; ctx.beginPath(); ctx.arc(cx, cy, arcR, toA(45), toA(112)); ctx.stroke();
  ctx.strokeStyle = '#ffd24d'; ctx.beginPath(); ctx.arc(cx, cy, arcR, toA(112), toA(132)); ctx.stroke();
  ctx.strokeStyle = '#ff5959'; ctx.beginPath(); ctx.arc(cx, cy, arcR, toA(132), toA(146)); ctx.stroke();

  ctx.strokeStyle = '#d6ecff'; ctx.fillStyle = '#d6ecff'; ctx.font = `600 7px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 20; k <= 140; k += 10) {
    const a = toA(k), maj = k % 20 === 0;
    ctx.lineWidth = maj ? 1.2 : 0.8;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 2.5), cy + Math.sin(a) * (r - 2.5)); ctx.lineTo(cx + Math.cos(a) * (r - (maj ? 7.5 : 5)), cy + Math.sin(a) * (r - (maj ? 7.5 : 5))); ctx.stroke();
    if (maj) ctx.fillText(String(k), cx + Math.cos(a) * (r - 15.5), cy + Math.sin(a) * (r - 15.5));
  }
  ctx.font = `700 7.5px ${MONO}`; ctx.fillStyle = '#7cf7c9'; ctx.fillText('KTS', cx, cy + 10);

  const na = toA(kts);
  ctx.strokeStyle = '#ffad3b'; ctx.lineWidth = 2.1;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * 6, cy - Math.sin(na) * 6); ctx.lineTo(cx + Math.cos(na) * (r - 7), cy + Math.sin(na) * (r - 7)); ctx.stroke();
  ctx.fillStyle = '#dbe7f3'; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  drawDialGlass(ctx, cx, cy, r);
}

function drawAltimeterDial(ctx, cx, cy, r, altFt) {
  drawDialBezel(ctx, cx, cy, r, 'ALTIMETER');
  ctx.strokeStyle = '#d6ecff'; ctx.fillStyle = '#d6ecff'; ctx.font = `600 8.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 2.5), cy + Math.sin(a) * (r - 2.5)); ctx.lineTo(cx + Math.cos(a) * (r - 7.5), cy + Math.sin(a) * (r - 7.5)); ctx.stroke();
    ctx.fillText(String(i), cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
  }
  ctx.fillStyle = '#182433'; ctx.fillRect(cx - 11, cy + 7.5, 22, 8.5);
  ctx.font = `600 6.5px ${MONO}`; ctx.fillStyle = '#9fd0e8'; ctx.fillText('29.92', cx, cy + 11.8);

  const a1000 = -Math.PI / 2 + ((altFt % 10000) / 10000) * Math.PI * 2;
  ctx.strokeStyle = '#9ec9e6'; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1000) * (r - 16), cy + Math.sin(a1000) * (r - 16)); ctx.stroke();

  const a100 = -Math.PI / 2 + ((altFt % 1000) / 1000) * Math.PI * 2;
  ctx.strokeStyle = '#7cf7c9'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a100) * 5, cy - Math.sin(a100) * 5); ctx.lineTo(cx + Math.cos(a100) * (r - 7), cy + Math.sin(a100) * (r - 7)); ctx.stroke();
  ctx.fillStyle = '#dbe7f3'; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  drawDialGlass(ctx, cx, cy, r);
}

function drawVsiDial(ctx, cx, cy, r, fpm) {
  drawDialBezel(ctx, cx, cy, r, 'VERT SPD');
  const clamped = Math.max(-1000, Math.min(1000, fpm));
  const toA = (val) => Math.PI + (val / 1000) * Math.PI * 0.78;
  ctx.strokeStyle = '#d6ecff'; ctx.fillStyle = '#d6ecff'; ctx.font = `600 7.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = -1000; v <= 1000; v += 250) {
    const a = toA(v), maj = v % 500 === 0;
    ctx.lineWidth = maj ? 1.3 : 0.85;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 2.5), cy + Math.sin(a) * (r - 2.5)); ctx.lineTo(cx + Math.cos(a) * (r - (maj ? 8 : 5.5)), cy + Math.sin(a) * (r - (maj ? 8 : 5.5))); ctx.stroke();
    if (maj) ctx.fillText(v === 0 ? '0' : String(Math.abs(v) / 100), cx + Math.cos(a) * (r - 14.5), cy + Math.sin(a) * (r - 14.5));
  }
  ctx.font = `700 7px ${MONO}`;
  ctx.fillStyle = '#7cf7c9'; ctx.fillText('UP', cx + 4, cy - 10);
  ctx.fillStyle = '#ffd24d'; ctx.fillText('DN', cx + 4, cy + 10);

  const na = toA(clamped);
  ctx.strokeStyle = clamped < -420 ? '#ff6b6b' : '#7cf7c9'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * 5, cy - Math.sin(na) * 5); ctx.lineTo(cx + Math.cos(na) * (r - 7), cy + Math.sin(na) * (r - 7)); ctx.stroke();
  ctx.fillStyle = '#dbe7f3'; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  drawDialGlass(ctx, cx, cy, r);
}

function drawThrottleAndRpm(ctx, x, y, throttle, rpm) {
  pill(ctx, x, y, 136, 82, 8, '#0d1520', '#33455c', 1.4);
  const sx = x + 22, sy = y + 10, sh = 54;
  pill(ctx, sx, sy, 14, sh, 4, '#070b12', null);
  const fillH = Math.round(throttle * (sh - 4));
  const tGrad = ctx.createLinearGradient(0, sy + sh, 0, sy);
  tGrad.addColorStop(0, '#36b588'); tGrad.addColorStop(0.75, '#ffd24d'); tGrad.addColorStop(1, '#ff684a');
  ctx.fillStyle = tGrad;
  ctx.fillRect(sx + 2, sy + sh - 2 - fillH, 10, fillH);

  const knobY = sy + sh - 4 - throttle * (sh - 8);
  pill(ctx, sx - 7, knobY - 5, 28, 10, 3, '#e84a36', '#ffaba0', 1);

  ctx.font = `700 8.5px ${MONO}`; ctx.fillStyle = '#90b3d1'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('THR', sx + 7, y + 76);

  ctx.textAlign = 'left';
  ctx.font = `700 10px ${MONO}`; ctx.fillStyle = '#8cb4d1'; ctx.fillText('POWER', x + 54, y + 20);
  ctx.font = `700 20px ${MONO}`; ctx.fillStyle = throttle > 0.9 ? '#ffd24d' : '#7cf7c9'; ctx.fillText(`${Math.round(throttle * 100)}%`, x + 54, y + 42);
  ctx.font = `600 10px ${MONO}`; ctx.fillStyle = '#d4e8f7'; ctx.fillText(`${Math.round(650 + rpm * 2050)} RPM`, x + 54, y + 59);
  for (let i = 0; i < 10; i += 1) {
    const lit = (i + 1) / 10 <= rpm + 0.04;
    ctx.fillStyle = !lit ? '#1c2a3a' : i >= 8 ? '#ff7054' : i >= 6 ? '#ffd24d' : '#69f7c4';
    ctx.fillRect(x + 54 + i * 7, y + 65, 5, 6);
  }
}

function drawAnnunciatorBank(ctx, x, y, state, options) {
  const p = state.plane;
  pill(ctx, x, y, 416, 82, 8, '#0d1520', '#33455c', 1.4);

  const gx = x + 16, gy = y + 11;
  ctx.font = `700 9.5px ${MONO}`; ctx.fillStyle = '#8eb3d1'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('GEAR [G]', gx, gy + 8);
  const lockedDown = p.gearDown && p.gearAnim > 0.95;
  const transiting = p.gearAnim > 0.05 && p.gearAnim < 0.95;
  for (let i = 0; i < 3; i += 1) {
    const col = lockedDown ? '#4ef59c' : transiting ? '#ffd24d' : state.gearWarn ? '#ff4d4d' : '#1e2c3c';
    ctx.fillStyle = col;
    if (lockedDown || transiting || state.gearWarn) { ctx.shadowColor = col; ctx.shadowBlur = 9; }
    ctx.beginPath(); ctx.arc(gx + 10 + i * 20, gy + 29, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.font = `700 10px ${MONO}`;
  ctx.fillStyle = lockedDown ? '#69f7c4' : state.gearWarn ? '#ff6b6b' : '#7b99b3';
  ctx.fillText(lockedDown ? '3 GREEN' : transiting ? 'TRANSIT' : 'UP', gx, gy + 54);

  const fx = x + 104;
  ctx.font = `700 9.5px ${MONO}`; ctx.fillStyle = '#8eb3d1'; ctx.fillText('FLAPS [F]', fx, gy + 8);
  const flapLabels = ['0° UP', '15° APP', '30° LND'];
  for (let i = 0; i < 3; i += 1) {
    const act = p.flaps === i;
    pill(ctx, fx, gy + 16 + i * 16, 64, 13, 3, act ? (i === 0 ? '#2b6b8f' : i === 1 ? '#b88a1e' : '#268a5c') : '#162230', null);
    ctx.font = `700 8.5px ${MONO}`; ctx.fillStyle = act ? '#ffffff' : '#94b2cc';
    ctx.fillText(flapLabels[i], fx + 6, gy + 25.5 + i * 16);
  }

  const lamps = [
    ['STALL', state.stallWarn, '#e03c3c', '#fff'],
    ['BRAKE', p.braking, '#e69b22', '#0c121a'],
    ['APPROACH', state.phase === PHASE_APPROACH, '#27a675', '#fff'],
    ['ON GND', p.onGround, '#3b82c4', '#fff'],
  ];
  for (let i = 0; i < lamps.length; i += 1) {
    const [label, lit, on, txt] = lamps[i];
    const bx = x + 186 + (i % 2) * 72;
    const by = gy + 7 + Math.floor(i / 2) * 29;
    pill(ctx, bx, by, 66, 22, 4, lit ? on : '#15212f', lit ? '#ffffff' : '#27384c', 1);
    ctx.font = `700 9.5px ${MONO}`; ctx.fillStyle = lit ? txt : '#6f8ba6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 33, by + 11);
  }

  const px = x + 340;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 9px ${MONO}`; ctx.fillStyle = '#8eb3d1'; ctx.fillText('PAPI RWY36', px + 30, gy + 11);
  const showPapi = state.phase === PHASE_APPROACH;
  for (let i = 0; i < 4; i += 1) {
    const isRed = i >= 4 - state.papiReds;
    const col = !showPapi ? '#1f2e3f' : isRed ? '#ff4a4a' : '#fff8d6';
    if (showPapi) { ctx.shadowColor = col; ctx.shadowBlur = 7; }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(px + 6 + i * 16, gy + 31, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.font = `700 9px ${MONO}`;
  ctx.fillStyle = !showPapi ? '#7d98b2' : state.papiReds === 2 ? '#69f7c4' : '#ffd24d';
  ctx.fillText(!showPapi ? 'STBY' : state.papiReds === 2 ? 'ON SLOPE' : state.papiReds < 2 ? 'TOO HIGH' : 'TOO LOW', px + 30, gy + 56);
}

export function getTitleButtons() {
  const buttons = [];
  const cardW = 174, gap = 8, startX = 132;
  for (let i = 0; i < COURSE_DEFS.length; i += 1) {
    buttons.push({ id: `course-${i}`, courseIndex: i, x: startX + i * (cardW + gap), y: 457, w: cardW, h: 60 });
  }
  buttons.push({ id: 'launch', x: startX, y: 528, w: 296, h: 44 });
  return buttons;
}

export function drawTitleOverlay(ctx, state, bestScores) {
  ctx.save();
  const x = 132;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd79d';
  ctx.fillRect(x, 134, 37, 1);
  ctx.font = '700 12px ' + MONO;
  ctx.fillText('PELICAN POINT AIRFIELD', x + 46, 139);
  ctx.save();
  ctx.shadowColor = 'rgba(18,22,42,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff1d6';
  ctx.font = '900 76px ' + FONT;
  ctx.fillText('SKYWARD', x - 4, 224);
  ctx.font = 'italic 102px Georgia, serif';
  ctx.fillText('RINGS', x - 7, 307);
  ctx.restore();

  ctx.fillStyle = '#ffcc88'; ctx.font = '700 17px ' + MONO;
  ctx.letterSpacing = '5px';
  ctx.fillText('GOLDEN HOUR', x, 352);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#fff0da'; ctx.font = '600 14px ' + FONT;
  ctx.fillText('Take off from RWY 36, fly the rings and land in the touchdown zone.', x, 384);
  ctx.font = '600 11px ' + MONO;
  ctx.fillText('[1–3] COURSE  /  [M] MUTE', x, 407);

  const buttons = getTitleButtons();
  ctx.textBaseline = 'middle';
  for (let i = 0; i < COURSE_DEFS.length; i += 1) {
    const def = COURSE_DEFS[i], b = buttons[i], sel = state.courseIndex === i;
    pill(ctx, b.x, b.y, b.w, b.h, 3, sel ? '#302c34' : 'rgba(16,24,40,0.91)', sel ? '#ffc57a' : 'rgba(232,207,176,0.42)');
    if (sel) { ctx.fillStyle = '#ffc57a'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 2); }
    ctx.textAlign = 'left';
    ctx.font = `700 10px ${MONO}`; ctx.fillStyle = sel ? '#ffd24d' : '#96c2e4';
    ctx.fillText(`[${i + 1}] ${def.rings.length} RINGS · ${def.windLabel}`, b.x + 12, b.y + 15);
    ctx.font = `700 14.5px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(def.name, b.x + 12, b.y + 30);
    const best = bestScores[def.id] || 0;
    ctx.font = `600 10px ${MONO}`; ctx.fillStyle = best > 0 ? '#69f7c4' : '#9dc0dc';
    ctx.fillText(best > 0 ? `BEST ${best}` : `PAR ${def.parTime}s`, b.x + 12, b.y + 47);
  }

  const cta = buttons[3];
  pill(ctx, cta.x, cta.y, cta.w, cta.h, 3, '#ffce8e', '#ffe3b5');
  ctx.textAlign = 'center'; ctx.font = '800 16px ' + FONT; ctx.fillStyle = '#221d29';
  ctx.fillText('PRESS SPACE OR CLICK TO FLY', cta.x + cta.w / 2, cta.y + 23);
  ctx.restore();
}

export function drawPauseOverlay(ctx, options) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 13, 22, 0.5)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height - VIEW.panelHeight);
  const w = 440, h = 246, x = VIEW.horizonX - w / 2, y = 172;
  pill(ctx, x, y, w, h, 14, 'rgba(13, 23, 38, 0.93)', 'rgba(124, 247, 201, 0.58)', 1.8);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 32px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.fillText('FLIGHT PAUSED', VIEW.horizonX, y + 46);
  const lines = [
    '[P / ESC / SPACE]  Resume Flight',
    '[R]  Restart From Runway 36',
    `[I]  Pitch Mode: ${options.invertPitch ? 'SIM (↓ Pull Up)' : 'ARCADE (↑ Climb)'}`,
    `[C]  Camera: ${options.camMode === 'cockpit' ? 'COCKPIT' : 'CHASE'}  ·  [M]  Audio: ${options.muted ? 'OFF' : 'ON'}`,
  ];
  ctx.font = `600 13.5px ${MONO}`; ctx.fillStyle = '#d4e8f7';
  lines.forEach((ln, i) => ctx.fillText(ln, VIEW.horizonX, y + 100 + i * 31));
  ctx.restore();
}

export function drawSummaryOverlay(ctx, state, bestScore, isNewRecord) {
  const crashed = state.phase === PHASE_CRASHED;
  const offField = !crashed && Boolean(state.offField);
  const w = 594, h = crashed || offField ? 310 : 439;
  const x = crashed || offField ? VIEW.horizonX - w / 2 : 132;
  const y = crashed || offField ? 140 : 104;
  ctx.save();
  const borderCol = crashed ? '#ff8779' : offField ? '#ffb347' : '#dcb485';
  const metal = ctx.createLinearGradient(x, y, x + w, y + h);
  metal.addColorStop(0, 'rgba(36,34,47,0.98)');
  metal.addColorStop(1, 'rgba(10,20,33,0.95)');
  pill(ctx, x, y, w, h, 5, metal, borderCol);
  ctx.fillStyle = borderCol; ctx.fillRect(x + 1, y + 1, w - 2, 3);

  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '700 12px ' + MONO; ctx.fillStyle = borderCol;
  ctx.fillText(state.course.def.name + ' · ' + (crashed ? state.failType || 'FLIGHT FAILED' : offField ? 'EMERGENCY LANDING' : 'FLIGHT RESULTS'), x + 28, y + 30);
  ctx.font = '800 25px ' + FONT; ctx.fillStyle = '#fff1da';
  ctx.fillText(crashed ? (state.failType || 'FLIGHT TERMINATED') : offField ? 'OFF-FIELD LANDING' : 'TOUCHDOWN COMPLETE', x + 28, y + 62);

  const bx = x + w - 64, by = y + (crashed || offField ? 57 : 83);
  const gradeCol = offField ? '#ffb347' : state.grade === 'S' ? '#ffe099' : state.grade === 'A' ? '#69f7c4' : state.grade === 'B' ? '#68c3ff' : state.grade === 'C' ? '#d4c298' : '#ff6b6b';
  const rad = crashed || offField ? 29 : 39;
  const medal = ctx.createLinearGradient(bx, by - rad, bx, by + rad);
  medal.addColorStop(0, '#68533f'); medal.addColorStop(1, '#262739');
  ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2);
  ctx.fillStyle = medal; ctx.fill();
  ctx.strokeStyle = gradeCol; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(bx, by, rad - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center'; ctx.font = 'italic ' + (rad + 5) + 'px Georgia, serif'; ctx.fillStyle = gradeCol;
  ctx.fillText(state.grade, bx, by + 1);

  if (!crashed && !offField) {
    ctx.font = '700 17px ' + FONT;
    for (let star = 0; star < 3; star += 1) {
      ctx.fillStyle = star < state.stars ? '#ffe099' : 'rgba(165,194,220,0.25)';
      ctx.fillText('★', bx + (star - 1) * 19, by + rad + 16);
    }
  }

  if (crashed || offField) {
    ctx.textAlign = 'left';
    const rep = state.landingReport;
    const maxW = w - 56;
    if (offField) {
      ctx.font = `600 14.5px ${FONT}`; ctx.fillStyle = '#ffd699';
      ctx.fillText(`Set down off-runway (${rep.centerOffset}m off RWY 36 · -${rep.fpm} FPM).`, x + 28, y + 114, maxW);
      ctx.font = `500 13.5px ${FONT}`; ctx.fillStyle = '#d4e6f5';
      ctx.fillText('Mission requires a runway landing — touch down on Runway 36 to complete.', x + 28, y + 137, maxW);
      ctx.font = `600 13.5px ${MONO}`; ctx.fillStyle = '#c8dff0';
      ctx.fillText(`RINGS CLEARED: ${state.ringsHit} / ${state.course.rings.length}  ·  TIME: ${fmtClock(state.flightTime)}`, x + 28, y + 174);
      ctx.fillText(`RING SCORE: ${state.totalScore}  ·  BEST STREAK: ×${state.bestStreak}  ·  0/3 STARS`, x + 28, y + 204);
    } else {
      ctx.font = `600 15px ${FONT}`; ctx.fillStyle = '#ffb4ab';
      ctx.fillText(state.crashReason || 'Aircraft lost during flight.', x + 28, y + 122, maxW);
      ctx.font = `600 13.5px ${MONO}`; ctx.fillStyle = '#c8dff0';
      ctx.fillText(`RINGS CLEARED: ${state.ringsHit} / ${state.course.rings.length}  ·  TIME: ${fmtClock(state.flightTime)}`, x + 28, y + 162);
      ctx.fillText(`RING SCORE: ${state.totalScore}  ·  BEST STREAK: ×${state.bestStreak}  ·  0/3 STARS`, x + 28, y + 194);
    }
  } else {
    const rep = state.landingReport;
    const rows = [
      [`RINGS (${state.ringsHit}/${state.course.rings.length} · ${state.bullseyes} BULLSEYE · +${state.ringTimeBonusSec}s)`, `+${state.ringScore}`, '#ffe066'],
      [`LANDING GRADE (${rep.smoothLabel} · -${rep.fpm} FPM)`, `+${state.landingScore}`, '#69f7c4'],
      [`TOUCHDOWN (${rep.zoneLabel} · ${rep.centerOffset}m OFF CL)`, `+${state.tdzBonus}`, rep.inTdz ? '#69f7c4' : '#ffd24d'],
      [`TIME BONUS (${fmtClock(state.flightTime)} · PAR ${state.course.def.parTime}+${state.ringTimeBonusSec}s)`, `+${state.timeBonus}`, '#9fd8ff'],
    ];
    ctx.textAlign = 'left';
    ctx.font = '800 62px ' + FONT; ctx.fillStyle = '#ffdb9d';
    ctx.fillText(state.totalScore.toLocaleString('en-US'), x + 26, y + 113);
    ctx.font = '700 11px ' + MONO; ctx.fillStyle = '#ecd3b7';
    ctx.fillText(isNewRecord ? 'TOTAL SCORE  ·  NEW RECORD!' : 'TOTAL SCORE  ·  BEST ' + bestScore, x + 28, y + 155);
    let ry = y + 190;
    for (const [label, pts, col] of rows) {
      ctx.fillStyle = 'rgba(242,216,184,0.18)'; ctx.fillRect(x + 28, ry - 15, w - 56, 1);
      ctx.textAlign = 'left'; ctx.font = '600 12.2px ' + MONO; ctx.fillStyle = '#efebeb'; ctx.fillText(label, x + 30, ry + 1);
      ctx.textAlign = 'right'; ctx.font = '700 15px ' + MONO; ctx.fillStyle = col; ctx.fillText(pts, x + w - 30, ry + 1);
      ry += 39;
    }
    ctx.textAlign = 'left'; ctx.font = '600 11.5px ' + MONO; ctx.fillStyle = '#ccc6c9';
    ctx.fillText(`STATS: AVG ${rep.avgKts} KTS  ·  MAX ${rep.maxKts} KTS  ·  BEST STREAK ×${state.bestStreak}  ·  ${state.stars}/3 STARS`, x + 30, ry + 5);
  }

  const btnY = y + h - 52;
  pill(ctx, x + 28, btnY, 270, 38, 3, '#ffce8e', null);
  ctx.textAlign = 'center'; ctx.font = `800 14px ${FONT}`; ctx.fillStyle = '#111a28';
  ctx.fillText(crashed || offField ? 'SPACE / CLICK · RETRY FLIGHT' : 'SPACE / CLICK · FLY AGAIN', x + 163, btnY + 20);
  ctx.textAlign = 'right'; ctx.font = `600 12px ${MONO}`; ctx.fillStyle = '#9cc2de';
  ctx.fillText('[1][2][3] COURSE · [T] TITLE', x + w - 28, btnY + 20);
  ctx.restore();
}
