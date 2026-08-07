# Qsphere

A small VS Code extension for visualizing Q# quantum state snapshots.

It currently shows:

- Bloch spheres, one per qubit
- A Q-sphere view for the full system state
- Hover information for Bloch arrows and Q-sphere states
- Animation replay for captured state changes

## How To Use

Open a `.qs` file in VS Code, then run:

```text
Qsphere: Open Quantum Visualizer
```

The visualizer reads the current Q# operation and displays the captured qubit state.

## Project Map

- `src/package/src/extension.ts` - VS Code extension entry point
- `src/package/src/webview.html` - visualizer HTML
- `src/package/src/webview.css` - visualizer styles
- `src/package/src/script/webview.js` - main browser-side visualizer logic
- `src/package/src/script/qsharpRuntime.js` - Q# parsing and snapshot capture
- `src/package/src/script/blochVector.js` - Bloch vector calculations
- `src/package/src/script/qsphereVector.js` - Q-sphere geometry and colors
- `src/package/src/script/math.js` - shared math and geometry helpers
- `src/package/src/shader` - WebGPU shaders

## Notes

Generated files like `qsharpRuntime.bundle.js` should usually not be edited by hand.
