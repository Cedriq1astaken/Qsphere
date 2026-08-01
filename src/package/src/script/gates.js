const C0 = new Complex(0, 0);
const C1 = new Complex(1, 0);
const CI = new Complex(0, 1);
const CNEG_I = new Complex(0, -1);

function gateH() {
    const s = 1 / Math.sqrt(2);
    return [
        [new Complex(s, 0), new Complex(s, 0)],
        [new Complex(s, 0), new Complex(-s, 0)]
    ];
}

function gateX() {
    return [
        [C0, C1],
        [C1, C0]
    ];
}

function gateY() {
    return [
        [C0, CNEG_I],
        [CI, C0]
    ];
}

function gateZ() {
    return [
        [C1, C0],
        [C0, new Complex(-1, 0)]
    ];
}

function gateS() {
    return [
        [C1, C0],
        [C0, CI]
    ];
}

function gateT() {
    const s = 1 / Math.sqrt(2);
    return [
        [C1, C0],
        [C0, new Complex(s, s)]
    ];
}

function gateI() {
    return [
        [C1, C0],
        [C0, C1]
    ];
}

function gateR1(angle) {
    return [
        [C1, C0],
        [C0, new Complex(Math.cos(angle), Math.sin(angle))]
    ];
}

function rotateBlochX(angle) {
    const c = Math.cos(angle / 2);
    const s = Math.sin(angle / 2);
    return [
        [new Complex(c, 0), new Complex(0, -s)],
        [new Complex(0, -s), new Complex(c, 0)]
    ];
}

function rotateBlochY(angle) {
    const c = Math.cos(angle / 2);
    const s = Math.sin(angle / 2);
    return [
        [new Complex(c, 0), new Complex(-s, 0)],
        [new Complex(s, 0), new Complex(c, 0)]
    ];
}

function rotateBlochZ(angle) {
    const c = Math.cos(angle / 2);
    const s = Math.sin(angle / 2);
    return [
        [new Complex(c, -s), C0],
        [C0, new Complex(c, s)]
    ];
}

function getGateMatrix(gateName, angle) {
    if (gateName === 'Rx') return rotateBlochX(angle || 0);
    if (gateName === 'Ry') return rotateBlochY(angle || 0);
    if (gateName === 'Rz') return rotateBlochZ(angle || 0);
    if (gateName === 'R1') return gateR1(angle || 0);
    const map = { H: gateH, X: gateX, Y: gateY, Z: gateZ, S: gateS, T: gateT, I: gateI };
    const factory = map[gateName];
    return factory ? factory() : gateI();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        gateH, gateX, gateY, gateZ, gateS, gateT, gateI, gateR1,
        rotateBlochX, rotateBlochY, rotateBlochZ, getGateMatrix
    };
} else if (typeof window !== 'undefined') {
    window.gateH = gateH;
    window.gateX = gateX;
    window.gateY = gateY;
    window.gateZ = gateZ;
    window.gateS = gateS;
    window.gateT = gateT;
    window.gateI = gateI;
    window.gateR1 = gateR1;
    window.rotateBlochX = rotateBlochX;
    window.rotateBlochY = rotateBlochY;
    window.rotateBlochZ = rotateBlochZ;
    window.getGateMatrix = getGateMatrix;
}
