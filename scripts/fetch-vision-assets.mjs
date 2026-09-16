/**
 * Puts the MediaPipe vision assets in public/ without committing ~37MB of
 * binaries to the repository.
 *
 * - the wasm runtime is copied out of node_modules (@mediapipe/tasks-vision),
 *   so it needs no network at all
 * - the hand landmarker model is downloaded from Google's official storage
 *
 * Both are optional at build time: useHandLandmarker falls back to the official
 * CDN at runtime and says so in the UI when it does. A failure here is a warning,
 * never a broken install.
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WASM_SRC = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_DEST = join(root, 'public', 'mediapipe', 'wasm');
const MODEL_DEST = join(root, 'public', 'models', 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const mb = bytes => (bytes / 1024 / 1024).toFixed(1) + 'MB';

function copyWasm() {
  if (!existsSync(WASM_SRC)) {
    console.warn('[insign] @mediapipe/tasks-vision is not installed yet — skipping the wasm copy.');
    return;
  }
  mkdirSync(WASM_DEST, { recursive: true });
  let copied = 0;
  for (const file of readdirSync(WASM_SRC)) {
    const to = join(WASM_DEST, file);
    if (existsSync(to) && statSync(to).size === statSync(join(WASM_SRC, file)).size) continue;
    copyFileSync(join(WASM_SRC, file), to);
    copied++;
  }
  console.log(copied ? `[insign] copied ${copied} wasm file(s) into public/mediapipe/wasm.`
                     : '[insign] wasm runtime already in place.');
}

async function fetchModel() {
  if (existsSync(MODEL_DEST) && statSync(MODEL_DEST).size > 1_000_000) {
    console.log(`[insign] hand landmarker model already in place (${mb(statSync(MODEL_DEST).size)}).`);
    return;
  }
  mkdirSync(dirname(MODEL_DEST), { recursive: true });
  console.log('[insign] downloading the hand landmarker model…');
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(MODEL_DEST));
  console.log(`[insign] model saved to public/models (${mb(statSync(MODEL_DEST).size)}).`);
}

copyWasm();
try {
  await fetchModel();
} catch (error) {
  console.warn(
    `[insign] could not download the hand landmarker model (${error.message}).\n` +
    '         The sign translator will load it from the official CDN instead and\n' +
    '         will say so in the UI. Re-run `npm run assets` when you are online.'
  );
}
