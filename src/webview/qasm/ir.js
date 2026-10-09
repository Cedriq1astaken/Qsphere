/**
 * OpenQASM Intermediate Representation (IR)
 *
 * Provides a normalized instruction model representing quantum circuits across
 * Qiskit Python (.py), Q# (.qs), and native OpenQASM (.qasm) source files.
 */

/**
 * Standard gate normalization aliases.
 * Maps common gate aliases to canonical OpenQASM gate identifiers.
 */
export const CANONICAL_GATE_NAMES = {
    // Single-qubit
    h: 'h',
    x: 'x',
    y: 'y',
    z: 'z',
    s: 's',
    sdg: 'sdg',
    t: 't',
    tdg: 'tdg',
    sx: 'sx',
    sxdg: 'sxdg',
    id: 'id',
    i: 'id',
    rx: 'rx',
    ry: 'ry',
    rz: 'rz',
    p: 'p',
    phase: 'p',
    u1: 'p',
    u: 'u',
    u3: 'u',
    u2: 'u2',

    // Two-qubit
    cx: 'cx',
    cnot: 'cx',
    cy: 'cy',
    cz: 'cz',
    ch: 'ch',
    swap: 'swap',
    iswap: 'iswap',
    crx: 'crx',
    cry: 'cry',
    crz: 'crz',
    cp: 'cp',
    cphase: 'cp',
    cu1: 'cp',
    cu: 'cu',
    cu3: 'cu',
    rxx: 'rxx',
    ryy: 'ryy',
    rzz: 'rzz',
    rzx: 'rzx',
    ecr: 'ecr',
    dcx: 'dcx',

    // Multi-qubit
    ccx: 'ccx',
    toffoli: 'ccx',
    cswap: 'cswap',
    fredkin: 'cswap',
    mcx: 'mcx',
    mcp: 'mcp'
};

export function normalizeGateName(name) {
    if (!name) return '';
    const lower = String(name).trim().toLowerCase();
    return CANONICAL_GATE_NAMES[lower] || lower;
}

/**
 * Represents a single instruction in the OpenQASM IR.
 */
export class QasmInstruction {
    /**
     * @param {Object} options
     * @param {'gate'|'reset'|'initialize'|'barrier'|'measure'} options.type
     * @param {string} [options.op] - Normalized gate name (e.g. 'h', 'cx', 'rz')
     * @param {number[]} [options.qubits] - Integer qubit indices acted upon
     * @param {number[]} [options.params] - Real numerical parameters (e.g. rotation angles in radians)
     * @param {number} [options.bit] - Target classical bit index (for measurement)
     * @param {Object} [options.source] - Source code mapping { file, line, col }
     * @param {string} [options.rawText] - Original source line text
     */
    constructor({ type = 'gate', op = '', qubits = [], params = [], bit = null, source = null, rawText = '' }) {
        this.type = type;
        this.op = normalizeGateName(op);
        this.qubits = Array.isArray(qubits) ? qubits.slice() : [];
        this.params = Array.isArray(params) ? params.slice() : [];
        this.bit = bit;
        this.source = source ? { ...source } : null;
        this.rawText = rawText;
    }

    /**
     * Serializes this instruction to standard OpenQASM 2.0 syntax.
     * @param {string} [qregName='q']
     * @param {string} [cregName='c']
     * @returns {string}
     */
    toQasm2(qregName = 'q', cregName = 'c') {
        const qArgs = this.qubits.map(q => `${qregName}[${q}]`).join(', ');
        const paramStr = this.params.length > 0
            ? `(${this.params.map(p => Number.isFinite(p) ? Number(p.toFixed(8)).toString() : '0').join(', ')})`
            : '';

        switch (this.type) {
            case 'gate':
                return `${this.op}${paramStr} ${qArgs};`;
            case 'reset':
                return `reset ${qArgs};`;
            case 'barrier':
                return `barrier ${qArgs};`;
            case 'measure':
                return `measure ${qregName}[${this.qubits[0]}] -> ${cregName}[${this.bit ?? this.qubits[0]}];`;
            default:
                return `// ${this.type} ${qArgs}`;
        }
    }
}

/**
 * Container representing a complete OpenQASM Program.
 */
export class OpenQasmProgram {
    constructor() {
        this.qubitsCount = 0;
        this.clbitsCount = 0;
        this.qregs = []; // [{ name: string, size: number, offset: number }]
        this.cregs = []; // [{ name: string, size: number, offset: number }]
        this.instructions = []; // QasmInstruction[]
    }

    /**
     * Declare a quantum register.
     * @param {string} name
     * @param {number} size
     */
    addQreg(name, size) {
        const offset = this.qubitsCount;
        this.qregs.push({ name, size, offset });
        this.qubitsCount += size;
        return offset;
    }

    /**
     * Declare a classical register.
     * @param {string} name
     * @param {number} size
     */
    addCreg(name, size) {
        const offset = this.clbitsCount;
        this.cregs.push({ name, size, offset });
        this.clbitsCount += size;
        return offset;
    }

    /**
     * Append a quantum gate instruction.
     */
    addGate(op, qubits, params = [], source = null, rawText = '') {
        const instr = new QasmInstruction({
            type: 'gate',
            op,
            qubits,
            params,
            source,
            rawText
        });
        this.instructions.push(instr);
        return instr;
    }

    /**
     * Append a reset instruction.
     */
    addReset(qubit, source = null, rawText = '') {
        const instr = new QasmInstruction({
            type: 'reset',
            qubits: [qubit],
            source,
            rawText
        });
        this.instructions.push(instr);
        return instr;
    }

    /**
     * Append a barrier instruction.
     */
    addBarrier(qubits, source = null, rawText = '') {
        const instr = new QasmInstruction({
            type: 'barrier',
            qubits,
            source,
            rawText
        });
        this.instructions.push(instr);
        return instr;
    }

    /**
     * Append a measurement instruction.
     */
    addMeasure(qubit, bit, source = null, rawText = '') {
        const instr = new QasmInstruction({
            type: 'measure',
            qubits: [qubit],
            bit,
            source,
            rawText
        });
        this.instructions.push(instr);
        return instr;
    }

    /**
     * Filters instructions up to a specific source line (for line-by-line stepping).
     * @param {number} targetLine
     * @returns {QasmInstruction[]}
     */
    getInstructionsUpToLine(targetLine) {
        if (typeof targetLine !== 'number' || targetLine < 0) {
            return this.instructions;
        }
        return this.instructions.filter(instr => {
            if (!instr.source || typeof instr.source.line !== 'number') return true;
            return instr.source.line <= targetLine;
        });
    }

    /**
     * Serializes this entire program to valid OpenQASM 2.0 text.
     * @returns {string}
     */
    toQasm2String() {
        const lines = [
            'OPENQASM 2.0;',
            'include "qelib1.inc";',
            ''
        ];

        const qregName = this.qregs[0]?.name || 'q';
        const qregSize = this.qubitsCount > 0 ? this.qubitsCount : (this.qregs[0]?.size || 1);
        lines.push(`qreg ${qregName}[${qregSize}];`);

        if (this.clbitsCount > 0) {
            const cregName = this.cregs[0]?.name || 'c';
            lines.push(`creg ${cregName}[${this.clbitsCount}];`);
        }
        lines.push('');

        for (const instr of this.instructions) {
            lines.push(instr.toQasm2(qregName, this.cregs[0]?.name || 'c'));
        }

        return lines.join('\n');
    }
}
