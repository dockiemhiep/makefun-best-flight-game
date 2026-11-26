export const VIEW = {
  width: 1280,
  height: 720,
  horizonX: 640,
  horizonY: 304,
  focal: 760,
  panelHeight: 126,
};

export const STEP = 1 / 60;
export const M_TO_FT = 3.28084;
export const MS_TO_KTS = 1.94384;
export const MS_TO_FPM = 196.8504;

export const RUNWAY = {
  x: 0,
  zStart: 0,
  zEnd: 460,
  width: 44,
  tdzStart: 58,
  tdzEnd: 230,
  aimZ: 125,
  papiZ: 115,
  papiX: -34,
  glideslopeDeg: 5.4,
};

export const FLIGHT = {
  minSpeed: 0,
  maxSpeed: 68,        // ~132 kts Vne
  cruiseSpeed: 53,     // ~103 kts
  rotateSpeed: 27,     // ~52 kts Vr
  stallClean: 23.0,    // ~45 kts clean
  stallFlap1: 20.0,    // ~39 kts approach flaps
  stallFlap2: 17.5,    // ~34 kts landing flaps
  thrustMax: 11.4,
  dragBase: 0.0031,
  dragGear: 0.0012,
  dragFlap: 0.0019,    // per flap notch
  dragBrake: 14.5,     // ground wheel braking m/s^2
  dragAirbrake: 4.8,
  rollMax: 0.92,       // ~53 deg max bank
  rollRate: 2.35,
  rollAutoLevel: 0.55,
  pitchMax: 0.56,      // ~32 deg climb
  pitchMin: -0.44,     // ~-25 deg dive
  pitchRate: 1.48,
  pitchTrimRate: 0.45,
  turnFactor: 0.72,
  gravity: 9.81,
  groundRollSteer: 0.62,
  throttleRate: 0.68,
  stallFailTime: 2.5,
};

export const RING = {
  radius: 23,
  bullseyeRadius: 9.5,
  passPoints: 200,
  bullseyeBonus: 100,
  streakStep: 25,
  timeBonusSec: 3,
  skipDistance: 135,
};

export const LANDING = {
  maxSafeFpm: 580,
  maxSafeKts: 72,
  maxSafeRoll: 0.52,
  butterFpm: 120,
  smoothFpm: 240,
  firmFpm: 420,
  tdzBonus: 500,
  centerlineBonus: 250,
  smoothMax: 1000,
  timeBonusMax: 800,
};

export const THEMES = {
  morning: {
    id: 'morning',
    skyTop: '#192f58',
    skyMid: '#626d98',
    skyHorizon: '#ffd0a0',
    sunColor: '#fff0b6',
    sunHalo: 'rgba(255, 166, 102, 0.34)',
    sunAzimuth: 0.22,
    sunElevation: 0.105,
    seaDeep: '#164e60',
    seaNear: '#43878e',
    seaHorizon: '#cdaaad',
    landBase: '#68794a',
    landFar: '#ac9a62',
    beach: '#d0aa76',
    surf: 'rgba(244, 252, 255, 0.72)',
    riverDeep: '#306478',
    riverShallow: '#528b92',
    mountainFar: '#9b8393',
    mountainNear: '#635b7d',
    cloudTop: '#ffe6bf',
    cloudShadow: '#9890ac',
    haze: 'rgba(255, 196, 143, 0.26)',
    ringActive: '#ffbb44',
    ringActiveGlow: 'rgba(255, 206, 74, 0.42)',
    ringNext: '#86efe4',
    ringDone: '#5be38c',
    hud: '#a6ffdc',
    hudDim: 'rgba(105, 247, 196, 0.52)',
  },
  challenge: {
    id: 'challenge',
    skyTop: '#174d7d',
    skyMid: '#4c94bf',
    skyHorizon: '#cfe6ea',
    sunColor: '#fff4d1',
    sunHalo: 'rgba(245, 236, 196, 0.3)',
    sunAzimuth: 1.35,
    sunElevation: 0.28,
    seaDeep: '#0f4c6e',
    seaNear: '#196f8f',
    seaHorizon: '#7db7c4',
    landBase: '#4d824b',
    landFar: '#6d9470',
    beach: '#dec798',
    surf: 'rgba(240, 250, 255, 0.78)',
    riverDeep: '#166087',
    riverShallow: '#3d95b0',
    mountainFar: '#597f99',
    mountainNear: '#3e667c',
    cloudTop: '#f6fafd',
    cloudShadow: '#a6c0d4',
    haze: 'rgba(195, 224, 232, 0.44)',
    ringActive: '#ffbe3d',
    ringActiveGlow: 'rgba(255, 186, 56, 0.44)',
    ringNext: '#6de8e0',
    ringDone: '#61e691',
    hud: '#78f5d6',
    hudDim: 'rgba(120, 245, 214, 0.52)',
  },
  sunset: {
    id: 'sunset',
    skyTop: '#23285c',
    skyMid: '#944a6d',
    skyHorizon: '#f8a566',
    sunColor: '#ffe08a',
    sunHalo: 'rgba(255, 152, 74, 0.45)',
    sunAzimuth: 4.55,
    sunElevation: 0.14,
    seaDeep: '#1f365c',
    seaNear: '#39557a',
    seaHorizon: '#d98c68',
    landBase: '#4b6d3f',
    landFar: '#6e6a63',
    beach: '#cfa97c',
    surf: 'rgba(255, 224, 192, 0.62)',
    riverDeep: '#2e4e73',
    riverShallow: '#9e7a72',
    mountainFar: '#6b5775',
    mountainNear: '#4d415c',
    cloudTop: '#ffd09c',
    cloudShadow: '#6d5478',
    haze: 'rgba(242, 162, 108, 0.36)',
    ringActive: '#ffde59',
    ringActiveGlow: 'rgba(255, 204, 68, 0.5)',
    ringNext: '#ff8a5c',
    ringDone: '#64f09a',
    hud: '#7cf7c9',
    hudDim: 'rgba(124, 247, 201, 0.55)',
  },
};

export const FIELD_COLORS = {
  morning: ['#bfa459', '#828c51', '#a5a05e', '#986d49', '#587249', '#b3a264', '#7d8650', '#b58d5c'],
  challenge: ['#cbb05a', '#558b47', '#6c9952', '#876847', '#426e3c', '#b7aa54', '#63854c', '#987c4e'],
  sunset: ['#a88043', '#4e733b', '#627d42', '#73533b', '#3b5933', '#9e8442', '#576c3f', '#826342'],
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif';
export const MONO = '"SF Mono", "JetBrains Mono", ui-monospace, "Cascadia Mono", monospace';
export const BEST_PREFIX = 'skyward-rings.best.v1.';
