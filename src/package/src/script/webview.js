const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const canvas = document.querySelector('canvas');
const statusText = document.querySelector('#status');
let rotationAngles = [0.3, 0.0, 0.0];

function setStatus(message) {
    statusText.textContent = message;
}

async function loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`);
    }

    return response.text();
}

function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

let pendingCode = null;

async function initWebGPU() {
    let initialArrowData = null;
    const testQsUri = canvas.dataset.testQs || 'test.qs';
    
    if (pendingCode) {
        try {
            const result = await parseQSharp(pendingCode);
            initialArrowData = computeBlochArrow(result);
        } catch (e) {
            console.warn('Could not parse pending Q# code:', e);
        }
    }

    if (!initialArrowData) {
        try {
            const response = await fetch(testQsUri);
            if (response.ok) {
                const code = await response.text();
                const result = await parseQSharp(code);
                initialArrowData = computeBlochArrow(result);
            }
        } catch (e) {
            console.warn('Could not fetch initial Q# file:', e);
        }
    }

    if (!initialArrowData) {
        initialArrowData = computeBlochArrow({ operations: [], qubitsDeclared: 0 });
    }

    if (!navigator.gpu) {
        setStatus('WebGPU is not available in this browser.');
        return undefined;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        setStatus('No WebGPU adapter found.');
        return undefined;
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();

    const mesh = sphere(32, 32);

    const vertexBuffer = device.createBuffer({
        label: "Vertex Buffer",
        size: mesh.positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    const vertexCount = mesh.positions.length / 6;

    device.queue.writeBuffer(vertexBuffer, 0, mesh.positions);

    resizeCanvas();

    function buildProjMatrix() {
        return mult(
            createPerspectiveMatrix(Math.PI / 4, canvas.width / canvas.height, 0.1, 100),
            createTranslationMatrix(0, 0, -3)
        );
    }

    const projMatrix = buildProjMatrix();

    const modelMatrix = rotateMatrix(...rotationAngles, projMatrix);

    const vertexUniformBuffer = device.createBuffer({
        size: modelMatrix.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexUniformBuffer, 0, modelMatrix);

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                },
            },
        ],
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: vertexUniformBuffer,
                },
            },
        ],
    });

    const vertexShaderUri = canvas.dataset.vertexShader || 'shader/vertex.wgsl';
    const fragmentShaderUri = canvas.dataset.fragmentShader || 'shader/fragment.wgsl';
    const arrowShaderUri = canvas.dataset.arrowShader || 'shader/fragment_arrow.wgsl';
    const linesShaderUri = canvas.dataset.linesShader || 'shader/fragment_lines.wgsl';

    const [vertexShader, fragmentShader, arrowFragShader, linesFragShader] = await Promise.all([
        loadShader(vertexShaderUri),
        loadShader(fragmentShaderUri),
        loadShader(arrowShaderUri),
        loadShader(linesShaderUri)
    ]);

    const vertexModule = device.createShaderModule({ code: vertexShader });
    const fragmentModule = device.createShaderModule({ code: fragmentShader });
    const arrowFragModule = device.createShaderModule({ code: arrowFragShader });
    const linesFragModule = device.createShaderModule({ code: linesFragShader });


    const vertexBufferLayout = {
        arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
        attributes: [
            {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3'
            },
            {
                shaderLocation: 1,
                offset: Float32Array.BYTES_PER_ELEMENT * 3,
                format: 'float32x3'
            }
        ]
    };

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    });


    const blendState = {
        color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
        },
        alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
        },
    };


    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });


    const arrowPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: arrowFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });

    const linePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: linesFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'line-list' }
    });

    const lineVertices = buildSphereLines();
    const lineVertexBuffer = device.createBuffer({
        label: 'Line Vertex Buffer',
        size: lineVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    const lineVertexCount = lineVertices.length / 6;
    device.queue.writeBuffer(lineVertexBuffer, 0, lineVertices);


    const arrowVertices = initialArrowData.vertices;
    const arrowVertexBuffer = device.createBuffer({
        label: 'Arrow Vertex Buffer',
        size: arrowVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    const arrowVertexCount = arrowVertices.length / 6;
    device.queue.writeBuffer(arrowVertexBuffer, 0, arrowVertices);

    resizeCanvas();

    context.configure({
        device,
        format,
        alphaMode: 'premultiplied'
    });

    const initialScreenVec = initialArrowData.screenVector || [0, 1, 0];
    const currentVector = [initialScreenVec[0], initialScreenVec[1], initialScreenVec[2]];
    const targetVector = [initialScreenVec[0], initialScreenVec[1], initialScreenVec[2]];
    const stepVectors = initialArrowData.stepVectors || [];

    return {
        device, context, pipeline, vertexBuffer, vertexCount,
        bindGroup, vertexUniformBuffer, projMatrix, buildProjMatrix,
        arrowPipeline, arrowVertexBuffer, arrowVertexCount,
        linePipeline, lineVertexBuffer, lineVertexCount,
        currentVector, targetVector, stepVectors, stepQueue: []
    };
}

function render(state) {
    if (!state) {
        return;
    }

    const commandEncoder = state.device.createCommandEncoder();
    const textureView = state.context.getCurrentTexture().createView();

    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    });


    passEncoder.setPipeline(state.pipeline);
    if (state.bindGroup) {
        passEncoder.setBindGroup(0, state.bindGroup);
    }
    passEncoder.setVertexBuffer(0, state.vertexBuffer);
    passEncoder.draw(state.vertexCount);

    if (state.linePipeline && state.lineVertexBuffer) {
        passEncoder.setPipeline(state.linePipeline);
        passEncoder.setBindGroup(0, state.bindGroup);
        passEncoder.setVertexBuffer(0, state.lineVertexBuffer);
        passEncoder.draw(state.lineVertexCount);
    }


    if (state.arrowPipeline && state.arrowVertexBuffer) {
        passEncoder.setPipeline(state.arrowPipeline);
        passEncoder.setBindGroup(0, state.bindGroup);
        passEncoder.setVertexBuffer(0, state.arrowVertexBuffer);
        passEncoder.draw(state.arrowVertexCount);
    }

    passEncoder.end();

    state.device.queue.submit([commandEncoder.finish()]);
}

let webgpuState;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;

    rotationAngles[1] += deltaX * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

const labelDefs = [
    { id: 'label-zero', pos: [0, 1.15, 0] },
    { id: 'label-one', pos: [0, -1.15, 0] },
    { id: 'label-plus', pos: [1.15, 0, 0] },
    { id: 'label-minus', pos: [-1.15, 0, 0] },
    { id: 'label-i-plus', pos: [0, 0, 1.15] },
    { id: 'label-i-minus', pos: [0, 0, -1.15] }
];

function updateLabels(modelMatrix) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    for (let i = 0; i < labelDefs.length; i++) {
        const item = labelDefs[i];
        const el = document.getElementById(item.id);
        if (!el) continue;

        const pt = projectPoint(item.pos, modelMatrix, w, h);
        if (pt) {
            el.style.transform = `translate(-50%, -50%) translate(${pt[0]}px, ${pt[1]}px)`;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
}

function frame() {
    if (webgpuState) {
        if (webgpuState.currentVector && webgpuState.targetVector) {
            const cur = webgpuState.currentVector;
            const tgt = webgpuState.targetVector;
            if (cur[0] !== tgt[0] || cur[1] !== tgt[1] || cur[2] !== tgt[2]) {
                const nextVec = interpolateVector(cur, tgt, 0.25);
                webgpuState.currentVector = nextVec;
                const arrowVertices = buildArrowVertices(nextVec);
                webgpuState.device.queue.writeBuffer(
                    webgpuState.arrowVertexBuffer, 0, arrowVertices
                );
                webgpuState.arrowVertexCount = arrowVertices.length / 6;
            } else if (webgpuState.stepQueue && webgpuState.stepQueue.length > 0) {
                webgpuState.targetVector = webgpuState.stepQueue.shift();
            }
        }

        const modelMatrix = rotateMatrix(...rotationAngles, webgpuState.projMatrix);
        webgpuState.device.queue.writeBuffer(webgpuState.vertexUniformBuffer, 0, modelMatrix);

        updateLabels(modelMatrix);
        render(webgpuState);
    }
    requestAnimationFrame(frame);
}

initWebGPU()

    .then(state => {
        webgpuState = state;
        if (vscode) {
            vscode.postMessage({ command: 'ready' });
        }
        requestAnimationFrame(frame);
    })
    .catch(error => {
        console.error(error);
        setStatus('WebGPU setup failed.');
    });

window.addEventListener('resize', () => {
    resizeCanvas();
    if (webgpuState) {
        webgpuState.projMatrix = webgpuState.buildProjMatrix();
        render(webgpuState);
    }
});

window.addEventListener('message', async event => {
    const message = event.data;
    if (message.command === 'init' || message.command === 'update') {
        if (message.data && message.data.code) {
            pendingCode = message.data.code;
            const result = await parseQSharp(pendingCode);
            console.log('Q# Parse Result:', result);

            if (webgpuState) {
                const arrowResult = computeBlochArrow(result);
                webgpuState.stepVectors = arrowResult.stepVectors || [];
                webgpuState.targetVector = arrowResult.screenVector;
                webgpuState.stepQueue = [];
            }
        }
        if (webgpuState) {
            render(webgpuState);
        }
    }
});

const replayBtn = document.querySelector('#replay-btn');
if (replayBtn) {
    replayBtn.addEventListener('click', () => {
        if (webgpuState && webgpuState.stepVectors && webgpuState.stepVectors.length > 0) {
            const queue = webgpuState.stepVectors.map(v => [v[0], v[1], v[2]]);
            webgpuState.currentVector = queue.shift();
            webgpuState.targetVector = queue.length > 0 ? queue.shift() : webgpuState.currentVector;
            webgpuState.stepQueue = queue;
        } else if (webgpuState && webgpuState.targetVector) {
            webgpuState.currentVector = [0, 1, 0];
            webgpuState.stepQueue = [];
        }
    });
}
