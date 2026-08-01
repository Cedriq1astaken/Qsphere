function stripLineComments(code) {
    return code.replace(/\/\/[^\n]*/g, '');
}

function isValidTarget(str) {
    if (!str || str.trim().length === 0) return false;
    return /^[A-Za-z_][A-Za-z0-9_]*\s*(\[\s*\d+\s*\])?$/.test(str.trim());
}

function isValidAngleExpr(str) {
    if (!str || str.trim().length === 0) return false;
    let s = str.trim()
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?PI\s*\(\s*\)/gi, '1')
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?\bPI\b/gi, '1')
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?\bTAU\b/gi, '1');
    return /^[0-9.eE+\-*/()\s]+$/.test(s);
}

function parseAngle(argStr) {
    if (!argStr) return 0;

    let sanitized = argStr.trim()
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?PI\s*\(\s*\)/gi, '3.141592653589793')
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?\bPI\b/gi, '3.141592653589793')
        .replace(/(?:Std\.Math\.|Microsoft\.Quantum\.Math\.|Math\.)?\bTAU\b/gi, '6.283185307179586');

    function tokenize(str) {
        const tokens = [];
        let i = 0;
        while (i < str.length) {
            const ch = str[i];
            if (/\s/.test(ch)) {
                i++;
            } else if (/[0-9.]/.test(ch)) {
                let numStr = '';
                while (i < str.length && /[0-9.eE]/.test(str[i])) {
                    numStr += str[i];
                    i++;
                }
                tokens.push({ type: 'num', value: parseFloat(numStr) });
            } else if ('+-*/()'.includes(ch)) {
                tokens.push({ type: 'op', value: ch });
                i++;
            } else {
                i++;
            }
        }
        return tokens;
    }

    function evaluate(tokens) {
        let pos = 0;

        function parsePrimary() {
            if (pos >= tokens.length) return 0;
            const token = tokens[pos];
            if (token.type === 'op' && token.value === '-') { pos++; return -parsePrimary(); }
            if (token.type === 'op' && token.value === '+') { pos++; return parsePrimary(); }
            if (token.type === 'op' && token.value === '(') {
                pos++;
                const val = parseAddSub();
                if (pos < tokens.length && tokens[pos].value === ')') pos++;
                return val;
            }
            if (token.type === 'num') { pos++; return token.value; }
            return 0;
        }

        function parseMulDiv() {
            let left = parsePrimary();
            while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
                const op = tokens[pos].value;
                pos++;
                const right = parsePrimary();
                left = op === '*' ? left * right : (right !== 0 ? left / right : 0);
            }
            return left;
        }

        function parseAddSub() {
            let left = parseMulDiv();
            while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
                const op = tokens[pos].value;
                pos++;
                const right = parseMulDiv();
                left = op === '+' ? left + right : left - right;
            }
            return left;
        }

        return parseAddSub();
    }

    try {
        const tokens = tokenize(sanitized);
        if (tokens.length > 0) return evaluate(tokens);
    } catch (e) {}

    return 0;
}

function findMatchingParen(code, startIdx) {
    let depth = 0;
    for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function findMatchingBrace(code, startIdx) {
    let depth = 0;
    for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function findDeclaredQubits(blockCode) {
    const declared = new Set();
    const useRegex = /\buse\s+(?:([A-Za-z0-9_]+)|\(([^)]+)\))\s*=/gi;
    let match;
    while ((match = useRegex.exec(blockCode)) !== null) {
        if (match[1]) {
            declared.add(match[1].trim());
        } else if (match[2]) {
            match[2].split(',').forEach(v => { declared.add(v.trim()); });
        }
    }
    return declared;
}

function buildQubitsList(blockCode) {
    const entries = [];

    const singleRe = /\buse\s+([A-Za-z0-9_]+)\s*=\s*Qubit\s*\(\s*\)/gi;
    const arrayRe = /\buse\s+([A-Za-z0-9_]+)\s*=\s*Qubit\s*\[\s*(\d+)\s*\]/gi;
    const tupleRe = /\buse\s+\(([^)]+)\)\s*=/gi;
    let m;

    while ((m = singleRe.exec(blockCode)) !== null) {
        entries.push({ pos: m.index, type: 'single', name: m[1] });
    }
    while ((m = arrayRe.exec(blockCode)) !== null) {
        entries.push({ pos: m.index, type: 'array', name: m[1], size: parseInt(m[2], 10) });
    }
    while ((m = tupleRe.exec(blockCode)) !== null) {
        const names = m[1].split(',').map(v => v.trim()).filter(v => v.length > 0);
        entries.push({ pos: m.index, type: 'tuple', names });
    }

    entries.sort((a, b) => a.pos - b.pos);

    const list = [];
    for (const entry of entries) {
        if (entry.type === 'single') {
            list.push(entry.name);
        } else if (entry.type === 'array') {
            for (let i = 0; i < entry.size; i++) list.push(`${entry.name}[${i}]`);
        } else {
            for (const name of entry.names) list.push(name);
        }
    }
    return list;
}

function resolveTargetIndex(targetStr, qubitsList) {
    const normalized = targetStr.trim().replace(/\s+/g, '');
    return qubitsList.indexOf(normalized);
}

class QSharpWasmParser {
    constructor() {
        this.wasmInstance = null;
    }

    async init() {}

