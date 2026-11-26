// SKYWARD RINGS — make.fun bounty packaging entrypoint (Node 22+, stdlib only).
// Runs a strict pre-flight validation pass on the repository tree (vendor library,
// game/ caps & index.html limit, shots.json manifest, and screenshots/ magic/size caps)
// before staging game/, screenshots/, and dossier.json into MAKEFUN_OUTPUT_DIR (/output).

import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const INDEX_HTML_MAX_BYTES = 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function fail(message: string): never {
  process.stderr.write(`[skyward-rings preflight FAIL] ${message}\n`);
  process.exit(1);
}

function hasMagic(buf: Uint8Array, magic: readonly number[]): boolean {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

function validateVendor(root: string): void {
  const vendorPath = join(root, 'vendor', 'makefun-game.ts');
  let st;
  try {
    st = lstatSync(vendorPath);
  } catch {
    fail(`Required vendored library missing: ${vendorPath}`);
  }
  if (!st.isFile() || st.size === 0) {
    fail(`vendor/makefun-game.ts must be a non-empty plain file (got size=${st.size})`);
  }
}

function validateGameTree(gameDir: string): { entries: number; totalBytes: number; indexBytes: number } {
  let rootStat;
  try {
    rootStat = lstatSync(gameDir);
  } catch {
    fail(`game/ directory missing at ${gameDir}`);
  }
  if (!rootStat.isDirectory()) fail('game/ exists but is not a directory');

  let entries = 0;
  let totalBytes = 0;
  let indexBytes = -1;
  const stack: string[] = [''];

  while (stack.length > 0) {
    const rel = stack.pop()!;
    const abs = rel === '' ? gameDir : join(gameDir, rel);
    const items = readdirSync(abs, { withFileTypes: true });
    for (const item of items) {
      const childRel = rel === '' ? item.name : `${rel}/${item.name}`;
      const pathBytes = Buffer.byteLength(childRel, 'utf8');
      if (pathBytes > CAPS.game_path_max_bytes) {
        fail(`game/${childRel} path length ${pathBytes} exceeds ${CAPS.game_path_max_bytes} bytes`);
      }

      const childAbs = join(gameDir, childRel);
      const st = lstatSync(childAbs);
      entries += 1;
      if (entries > CAPS.game_max_files) {
        fail(`game/ holds ${entries} entries, exceeding cap of ${CAPS.game_max_files}`);
      }

      if (st.isDirectory()) {
        stack.push(childRel);
      } else if (st.isFile()) {
        totalBytes += st.size;
        if (totalBytes > CAPS.game_max_bytes) {
          fail(`game/ total size ${totalBytes} bytes exceeds 48 MiB cap (${CAPS.game_max_bytes})`);
        }
        if (childRel === 'index.html') indexBytes = st.size;
      } else {
        fail(`game/${childRel} is a symlink or special file (only plain files and directories allowed)`);
      }
    }
  }

  if (indexBytes < 0) fail('game/index.html is missing');
  if (indexBytes === 0) fail('game/index.html is empty');
  if (indexBytes > INDEX_HTML_MAX_BYTES) {
    fail(`game/index.html is ${indexBytes} bytes, exceeding 1 MiB cap (${INDEX_HTML_MAX_BYTES})`);
  }
  return { entries, totalBytes, indexBytes };
}

function validateScreenshots(root: string): { count: number; totalBytes: number } {
  const shotsJsonPath = join(root, 'shots.json');
  let rawManifest: string;
  try {
    rawManifest = readFileSync(shotsJsonPath, 'utf8');
  } catch {
    fail(`shots.json missing or unreadable at ${shotsJsonPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
  } catch (err) {
    fail(`shots.json failed to parse as JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('shots.json must be a non-empty JSON array of { name, query } entries');
  }
  if (parsed.length > CAPS.screenshots.max) {
    fail(`shots.json lists ${parsed.length} shots, exceeding cap of ${CAPS.screenshots.max}`);
  }

  const manifestNames = new Set<string>();
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i] as Record<string, unknown> | null;
    if (!entry || typeof entry.name !== 'string' || entry.name.trim() === '' || typeof entry.query !== 'string') {
      fail(`shots.json[${i}] must be an object with non-empty string "name" and string "query"`);
    }
    if (manifestNames.has(entry.name)) fail(`shots.json has duplicate screenshot name "${entry.name}"`);
    manifestNames.add(entry.name);
  }

  const shotsDir = join(root, 'screenshots');
  let dirStat;
  try {
    dirStat = lstatSync(shotsDir);
  } catch {
    fail(`screenshots/ directory missing at ${shotsDir}`);
  }
  if (!dirStat.isDirectory()) fail('screenshots/ exists but is not a directory');

  const diskEntries = readdirSync(shotsDir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  if (diskEntries.length === 0) fail('screenshots/ contains no image files');
  if (diskEntries.length > CAPS.screenshots.max) {
    fail(`screenshots/ contains ${diskEntries.length} files, exceeding cap of ${CAPS.screenshots.max}`);
  }

  const diskNames = new Set<string>();
  let totalBytes = 0;
  for (const e of diskEntries) {
    const abs = join(shotsDir, e.name);
    const st = lstatSync(abs);
    if (!st.isFile()) fail(`screenshots/${e.name} is not a regular file`);
    if (st.size === 0) fail(`screenshots/${e.name} is empty (0 bytes)`);
    if (st.size > CAPS.screenshots.max_bytes) {
      fail(`screenshots/${e.name} is ${st.size} bytes, exceeding 256 KiB cap (${CAPS.screenshots.max_bytes})`);
    }
    const bytes = readFileSync(abs);
    if (!hasMagic(bytes, JPEG_MAGIC) && !hasMagic(bytes, PNG_MAGIC)) {
      fail(`screenshots/${e.name} does not have valid JPEG or PNG header magic bytes`);
    }
    diskNames.add(e.name);
    totalBytes += st.size;
  }

  for (const name of manifestNames) {
    if (!diskNames.has(name)) {
      fail(`shots.json references "${name}", which is missing from screenshots/`);
    }
  }
  return { count: diskEntries.length, totalBytes };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// 1. Pre-flight verification before writing any output
validateVendor(here);
const gameReport = validateGameTree(join(here, 'game'));
const shotsReport = validateScreenshots(here);

// 2. Stage game/ and screenshots/ into output directory
mkdirSync(out, { recursive: true });
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// 3. Emit canonical makefun/dossier/v1 via the unmodified vendored helper
const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `[skyward-rings] staged game (${gameReport.entries} entries, ${gameReport.totalBytes} B), ` +
    `${shotsReport.count} screenshots (${shotsReport.totalBytes} B), dossier (${dossier.length} B) -> ${out}\n`,
);
