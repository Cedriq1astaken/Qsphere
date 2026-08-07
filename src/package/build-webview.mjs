import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Bundle qsharp-lang's browser runtime and copy its WASM payload into the local
// webview resources. The hand-written visualizer scripts are loaded separately.
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

// Produce a browser-compatible IIFE for the Q# debugger runtime.
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

// Keep the WASM beside the webview assets so the extension CSP can load it locally.
await mkdir(wasmDirectory, { recursive: true });
await cp(wasmSource, wasmTarget);
