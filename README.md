# StateVisualizer

An interactive VS Code extension for visualizing quantum states in real time with step-through execution for both **Q#** (`.qs`) and **Python / Qiskit** (`.py`).

StateVisualizer provides four synchronized representations of quantum states, live in-editor line stepping, interactive 3D controls, symbolic LaTeX / KaTeX mathematical formatting, and high-resolution export.

---

## Features

### 1. Four Interactive Quantum Visualizations
Switch seamlessly between four distinct visualization modes via the top navigation tabs:

- **Statevector View**:
  - Interactive histogram of basis state amplitudes and probabilities.
  - Toggle between **Amplitude** ($|c_i|$) and **Probability** ($|c_i|^2$) display modes.
  - Color-coded quantum phase legend mapped from $0$ to $2\pi$.
  - Smooth polar lerp animation transitions when stepping between states.
  - Hover tooltips detailing basis states, binary indices, magnitude, probability, and phase in radians/$\pi$.

- **Bloch Spheres View**:
  - Individual 3D Bloch sphere rendered for each qubit in the system.
  - Automatically calculates single-qubit reduced density matrices via partial trace.
  - 3D state vector arrows showing expectation values $(\langle\sigma_x\rangle, \langle\sigma_y\rangle, \langle\sigma_z\rangle)$.
  - Standard basis state pole labels ($|0\rangle, |1\rangle, |+\rangle, |-\rangle, |+i\rangle, |-i\rangle$).
  - Hover tooltips displaying spherical angles $(\theta, \phi)$ and Cartesian coordinates.

- **Q-Sphere View**:
  - Multi-qubit 3D spherical representation where basis states are organized along latitude rings by **Hamming weight**.
  - Node sizes proportional to basis state probability $|c_i|^2$.
  - Spoke and node colors mapped to quantum phase ($0 \to 2\pi$).
  - Full 3D mouse orbit navigation (click and drag to rotate the sphere in 3D).
  - Hover inspection over nodes and spokes showing basis state, probability, and phase.

- **Density Matrix View**:
  - Visualizes the full density operator $\rho = |\psi\rangle\langle\psi|$.
  - Switchable between **2D Heatmap Grids** and interactive **3D Column Stages**.
  - Separate synchronized panels for **Real Part** ($\text{Re}[\rho]$) and **Imaginary Part** ($\text{Im}[\rho]$).
  - Blue-White-Red diverging colormap centered at 0 (range: $[-1.0, +1.0]$).
  - Real-time statistics badge computing **Trace** ($\text{Tr}(\rho)$) and **Purity** ($\text{Tr}(\rho^2)$).
  - Hover tooltips showing matrix element coordinates $\rho_{ij}$, exact values, and basis states $|i\rangle\langle j|$.

---

### 2. Real-Time Dirac Mathematical Formula (KaTeX)
- Live Dirac bra-ket notation rendered in the panel footer:
  $$|\psi\rangle = \frac{1}{\sqrt{2}}|00\rangle + \frac{1}{\sqrt{2}}|11\rangle$$
- **Symbolic recognition**: Automatically formats exact coefficients into clean radicals (e.g. $\frac{1}{\sqrt{2}}$, $\frac{1}{\sqrt{3}}$, $\frac{1}{\sqrt{n}}$), rational fractions ($\frac{1}{2}$, $\frac{3}{4}$, $\frac{m}{n}$), and complex phases ($i$, $\frac{i}{\sqrt{2}}$).
- **One-Click Copy**: Click the copy button next to the formula to instantly copy the LaTeX string to your clipboard.

---

### 3. Dual-Language Client-Side Runtimes
StateVisualizer runs 100% locally within VS Code without requiring external services:

- **Q# (`.qs`)**:
  - Powered by the official Microsoft Q# WebAssembly compiler (`qsc_wasm_bg.wasm`) and debug service (`qsharp-lang`).
  - Captures quantum state snapshots at each execution step.
- **Python / Qiskit (`.py`)**:
  - Built-in zero-dependency JavaScript Python AST parser (`@lezer/python`) and statevector simulator.
  - Supports standard gates: `h`, `x`, `y`, `z`, `s`, `sdg`, `t`, `tdg`, `sx`, `rx`, `ry`, `rz`, `p`, `u`, `cx`/`cnot`, `cz`, `swap`, `ccx`/`toffoli`, `cswap`/`fredkin`, `mcx`.
  - Supports loops (`for ... in range(...)`), nested loops, helper functions, circuit parameters, and variable assignments.

---

### 4. Interactive Execution & Controls
- **Step-by-Step Line Inspection (`Shift+Enter`)**:
  - Execute up to the current line to watch the state evolve gate by gate.
  - In-editor line highlight decoration badge (`◀ Visualized State`) marks the currently inspected line.
  - Automatically advances the cursor to the next line for rapid stepping.
- **Live Updates & Auto-Pause**:
  - Automatically re-simulates and updates the visualization as you type.
  - Includes a **Live** toggle button in the footer.
  - **Auto-Pause Safety**: Automatically pauses live updates when circuits reach 5 or more qubits to keep your editor fast and responsive.
- **High-Resolution PNG Export**:
  - Click **Export** in the footer to render and save high-resolution PNG images directly to your active file directory or workspace root with timestamped filenames (`<visualization>_YYYY-MM-DD_HH-mm-ss.png`).

---

## How To Use in VS Code

### 1. Opening the Visualizer
Open any `.qs` or `.py` file containing a quantum operation or circuit. You can launch the visualizer in four convenient ways:

1. **CodeLens (Fastest)**:
   - In **Q#**: Click the **`State`** CodeLens link directly above your `@EntryPoint` or `Main` operation.
   - In **Python**: Click the **`State`** CodeLens link directly above your `circuit = QuantumCircuit(...)` declaration.
