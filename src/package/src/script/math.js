function sphere(u, v) {
    const vertices = [];

    for (let i = 0; i < u; i++) {
        const theta0 = (i / u) * Math.PI;
        const theta1 = ((i + 1) / u) * Math.PI;

        for (let j = 0; j < v; j++) {
            const phi0 = (j / v) * 2 * Math.PI;
            const phi1 = ((j + 1) / v) * 2 * Math.PI;

            const p00 = getSpherePoint(theta0, phi0);
            const p01 = getSpherePoint(theta0, phi1);
            const p10 = getSpherePoint(theta1, phi0);
            const p11 = getSpherePoint(theta1, phi1);
            vertices.push(...p00, ...p10, ...p01);
            vertices.push(...p00, ...p10, ...p01);
            vertices.push(...p01, ...p10, ...p11);
            vertices.push(...p01, ...p10, ...p11);
        }
    }

    return {
        positions: new Float32Array(vertices)
    };
}

function getSpherePoint(theta, phi) {
    return [
        Math.sin(theta) * Math.cos(phi),
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta)
    ];
}

function mult(A, B) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += A[k * 4 + row] * B[col * 4 + k];
            }
            out[col * 4 + row] = sum;
        }
    }
    return out;
}

function createOrthographicMatrix(left, right, bottom, top, near, far) {
    const lr = 1.0 / (left - right);
    const bt = 1.0 / (bottom - top);
    const nf = 1.0 / (near - far);

    const out = new Float32Array(16);

    out[0] = -2.0 * lr;
    out[5] = -2.0 * bt;
    out[10] = nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = near * nf;
    out[15] = 1.0;

    return out;
}

function rotateX(matrix, angle) {
    const out = new Float32Array(16);
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    out[0] = 1.0;
    out[5] = c;
    out[6] = s;
    out[9] = -s;
    out[10] = c;
    out[15] = 1.0;

    return mult(matrix, out);
}

function rotateY(matrix, angle) {
    const out = new Float32Array(16);
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    out[0] = c;
    out[2] = -s;
    out[5] = 1.0;
    out[8] = s;
    out[10] = c;
    out[15] = 1.0;

    return mult(matrix, out);
}

function rotateZ(matrix, angle) {
    const out = new Float32Array(16);
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    out[0] = c;
    out[1] = s;
    out[4] = -s;
    out[5] = c;
    out[10] = 1.0;
    out[15] = 1.0;

    return mult(matrix, out);
}

function rotateMatrix(rotX, rotY, rotZ, matrix) {
    return rotateZ(rotateY(rotateX(matrix, rotX), rotY), rotZ);
}