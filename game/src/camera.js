// 3D perspective camera math, world-to-camera basis, near-plane polygon clipping,
// and chase/cockpit camera sync. Axes: +x East, +y Up, +z North.

import { VIEW } from './config.js';

export const NEAR_CLIP = 12;

export function createCamera() {
  return {
    x: 0, y: 12, z: -30, yaw: 0, pitch: 0, roll: 0,
    rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1,
    mode: 'chase', shake: 0, shakeX: 0, shakeY: 0,
  };
}

export function updateCameraBasis(cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  const u0x = -sy * sp, u0y = cp, u0z = -cy * sp;
  cam.fx = sy * cp; cam.fy = sp; cam.fz = cy * cp;
  cam.rx = cy * cr - u0x * sr; cam.ry = -u0y * sr; cam.rz = -sy * cr - u0z * sr;
  cam.ux = u0x * cr + cy * sr; cam.uy = u0y * cr; cam.uz = u0z * cr - sy * sr;
}

export function projectWorld(cam, wx, wy, wz, out) {
  const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
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

const _camBuf = Array.from({ length: 64 }, () => ({ x: 0, y: 0, z: 0 }));
const _clipBuf = Array.from({ length: 64 }, () => ({ x: 0, y: 0, z: 0 }));

/** Sutherland-Hodgman clip of 3D world polygon against cz >= nearZ, projecting [sx, sy] into `out`. */
export function projectPolygon(cam, pts, out, nearZ = NEAR_CLIP) {
  const n = pts.length;
  if (n < 3 || n > 48) return 0;
  let anyVisible = false;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i], c = _camBuf[i];
    const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
    c.x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    c.y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    c.z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (c.z >= nearZ) anyVisible = true;
  }
  if (!anyVisible) return 0;

  let m = 0;
  let prev = _camBuf[n - 1], prevIn = prev.z >= nearZ;
  for (let i = 0; i < n; i += 1) {
    const cur = _camBuf[i], curIn = cur.z >= nearZ;
    if (curIn !== prevIn) {
      const t = (nearZ - prev.z) / (cur.z - prev.z);
      const dst = _clipBuf[m++];
      dst.x = prev.x + (cur.x - prev.x) * t;
      dst.y = prev.y + (cur.y - prev.y) * t;
      dst.z = nearZ;
    }
    if (curIn) {
      const dst = _clipBuf[m++];
      dst.x = cur.x; dst.y = cur.y; dst.z = cur.z;
    }
    prev = cur; prevIn = curIn;
  }
  if (m < 3) return 0;

  const fx = VIEW.horizonX + cam.shakeX, fy = VIEW.horizonY + cam.shakeY, focal = VIEW.focal;
  for (let i = 0; i < m; i += 1) {
    const c = _clipBuf[i], inv = focal / c.z;
    out[i * 2] = fx + c.x * inv;
    out[i * 2 + 1] = fy - c.y * inv;
  }
  return m;
}

export function syncCameraToPlane(cam, plane, dt) {
  const sy = Math.sin(plane.yaw), cy = Math.cos(plane.yaw);
  const sp = Math.sin(plane.pitch), cp = Math.cos(plane.pitch);
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 3.8);
    const amp = cam.shake * 8;
    cam.shakeX = Math.sin(plane.time * 58) * amp;
    cam.shakeY = Math.cos(plane.time * 47) * amp * 0.7;
  } else {
    cam.shakeX = 0; cam.shakeY = 0;
  }

  if (cam.mode === 'cockpit') {
    cam.x = plane.x + sy * cp * 1.8;
    cam.y = Math.max(2.6, plane.y + 1.9 + sp * 1.8);
    cam.z = plane.z + cy * cp * 1.8;
    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch - 0.03;
    cam.roll = plane.roll * 0.92;
  } else {
    const back = plane.onGround ? 26 : 31;
    const height = plane.onGround ? 7.6 : 9.2 - plane.pitch * 4.5;
    const side = -Math.sin(plane.roll) * 2.4;
    cam.x = plane.x - sy * cp * back + cy * side;
    cam.y = Math.max(2.6, plane.y + height - sp * back * 0.55);
    cam.z = plane.z - cy * cp * back - sy * side;
    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch * 0.72 - 0.085;
    cam.roll = plane.roll * 0.56;
  }
  updateCameraBasis(cam);
}