2. **Editor Title Bar**:
   - Click the **Graph icon** (`$(graph)`) in the top-right corner of the editor tab group.
3. **Editor Context Menu**:
   - Right-click anywhere in your code and choose **`Qsphere: Open Quantum Visualizer`**.
4. **Command Palette**:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS).
   - Type and select **`Qsphere: Open Quantum Visualizer`**.

The visualizer panel opens beside your active code editor.

---

### 2. Stepping Line-by-Line
1. Place your cursor on any line inside your Q# operation or Python quantum circuit.
2. Press **`Shift+Enter`** (or right-click and select **`Qsphere: Step to Current Line`**).
3. The editor marks the evaluated line with an in-editor highlight badge (`◀ Visualized State`), and the visualizer immediately updates to show the quantum state at that specific moment.
4. Your cursor advances to the next executable line—keep pressing `Shift+Enter` to step through your algorithm sequentially!

---

### 3. Interacting with the Visualizer
- **Switch Modes**: Click **Statevector**, **Bloch**, **Q-sphere**, or **Density Matrix** tabs at the top.
- **Rotate 3D Views**: In the **Q-sphere** and **Density Matrix 3D** views, click and drag with your mouse to orbit in 3D.
- **Inspect Amplitudes vs. Probabilities**: In Statevector view, click the **Amplitude** or **Probability** buttons on the bottom bar.
- **Inspect Density Matrix 2D vs. 3D**: In Density Matrix view, toggle between **2D** heatmaps and **3D** columns.
- **Pause / Resume Live Execution**: Click the **Live** button in the footer.
- **Copy LaTeX Formula**: Click the copy icon in the footer next to the rendered state equation.
- **Export Images**: Click **Export** to save a snapshot image of the current visualization.

---

## Commands & Keybindings Reference

| Command | Title | Default Shortcut | Where Available |
| :--- | :--- | :--- | :--- |
| `qsphere.openVisualizer` | `Qsphere: Open Quantum Visualizer` | — | CodeLens (`State`), Editor Title Bar, Context Menu, Command Palette |
| `qsphere.inspectCurrentLine` | `Qsphere: Step to Current Line` | `Shift+Enter` | Active editor (`.qs`, `.py`), Context Menu, Command Palette |
| `qsphere.replayAnimation` | `Qsphere: Replay Animation` | — | Command Palette |

---

## Project Map

```text
StateVisualizer/
├── assets/
│   └── wasm/
│       └── qsc_wasm_bg.wasm            # Q# compiler WebAssembly binary
├── dist/                               # Bundled webview output (esbuild)
│   ├── katex/                          # KaTeX styles and web fonts
│   ├── qiskitRuntime.bundle.js         # Bundled Python / Qiskit AST simulator
│   ├── qsharpRuntime.bundle.js         # Bundled Q# WASM runtime
│   └── webview.bundle.js               # Bundled webview scripts & Three.js
├── samples/
│   └── test.qs                         # Sample Q# program for testing
├── scripts/
│   └── build-webview.mjs               # Esbuild bundling script
├── src/
│   ├── extension.ts                    # VS Code extension host (commands, CodeLens, line decorations)
│   └── webview/                        # Webview visualizer source
│       ├── index.html                  # Visualizer DOM layout and containers
│       ├── styles.css                  # UI stylesheets and dark-mode themes
│       ├── main.js                     # Main coordinator (tabs, messages, status, render loop)
│       ├── math/
│       │   ├── index.js                # Math module exports
│       │   ├── math.js                 # 3D projection, rotations, complex algebra
│       │   └── quantum.js              # KaTeX Dirac formatter, Bloch/Q-sphere math
│       ├── render/
│       │   ├── hoverTooltip.js         # Shared canvas hover tooltip helper
│       │   └── phaseLegend.js          # Shared phase legend canvas renderer
│       ├── runtime/
│       │   ├── qiskitRuntime.js        # Pure JS Qiskit AST parser & gate simulator
│       │   ├── qsharpRuntime.js        # Q# WebAssembly debugger & state capture
│       │   └── qsharpRuntimeUi.js      # Q# parsing wrapper & error handling
│       └── visualizations/             # Modular visualization plugins
│           ├── index.js                # Visualization plugin registry & loader
│           ├── bloch.js                # Multi-qubit Bloch spheres renderer
│           ├── densityMatrix.js        # 2D heatmap & 3D bar density matrix renderer
│           ├── qsphere.js              # 3D Q-sphere renderer & orbit controls
│           └── statevector.js          # Statevector histogram renderer & lerp animation
├── test/                               # Comprehensive unit test suite
│   ├── densitymatrix.test.mjs          # Density matrix calculations and layout tests
│   ├── export.test.mjs                 # Canvas export and file generation tests
│   ├── math.test.mjs                   # Vector math, KaTeX formatting, Bloch projection tests
│   ├── qiskitRuntime.test.mjs          # Qiskit AST parsing, gate simulation, loops & functions tests
│   └── qsharpRuntime.test.mjs          # Q# snapshot parsing, stepping, and error handling tests
├── package.json
└── tsconfig.json
```

---

## Build & Development

### Prerequisites
- Node.js 18+
- npm 9+

### Scripts

- **Compile**: Bundles webview scripts and compiles TypeScript
  ```bash
  npm run compile
  ```
- **Bundle Webview**: Bundles webview runtime and visualizer scripts into `dist/` using esbuild
  ```bash
  npm run bundle:webview
  ```
- **Watch Mode**: Continuously compiles TypeScript files on save
  ```bash
  npm run watch
  ```
- **Run Tests**: Executes the complete Node.js test suite across math, runtimes, and visualizations
  ```bash
  npm test
  ```
