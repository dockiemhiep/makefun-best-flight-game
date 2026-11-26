import { FIELD_COLORS, RUNWAY, THEMES } from './config.js';

/** Build rings with automatically computed forward tangent headings along the closed loop. */
function makeRings(rawPoints) {
  const rings = rawPoints.map((p, index) => ({
    index,
    x: p.x,
    y: p.y,
    z: p.z,
    label: p.label,
    yaw: 0,
    pitch: 0,
    nx: 0,
    ny: 0,
    nz: 1,
    status: 'pending', // 'pending' | 'active' | 'hit' | 'bullseye' | 'missed'
    hitFlash: 0,
  }));

  for (let i = 0; i < rings.length; i += 1) {
    const cur = rings[i];
    const prev = i === 0 ? { x: 0, y: 10, z: RUNWAY.zEnd } : rings[i - 1];
    const next = i === rings.length - 1 ? { x: 0, y: 0, z: RUNWAY.aimZ } : rings[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // Last ring faces straight down Runway 36 centerline
    if (i === rings.length - 1) {
      cur.nx = 0;
      cur.ny = -0.09;
      cur.nz = 0.996;
      cur.yaw = 0;
      cur.pitch = -0.09;
    } else {
      cur.nx = dx / len;
      cur.ny = (dy / len) * 0.35;
      cur.nz = dz / len;
      const nLen = Math.hypot(cur.nx, cur.ny, cur.nz) || 1;
      cur.nx /= nLen;
      cur.ny /= nLen;
      cur.nz /= nLen;
      cur.yaw = Math.atan2(cur.nx, cur.nz);
      cur.pitch = Math.asin(Math.max(-0.5, Math.min(0.5, cur.ny)));
    }
  }
  return rings;
}

export const COURSE_DEFS = [
  {
    id: 'pelican',
    name: 'PELICAN COAST',
    subtitle: 'Classic 12-ring coastal circuit · Morning sun · Calm breeze',
    theme: THEMES.morning,
    parTime: 118,
    windX: 1.4,
    windZ: -1.0,
    windLabel: '3 KTS NE',
    rings: [
      { x: 0,    y: 46,  z: 780,  label: 'DEPARTURE' },
      { x: 175,  y: 86,  z: 1130, label: 'RIVER ESTUARY' },
      { x: 470,  y: 116, z: 1340, label: 'LIGHTHOUSE' },
      { x: 800,  y: 88,  z: 1210, label: 'TURQUOISE BAY' },
      { x: 940,  y: 62,  z: 830,  label: 'SURF SKIM' },
      { x: 870,  y: 108, z: 410,  label: 'HEADLAND RISE' },
      { x: 750,  y: 94,  z: -20,  label: 'SOUTHERN COVE' },
      { x: 640,  y: 74,  z: -430, label: 'COAST FIELDS' },
      { x: 450,  y: 92,  z: -740, label: 'GOLDEN WHEAT' },
      { x: 165,  y: 82,  z: -770, label: 'ORCHARD BASE' },
      { x: 15,   y: 64,  z: -570, label: 'ALIGN FINAL' },
      { x: 0,    y: 42,  z: -340, label: 'FINAL GATE' },
    ],
  },
  {
    id: 'slalom',
    name: 'RIVER & CLIFFS',
    subtitle: '14-ring river valley & cliff slalom · 8 kt crosswind',
    theme: THEMES.challenge,
    parTime: 148,
    windX: 4.1,
    windZ: -0.8,
    windLabel: '8 KTS E',
    rings: [
      { x: 0,    y: 46,  z: 770,  label: 'DEPARTURE' },
      { x: -160, y: 84,  z: 1110, label: 'RIVER MOUTH' },
      { x: -460, y: 66,  z: 1290, label: 'ARCH BRIDGE' },
      { x: -640, y: 118, z: 1580, label: 'VALLEY CREST' },
      { x: -340, y: 138, z: 1840, label: 'CLOUD GATE' },
      { x: 80,   y: 122, z: 1810, label: 'NORTH CLIFFS' },
      { x: 460,  y: 102, z: 1540, label: 'LIGHTHOUSE' },
      { x: 780,  y: 66,  z: 1180, label: 'SEA SPRAY' },
      { x: 880,  y: 92,  z: 720,  label: 'HEADLAND' },
      { x: 790,  y: 74,  z: 220,  label: 'LAGOON SKIM' },
      { x: 640,  y: 90,  z: -280, label: 'WINDMILLS' },
      { x: 410,  y: 80,  z: -680, label: 'PATCHWORK' },
      { x: 125,  y: 62,  z: -690, label: 'BASE TURN' },
      { x: 0,    y: 42,  z: -340, label: 'FINAL GATE' },
    ],
  },
  {
    id: 'sunset',
    name: 'GOLDEN HOUR',
    subtitle: '12-ring sunset coastal circuit · Twilight approach',
    theme: THEMES.sunset,
    parTime: 118,
    windX: -2.2,
    windZ: -1.6,
    windLabel: '5 KTS NW',
    rings: [
      { x: 0,    y: 48,  z: 780,  label: 'DUSK CLIMB' },
      { x: -180, y: 90,  z: 1120, label: 'RIVER BEND' },
      { x: -490, y: 72,  z: 1300, label: 'ARCH BRIDGE' },
      { x: -790, y: 116, z: 1140, label: 'SUNSET RIDGE' },
      { x: -910, y: 76,  z: 760,  label: 'WHEAT VALLEY' },
      { x: -850, y: 104, z: 320,  label: 'RED BARNS' },
      { x: -750, y: 84,  z: -120, label: 'WINDMILLS' },
      { x: -610, y: 68,  z: -520, label: 'AMBER FIELDS' },
      { x: -370, y: 88,  z: -740, label: 'SOUTH MEADOW' },
      { x: -115, y: 74,  z: -720, label: 'BASE LEG' },
      { x: -10,  y: 58,  z: -540, label: 'GLIDESLOPE' },
      { x: 0,    y: 42,  z: -330, label: 'FINAL GATE' },
    ],
  },
];

// West of coastX(z) is land.
export function coastX(z) {
  return (
    410 +
    Math.sin(z * 0.0021) * 145 +
    Math.cos(z * 0.0048 - 0.6) * 75 +
    (z > 980 && z < 1520 ? Math.sin(((z - 980) / 540) * Math.PI) * 170 : 0) -
    (z > 1480 ? (z - 1480) * 0.65 : 0)
  );
}

export function riverCenterZ(x) {
  return 1180 + Math.sin(x * 0.0034 + 0.5) * 160 + Math.cos(x * 0.0072) * 55;
}

export function riverHalfWidth(x) {
  return x > 180 ? 54 + (x - 180) * 0.22 : 46 + Math.sin(x * 0.004) * 10;
}

/** Deterministic terrain elevation (meters): 0 on sea/river/runway/valley, rising on inland mountain ridge. */
export function terrainHeight(x, z) {
  if (x > coastX(z) - 25) return 0;
  if (Math.abs(x - RUNWAY.x) < 120 && z > -260 && z < 650) return 0;
  if (Math.abs(z - riverCenterZ(x)) < 140) return 0;
  let h = 0;
  // Western inland mountain ridge (x < -1020)
  if (x < -1020) {
    const t = Math.min(1, (-1020 - x) / 360);
    h = Math.max(h, t * (62 + Math.sin(z * 0.0042) * 28 + Math.cos(z * 0.009) * 14));
  }
  // Northern coastal mountain ridge (z > 1920)
  if (z > 1920 && x < 240) {
    const t = Math.min(1, (z - 1920) / 360);
    h = Math.max(h, t * (58 + Math.cos(x * 0.0045) * 24));
  }
  return Math.max(0, h);
}

export function buildCourseWorld(courseIndex, random) {
  const def = COURSE_DEFS[courseIndex] ?? COURSE_DEFS[0];
  const theme = def.theme;
  const fieldPalette = FIELD_COLORS[theme.id] ?? FIELD_COLORS.morning;

  const coastSamples = [];
  for (let z = -1900; z <= 2300; z += 110) {
    coastSamples.push([coastX(z), z]);
  }
  const landPoly = [];
  for (let i = 0; i < coastSamples.length; i += 1) {
    landPoly.push([coastSamples[i][0], 0, coastSamples[i][1]]);
  }
  landPoly.push([-2400, 0, 2300], [-2400, 0, -1900]);

  const beachStrips = [];
  const surfStrips = [];
  for (let i = 0; i < coastSamples.length - 1; i += 1) {
    const [x0, z0] = coastSamples[i];
    const [x1, z1] = coastSamples[i + 1];
    beachStrips.push([
      [x0 - 34, 0, z0],
      [x0 + 24, 0, z0],
      [x1 + 24, 0, z1],
      [x1 - 34, 0, z1],
    ]);
    surfStrips.push([
      [x0 + 20, 0, z0],
      [x0 + 52, 0, z0],
      [x1 + 52, 0, z1],
      [x1 + 20, 0, z1],
    ]);
  }

  const islandCenter = { x: 1090, z: 1060 };
  const islandPoly = [];
  const islandBeach = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const r = 105 + Math.sin(a * 3 + 0.5) * 28;
    islandPoly.push([islandCenter.x + Math.cos(a) * r, 0, islandCenter.z + Math.sin(a) * r * 1.2]);
    islandBeach.push([islandCenter.x + Math.cos(a) * (r + 18), 0, islandCenter.z + Math.sin(a) * (r + 18) * 1.2]);
  }

  const fields = [];
  const gridCols = [-1450, -1160, -880, -610, -350, -120, 75, 290, 480];
  const gridRows = [-1160, -880, -610, -360, -140, 80, 320, 560, 820, 1460, 1740];
  for (let r = 0; r < gridRows.length - 1; r += 1) {
    for (let c = 0; c < gridCols.length - 1; c += 1) {
      const x0 = gridCols[c] + 10;
      const x1 = gridCols[c + 1] - 10;
      const z0 = gridRows[r] + 10;
      const z1 = gridRows[r + 1] - 10;
      const cx = (x0 + x1) * 0.5;
      const cz = (z0 + z1) * 0.5;
      // Keep clear of coastline, runway/hangar apron, and river channel
      if (x1 > coastX(cz) - 52) continue;
      if (x0 < 78 && x1 > -118 && z1 > -55 && z0 < 510) continue;
      if (Math.abs(cz - riverCenterZ(cx)) < 135) continue;

      const skew = (random() - 0.5) * 24;
      const color = fieldPalette[Math.floor(random() * fieldPalette.length)];
      const stripe = random() > 0.42;
      fields.push({
        poly: [
          [x0, 0, z0],
          [x1, 0, z0 + skew],
          [x1, 0, z1 + skew],
          [x0, 0, z1],
        ],
        color,
        stripe,
        cx,
        cz,
      });
    }
  }

  const riverSegments = [];
  const riverXs = [];
  for (let x = -1700; x <= 580; x += 95) riverXs.push(x);
  for (let i = 0; i < riverXs.length - 1; i += 1) {
    const x0 = riverXs[i], x1 = riverXs[i + 1], z0 = riverCenterZ(x0), z1 = riverCenterZ(x1);
    const w0 = riverHalfWidth(x0), w1 = riverHalfWidth(x1);
    riverSegments.push({
      bank: [[x0, 0, z0 - w0 - 12], [x1, 0, z1 - w1 - 12], [x1, 0, z1 + w1 + 12], [x0, 0, z0 + w0 + 12]],
      water: [[x0, 0, z0 - w0], [x1, 0, z1 - w1], [x1, 0, z1 + w1], [x0, 0, z0 + w0]],
      highlight: [[x0, 0, z0 - w0 * 0.22], [x1, 0, z1 - w1 * 0.22], [x1, 0, z1 + w1 * 0.22], [x0, 0, z0 + w0 * 0.22]],
    });
  }

  const props = [];
  const lhZ = 1265, lhX = coastX(lhZ) - 18;
  props.push({ type: 'lighthouse', x: lhX, y: 0, z: lhZ, scale: 1.15 });
  props.push({ type: 'bridge', x: -460, y: 0, z: riverCenterZ(-460), span: 118, yaw: 0 });
  props.push({ type: 'tower', x: -78, y: 0, z: 225, scale: 1 });
  props.push({ type: 'hangar', x: -84, y: 0, z: 145, scale: 1.05 });
  props.push({ type: 'hangar', x: -84, y: 0, z: 85, scale: 0.9 });
  props.push({ type: 'windsock', x: 52, y: 0, z: 120, scale: 1 });

  const roofs = ['#c85440', '#3d5a78', '#b86e3b', '#8f473e', '#4b6b5c'];
  [[220,960],[265,975],[305,955],[240,1008],[288,1018],[332,995],[195,998],[260,932],[315,920],[352,962],[212,922],[176,958]].forEach(([hx, hz], i) => {
    props.push({ type: 'house', x: hx, y: 0, z: hz, scale: 0.85 + (i % 3) * 0.16, roof: roofs[i % roofs.length] });
  });
  props.push({ type: 'steeple', x: 268, y: 0, z: 985, scale: 1.1 });

  for (let row = 0; row < 5; row += 1) {
    for (let lot = 0; lot < 7; lot += 1) {
      const x = 129 + lot * 45 + (row * 17 + lot * 7) % 19;
      const z = 854 + row * 49 + (lot * 13 % 17);
      if (props.some(prop => Math.hypot(prop.x - x, prop.z - z) < 24)) continue;
      props.push({ type: 'house', x, y: 0, z, scale: 0.78 + (lot * 3 + row) % 5 * 0.13, roof: roofs[(lot + row * 2) % roofs.length] });
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const z = 876 + i * 9, x = 427 + i % 3 * 13;
    props.push({ type: 'tree', x, y: 0, z, tint: i % 2, scale: 0.55 + (i * 3 % 5) * 0.12 });
  }
  for (const [x, z] of [[-130, 58], [-130, 131], [-145, 282], [136, 50], [151, 88], [120, 292]]) {
    props.push({ type: 'tree', x, y: 0, z, tint: 0.5, scale: 0.7 });
  }

  [[-1480,1540,1.45],[-1440,1120,1.3],[-1500,680,1.5],[-1460,180,1.35],[-1420,-340,1.25],[-960,2180,1.4],[-480,2240,1.55],[-40,2200,1.35],[240,2140,1.15]].forEach(([mx, mz, sc]) => {
    props.push({ type: 'mountain', x: mx, y: 0, z: mz, scale: sc });
  });
  [[lhX + 26, lhZ + 52, 1.3], [lhX + 18, lhZ - 48, 1.05], [coastX(1480) + 12, 1480, 1.4], [coastX(520) + 14, 520, 1.1], [islandCenter.x - 16, islandCenter.z + 10, 1.5]].forEach(([cx, cz, sc]) => {
    props.push({ type: 'cliff', x: cx, y: 0, z: cz, scale: sc });
  });
  [[-460,440],[-780,640],[-560,-240],[-260,-520],[220,-490],[340,-180],[-740,220],[-300,740]].forEach(([fx, fz], i) => {
    props.push({ type: 'barn', x: fx, y: 0, z: fz, scale: 0.9 + (i % 3) * 0.14 });
  });
  [[-680,90],[-720,-20],[-640,-140],[430,-340],[490,-250],[380,-430]].forEach(([tx, tz], i) => {
    props.push({ type: 'turbine', x: tx, y: 0, z: tz, phase: i * 1.1 });
  });
  for (let i = 0; i < 95; i += 1) {
    const tx = -1250 + random() * 1720, tz = -960 + random() * 2600;
    if (tx > coastX(tz) - 42 || (tx > -125 && tx < 110 && tz > -80 && tz < 540) || Math.abs(tz - riverCenterZ(tx)) < 85) continue;
    props.push({ type: 'tree', x: tx, y: 0, z: tz, scale: 0.78 + random() * 0.72, tint: random() });
  }
  for (let i = 0; i < 16; i += 1) {
    const sz = -650 + random() * 2350, sx = coastX(sz) + 120 + random() * 540;
    props.push({ type: 'boat', x: sx, y: 0, z: sz, scale: 0.8 + random() * 0.55, phase: random() * Math.PI * 2, sailColor: i % 3 === 0 ? '#f7f3e8' : i % 3 === 1 ? '#ffe3b3' : '#e8f5ff' });
  }

  const clouds = [];
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2 + random() * 0.25, dist = 520 + random() * 1550;
    clouds.push({ x: Math.cos(a) * dist, y: 195 + random() * 145, z: 350 + Math.sin(a) * dist, size: 62 + random() * 58, puffs: 3 + Math.floor(random() * 3), seed: random() * 10 });
  }
  const horizonRidge = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2, w = Math.max(0, 0.5 - Math.sin(a) * 0.55);
    horizonRidge.push({ angle: a, hFar: w * (26 + Math.sin(a * 5 + 1.2) * 14 + Math.cos(a * 11) * 8), hNear: w * (15 + Math.cos(a * 7 + 0.4) * 9 + Math.sin(a * 13) * 5) });
  }
  return { def, theme, rings: makeRings(def.rings), landPoly, beachStrips, surfStrips, islandPoly, islandBeach, fields, riverSegments, props, clouds, horizonRidge };
}
