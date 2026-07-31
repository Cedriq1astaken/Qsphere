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
            if (token.type === 'op' && token.value === '-') {
                pos++;
                return -parsePrimary();
            }
            if (token.type === 'op' && token.value === '+') {
                pos++;
                return parsePrimary();
            }
            if (token.type === 'op' && token.value === '(') {
                pos++;
                const val = parseAddSub();
                if (pos < tokens.length && tokens[pos].value === ')') pos++;
                return val;
            }
            if (token.type === 'num') {
                pos++;
                return token.value;
            }
            return 0;
        }

        function parseMulDiv() {
            let left = parsePrimary();
            while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
                const op = tokens[pos].value;
                pos++;
                const right = parsePrimary();
                if (op === '*') left = left * right;
                else if (op === '/') left = right !== 0 ? left / right : 0;
            }
            return left;
        }

        function parseAddSub() {
            let left = parseMulDiv();
            while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
                const op = tokens[pos].value;
                pos++;
                const right = parseMulDiv();
                if (op === '+') left = left + right;
                else if (op === '-') left = left - right;
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
        else if (code[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function findMatchingBrace(code, startIdx) {
    let depth = 0;
    for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

class QSharpWasmParser {
    constructor() {
        this.wasmInstance = null;
    }

    async init() {
    }

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
            return { entryPointFound: false, qubitsDeclared: 0, operations: [] };
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

        let qubitsDeclared = 0;
        const qubitRegex = /use\s+[A-Za-z0-9_,\s=]+\s*=\s*Qubit\s*(?:\[\s*(\d+)\s*\]|\(\s*\))/gi;
        let match;
        while ((match = qubitRegex.exec(executableCode)) !== null) {
            if (match[1]) qubitsDeclared += parseInt(match[1], 10);
            else qubitsDeclared += 1;
        }

        const customOpDefs = this.extractOperationDefinitions(stripped);
        const operations = [];
        const primitiveGates = new Set(['H', 'X', 'Y', 'Z', 'S', 'T', 'I', 'Rx', 'Ry', 'Rz', 'R1']);
        const rotGates = new Set(['Rx', 'Ry', 'Rz', 'R1']);

        const evaluateBlock = (blockCode, paramBindings, callStack) => {
            if (callStack.size > 20) return;

            let codeToProcess = blockCode;
            if (paramBindings && paramBindings.size > 0) {
                paramBindings.forEach((argVal, paramName) => {
                    const re = new RegExp('\\b' + paramName + '\\b', 'g');
                    codeToProcess = codeToProcess.replace(re, argVal);
                });
            }

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

                        let target = 0;
                        const arrayMatch = /[A-Za-z0-9_]+\s*\[\s*(\d+)\s*\]/.exec(targetStr);
                        if (arrayMatch) target = parseInt(arrayMatch[1], 10);

                        operations.push({
                            operation: funcName,
                            angle: parseAngle(argStr),
                            target
                        });

                    } else {
                        if (!isValidTarget(innerArgs)) continue;

                        let target = 0;
                        const arrayMatch = /[A-Za-z0-9_]+\s*\[\s*(\d+)\s*\]/.exec(innerArgs);
                        if (arrayMatch) target = parseInt(arrayMatch[1], 10);

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

                    evaluateBlock(customDef.body, childBindings, newStack);
                }
            }
        };

        let entryBody = executableCode;
        if (entryPointFound) {
            const entryOpMatch = /operation\s+([A-Za-z0-9_]+)/.exec(executableCode);
            if (entryOpMatch && customOpDefs.has(entryOpMatch[1])) {
                entryBody = customOpDefs.get(entryOpMatch[1]).body;
            }
        }

        evaluateBlock(entryBody, new Map(), new Set(['entry']));

        return { entryPointFound, qubitsDeclared, operations };
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
