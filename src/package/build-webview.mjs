import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeEntry = path.join(packageRoot, 'src', 'script', 'qsharpRuntime.js');
const runtimeBundle = path.join(packageRoot, 'src', 'script', 'qsharpRuntime.bundle.js');
const wasmSource = path.join(
    packageRoot,
    'node_modules',
    'qsharp-lang',
    'lib',
    'web',
    'qsc_wasm_bg.wasm'
);
const wasmDirectory = path.join(packageRoot, 'src', 'wasm');
const wasmTarget = path.join(wasmDirectory, 'qsc_wasm_bg.wasm');

await build({
    entryPoints: [runtimeEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    outfile: runtimeBundle,
    legalComments: 'none',
    sourcemap: false
});

await mkdir(wasmDirectory, { recursive: true });
await cp(wasmSource, wasmTarget);
