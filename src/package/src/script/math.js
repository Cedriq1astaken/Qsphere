class Complex {
    constructor(re, im) {
        this.re = re || 0;
        this.im = im || 0;
    }

    add(other) {
        return new Complex(this.re + other.re, this.im + other.im);
    }

    sub(other) {
        return new Complex(this.re - other.re, this.im - other.im);
    }

    mul(other) {
        if (typeof other === 'number') {
            return new Complex(this.re * other, this.im * other);
        }
        return new Complex(
            this.re * other.re - this.im * other.im,
            this.re * other.im + this.im * other.re
        );
    }

    conj() {
        return new Complex(this.re, -this.im);
    }

    abs2() {
        return this.re * this.re + this.im * this.im;
    }
}

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

function createPerspectiveMatrix(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1.0 / (near - far);

    const out = new Float32Array(16);

    out[0] = f / aspect;
    out[5] = f;
    out[10] = far * nf;
    out[11] = -1.0;
    out[14] = far * near * nf;

    return out;
}

function createTranslationMatrix(x, y, z) {
    const out = new Float32Array(16);

    out[0] = 1.0;
    out[5] = 1.0;
    out[10] = 1.0;
    out[12] = x;
    out[13] = y;
    out[14] = z;
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

function vec3Len(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v) {
    const len = vec3Len(v);
    if (len < 1e-10) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function vec3Dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function rodriguesRotate(p, k, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const kCrossP = vec3Cross(k, p);
    const kDotP = vec3Dot(k, p);
    return [
        p[0] * c + kCrossP[0] * s + k[0] * kDotP * (1 - c),
        p[1] * c + kCrossP[1] * s + k[1] * kDotP * (1 - c),
        p[2] * c + kCrossP[2] * s + k[2] * kDotP * (1 - c)
    ];
}

function interpolateVector(current, target, factor) {
    let dot = vec3Dot(current, target);
    dot = Math.max(-1, Math.min(1, dot));

    if (dot > 0.9999) {
        return [target[0], target[1], target[2]];
    }

    if (dot < -0.9999) {
        const perp = Math.abs(current[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const axis = vec3Normalize(vec3Cross(current, perp));
        return rodriguesRotate(current, axis, Math.PI * factor);
    }

    const omega = Math.acos(dot);
    const sinOmega = Math.sin(omega);

    const stepAngle = factor * omega;
    const t = Math.min(1, stepAngle / omega);

    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;

    const rx = s0 * current[0] + s1 * target[0];
    const ry = s0 * current[1] + s1 * target[1];
    const rz = s0 * current[2] + s1 * target[2];

    return vec3Normalize([rx, ry, rz]);
}

function buildSphereLines(segments) {
    if (segments === undefined) segments = 64;
    const verts = [];

    verts.push(-1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    verts.push(0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0);
    verts.push(0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0);

    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;

        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        verts.push(c0, 0, s0, 0, 0, 0, c1, 0, s1, 0, 0, 0);
        verts.push(c0, s0, 0, 0, 0, 0, c1, s1, 0, 0, 0, 0);
        verts.push(0, s0, c0, 0, 0, 0, 0, s1, c1, 0, 0, 0);
    }

    return new Float32Array(verts);
}

function projectPoint(p, matrix, width, height) {
    const x = p[0], y = p[1], z = p[2];
    const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];

    if (clipW <= 0) return null;

    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    const screenX = (ndcX * 0.5 + 0.5) * width;
    const screenY = (-ndcY * 0.5 + 0.5) * height;

    return [screenX, screenY];
}