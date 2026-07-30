const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const canvas = document.querySelector('canvas');
const statusText = document.querySelector('#status');
let rotationAngles = [0.0, 0.0, 0.0];

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

async function initWebGPU() {
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

    const mesh = sphere(16, 16);

    const vertexBuffer = device.createBuffer({
        label: "Vertex Buffer",
        size: mesh.positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    const vertexCount = mesh.positions.length / 6;

    device.queue.writeBuffer(vertexBuffer, 0, mesh.positions);

    const projMatrix = createOrthographicMatrix(
        -1,
        1,
        -1,
        1,
        0.1,
        100
    );

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

    const [vertexShader, fragmentShader] = await Promise.all([
        loadShader('shader/vertex.wgsl'),
        loadShader('shader/fragment.wgsl')
    ]);

    const vertexModule = device.createShaderModule({ code: vertexShader });
    const fragmentModule = device.createShaderModule({ code: fragmentShader });

    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        }),
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [
                {
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
                }
            ]
        },
        fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{
                format,
                blend: {
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
                }
            }]
        },
        primitive: {
            topology: 'triangle-list'
        }
    });

    resizeCanvas();

    context.configure({
        device,
        format,
        alphaMode: 'opaque'
    });

    return { device, context, pipeline, vertexBuffer, vertexCount, bindGroup, vertexUniformBuffer, projMatrix };
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

function frame() {
    if (webgpuState) {
        const modelMatrix = rotateMatrix(...rotationAngles, webgpuState.projMatrix);
        webgpuState.device.queue.writeBuffer(webgpuState.vertexUniformBuffer, 0, modelMatrix);

        render(webgpuState);
    }
    requestAnimationFrame(frame);
}

initWebGPU()
    .then(state => {
        webgpuState = state;
        requestAnimationFrame(frame);
    })
    .catch(error => {
        console.error(error);
        setStatus('WebGPU setup failed.');
    });

window.addEventListener('resize', () => {
    resizeCanvas();
    if (webgpuState) {
        render(webgpuState);
    }
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'init') {
        if (webgpuState) {
            render(webgpuState);
        }
    }
});
