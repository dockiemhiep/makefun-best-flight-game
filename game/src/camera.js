// 3D perspective camera math, world-to-camera basis, near-plane polygon clipping,
// and horizon transform. Coordinate convention: +x East, +y Up, +z North.

import { VIEW } from './config.js';

export const NEAR_CLIP = 12;

export function createCamera() {
  return {
    x: 0,
    y: 12,
    z: -30,
    yaw: 0,
    pitch: 0,
    roll: 0,
    // Orthonormal basis vectors
    rx: 1, ry: 0, rz: 0,
    ux: 0, uy: 1, uz: 0,
    fx: 0, fy: 0, fz: 1,
    mode: 'chase', // 'chase' or 'cockpit'
    shake: 0,
    shakeX: 0,
    shakeY: 0,
  };
}

/** Recompute orthonormal camera basis from (yaw, pitch, roll). */
export function updateCameraBasis(cam) {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);

  // Forward (yaw then pitch)
  const fx = sy * cp;
  const fy = sp;
  const fz = cy * cp;

  // Unrolled right and up
  const r0x = cy;
  const r0y = 0;
  const r0z = -sy;

  const u0x = -sy * sp;
  const u0y = cp;
  const u0z = -cy * sp;

  // Apply camera roll (positive roll banks right wing down)
  cam.fx = fx;
  cam.fy = fy;
  cam.fz = fz;

  cam.rx = r0x * cr - u0x * sr;
  cam.ry = r0y * cr - u0y * sr;
  cam.rz = r0z * cr - u0z * sr;

  cam.ux = u0x * cr + r0x * sr;
  cam.uy = u0y * cr + r0y * sr;
  cam.uz = u0z * cr + r0z * sr;
}

/** Transform a world point (wx, wy, wz) into camera coordinates (cx, cy, cz). */
export function worldToCam(cam, wx, wy, wz, out) {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  out.x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  out.y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  out.z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  return out;
}

/** Project a camera-space point (cz > 0) to logical 1280x720 screen coordinates. */
export function projectCam(cx, cy, cz, out) {
  const inv = VIEW.focal / cz;
  out.x = VIEW.horizonX + cx * inv;
  out.y = VIEW.horizonY - cy * inv;
  out.scale = inv;
  return out;
}

/** Convenience: project world point directly; returns false if behind near plane. */
export function projectWorld(cam, wx, wy, wz, out) {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  const cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (cz < NEAR_CLIP) return false;
  const cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const inv = VIEW.focal / cz;
  out.x = VIEW.horizonX + cx * inv + cam.shakeX;
  out.y = VIEW.horizonY - cy * inv + cam.shakeY;
  out.scale = inv;
  out.cz = cz;
  return true;
}

/**
 * Sutherland-Hodgman clip of a 3D world polygon against cz >= nearZ, then project to 2D.
 * `pts` is an array of [x, y, z] points. Writes projected [sx, sy] pairs into `out` and returns count.
 */
const _camBuf = [];
const _clipBuf = [];
for (let i = 0; i < 64; i += 1) {
  _camBuf.push({ x: 0, y: 0, z: 0 });
  _clipBuf.push({ x: 0, y: 0, z: 0 });
}

export function projectPolygon(cam, pts, out, nearZ = NEAR_CLIP) {
  const n = pts.length;
  if (n < 3 || n > 48) return 0;

  let anyVisible = false;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i];
    const c = _camBuf[i];
    const dx = p[0] - cam.x;
    const dy = p[1] - cam.y;
    const dz = p[2] - cam.z;
    c.x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    c.y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    c.z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (c.z >= nearZ) anyVisible = true;
  }
  if (!anyVisible) return 0;

  let m = 0;
  let prev = _camBuf[n - 1];
  let prevIn = prev.z >= nearZ;
  for (let i = 0; i < n; i += 1) {
    const cur = _camBuf[i];
    const curIn = cur.z >= nearZ;
    if (curIn !== prevIn) {
      const t = (nearZ - prev.z) / (cur.z - prev.z);
      const dst = _clipBuf[m++];
      dst.x = prev.x + (cur.x - prev.x) * t;
      dst.y = prev.y + (cur.y - prev.y) * t;
      dst.z = nearZ;
    }
    if (curIn) {
      const dst = _clipBuf[m++];
      dst.x = cur.x;
      dst.y = cur.y;
      dst.z = cur.z;
    }
    prev = cur;
    prevIn = curIn;
  }
  if (m < 3) return 0;

  const fx = VIEW.horizonX + cam.shakeX;
  const fy = VIEW.horizonY + cam.shakeY;
  const focal = VIEW.focal;
  for (let i = 0; i < m; i += 1) {
    const c = _clipBuf[i];
    const inv = focal / c.z;
    out[i * 2] = fx + c.x * inv;
    out[i * 2 + 1] = fy - c.y * inv;
  }
  return m;
}

/** Update chase or cockpit camera smoothly from player aircraft state. */
export function syncCameraToPlane(cam, plane, dt) {
  const sy = Math.sin(plane.yaw);
  const cy = Math.cos(plane.yaw);
  const sp = Math.sin(plane.pitch);
  const cp = Math.cos(plane.pitch);

  // Decay camera shake
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 3.8);
    const amp = cam.shake * 8;
    cam.shakeX = Math.sin(plane.time * 58) * amp;
    cam.shakeY = Math.cos(plane.time * 47) * amp * 0.7;
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
  }

  if (cam.mode === 'cockpit') {
    const noseFwd = 1.8;
    cam.x = plane.x + sy * cp * noseFwd;
    cam.y = Math.max(2.6, plane.y + 1.9 + sp * noseFwd);
    cam.z = plane.z + cy * cp * noseFwd;
    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch - 0.03;
    cam.roll = plane.roll * 0.92;
  } else {
    // Cinematic chase camera: sits behind & slightly above plane, subtly banking with roll
    const backDist = plane.onGround ? 26 : 31;
    const heightOff = plane.onGround ? 7.6 : 9.2 - plane.pitch * 4.5;
    const sideLag = -Math.sin(plane.roll) * 2.4;

    cam.x = plane.x - sy * cp * backDist + cy * sideLag;
    cam.y = Math.max(2.6, plane.y + heightOff - sp * backDist * 0.55);
    cam.z = plane.z - cy * cp * backDist - sy * sideLag;

    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch * 0.72 - 0.085;
    cam.roll = plane.roll * 0.56;
  }
  updateCameraBasis(cam);
}
