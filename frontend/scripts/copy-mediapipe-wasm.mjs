// Copies the MediaPipe Tasks Vision WASM runtime into public/mediapipe/wasm so it
// is served from our own origin (CSP 'self'; no third-party CDN at runtime).
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const target = join(root, 'public', 'mediapipe', 'wasm')
// FilesetResolver picks the SIMD build when supported, else the no-SIMD one.
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

mkdirSync(target, { recursive: true })
for (const file of files) copyFileSync(join(source, file), join(target, file))
console.log(`MediaPipe WASM copied to ${target}`)