    extractOperationDefinitions(code) {
        const opDefs = new Map();
        const opRegex = /\boperation\s+([A-Za-z0-9_]+)\s*\(/g;
        let match;

        while ((match = opRegex.exec(code)) !== null) {
            const opName = match[1];
            const startParenIdx = opRegex.lastIndex - 1;
            const endParenIdx = findMatchingParen(code, startParenIdx);
            if (endParenIdx === -1) continue;

            const paramStr = code.substring(startParenIdx + 1, endParenIdx);
            const params = paramStr.split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0)
                .map(p => p.split(':')[0].trim())
                .filter(p => p.length > 0);

            const openBraceIdx = code.indexOf('{', endParenIdx);
            if (openBraceIdx === -1) continue;

            const closeBraceIdx = findMatchingBrace(code, openBraceIdx);
            if (closeBraceIdx === -1) continue;

            const body = code.substring(openBraceIdx + 1, closeBraceIdx);
            opDefs.set(opName, { name: opName, params, body });
        }

        return opDefs;
    }

    parse(code) {
        if (!code || typeof code !== 'string') {
            return { entryPointFound: false, qubitsDeclared: 0, qubitsList: [], operations: [] };
        }

        const stripped = stripLineComments(code);

        let startIdx = 0;
        let entryPointFound = false;

        const entryMatch = /@EntryPoint\s*\(\s*\)/i.exec(stripped);
        if (entryMatch) {
            entryPointFound = true;
            startIdx = entryMatch.index + entryMatch[0].length;
        }

        const executableCode = stripped.substring(startIdx);

        const customOpDefs = this.extractOperationDefinitions(stripped);

        let entryBody = executableCode;
        if (entryPointFound) {
            const entryOpMatch = /operation\s+([A-Za-z0-9_]+)/.exec(executableCode);
            if (entryOpMatch && customOpDefs.has(entryOpMatch[1])) {
                entryBody = customOpDefs.get(entryOpMatch[1]).body;
            }
        }

        const qubitsList = buildQubitsList(entryBody);
        const qubitsDeclared = qubitsList.length;

        const operations = [];
        const primitiveGates = new Set(['H', 'X', 'Y', 'Z', 'S', 'T', 'I', 'Rx', 'Ry', 'Rz', 'R1']);
        const rotGates = new Set(['Rx', 'Ry', 'Rz', 'R1']);

        const evaluateBlock = (blockCode, paramBindings, callStack, validQubits) => {
            if (callStack.size > 20) return;

            let codeToProcess = blockCode;
            if (paramBindings && paramBindings.size > 0) {
                paramBindings.forEach((argVal, paramName) => {
                    const re = new RegExp('\\b' + paramName + '\\b', 'g');
                    codeToProcess = codeToProcess.replace(re, argVal);
                });
            }

            const localValidQubits = new Set(validQubits);
            const blockDeclared = findDeclaredQubits(codeToProcess);
            blockDeclared.forEach(q => localValidQubits.add(q));

            const callFinder = /\b([A-Za-z0-9_]+)\s*\(/g;
            let callMatch;

            while ((callMatch = callFinder.exec(codeToProcess)) !== null) {
                const funcName = callMatch[1];
                const startParenIdx = callFinder.lastIndex - 1;
                const endParenIdx = findMatchingParen(codeToProcess, startParenIdx);

                if (endParenIdx === -1) continue;

                const innerArgs = codeToProcess.substring(startParenIdx + 1, endParenIdx).trim();

                if (primitiveGates.has(funcName)) {
                    if (rotGates.has(funcName)) {
                        const lastCommaIdx = innerArgs.lastIndexOf(',');
                        if (lastCommaIdx === -1) continue;

                        const argStr = innerArgs.substring(0, lastCommaIdx).trim();
                        const targetStr = innerArgs.substring(lastCommaIdx + 1).trim();

                        if (!isValidAngleExpr(argStr)) continue;
                        if (!isValidTarget(targetStr)) continue;

                        const targetVar = targetStr.split('[')[0].trim();
                        if (!localValidQubits.has(targetVar)) continue;

                        const target = resolveTargetIndex(targetStr, qubitsList);
                        if (target === -1) continue;

                        operations.push({ operation: funcName, angle: parseAngle(argStr), target });

                    } else {
                        if (!isValidTarget(innerArgs)) continue;

                        const targetVar = innerArgs.split('[')[0].trim();
                        if (!localValidQubits.has(targetVar)) continue;

                        const target = resolveTargetIndex(innerArgs, qubitsList);
                        if (target === -1) continue;

                        operations.push({ operation: funcName, angle: 0, target });
                    }

                } else if (customOpDefs.has(funcName) && !callStack.has(funcName)) {
                    const customDef = customOpDefs.get(funcName);

                    const rawArgs = innerArgs.length > 0
                        ? innerArgs.split(',').map(a => a.trim()).filter(a => a.length > 0)
                        : [];

                    if (rawArgs.length !== customDef.params.length) continue;

                    const childBindings = new Map();
                    customDef.params.forEach((paramName, idx) => {
                        childBindings.set(paramName, rawArgs[idx]);
                    });

                    const newStack = new Set(callStack);
                    newStack.add(funcName);

                    evaluateBlock(customDef.body, childBindings, newStack, localValidQubits);
                }
            }
        };

        evaluateBlock(entryBody, new Map(), new Set(['entry']), new Set());

        return { entryPointFound, qubitsDeclared, qubitsList, operations };
    }
}

async function parseQSharp(code) {
    const parser = new QSharpWasmParser();
    await parser.init();
    return parser.parse(code);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QSharpWasmParser, parseQSharp };
} else if (typeof window !== 'undefined') {
    window.QSharpWasmParser = QSharpWasmParser;
    window.parseQSharp = parseQSharp;
}
