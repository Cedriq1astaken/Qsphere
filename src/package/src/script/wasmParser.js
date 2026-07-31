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
                if (pos < tokens.length && tokens[pos].value === ')') {
                    pos++;
                }
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
        if (tokens.length > 0) {
            return evaluate(tokens);
        }
    } catch (e) {}

    return 0;
}

class QSharpWasmParser {
    constructor() {
        this.wasmInstance = null;
    }

    async init() {
    }

    parse(code) {
        if (!code || typeof code !== 'string') {
            return {
                entryPointFound: false,
                qubitsDeclared: 0,
                operations: []
            };
        }

        let startIdx = 0;
        let entryPointFound = false;

        const entryMatch = /@EntryPoint\s*\(\s*\)/i.exec(code);
        if (entryMatch) {
            entryPointFound = true;
            startIdx = entryMatch.index + entryMatch[0].length;
        }

        const executableCode = code.substring(startIdx);

        let qubitsDeclared = 0;
        const qubitRegex = /use\s+[A-Za-z0-9_,\s=]+\s*=\s*Qubit\s*(?:\[\s*(\d+)\s*\]|\(\s*\))/gi;
        let match;
        while ((match = qubitRegex.exec(executableCode)) !== null) {
            if (match[1]) {
                qubitsDeclared += parseInt(match[1], 10);
            } else {
                qubitsDeclared += 1;
            }
        }

        const operations = [];
        const rotGates = new Set(['Rx', 'Ry', 'Rz', 'R1']);

        const gateFinder = /\b(H|X|Y|Z|S|T|I|Rx|Ry|Rz|R1)\s*\(/g;
        let gateMatch;

        while ((gateMatch = gateFinder.exec(executableCode)) !== null) {
            const gate = gateMatch[1];
            const startParenIdx = gateFinder.lastIndex - 1;

            let depth = 0;
            let endParenIdx = -1;

            for (let i = startParenIdx; i < executableCode.length; i++) {
                const char = executableCode[i];
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                    if (depth === 0) {
                        endParenIdx = i;
                        break;
                    }
                }
            }

            if (endParenIdx === -1) {
                continue;
            }

            const innerArgs = executableCode.substring(startParenIdx + 1, endParenIdx).trim();

            if (rotGates.has(gate)) {
                const lastCommaIdx = innerArgs.lastIndexOf(',');
                if (lastCommaIdx === -1) {
                    continue;
                }

                const argStr = innerArgs.substring(0, lastCommaIdx).trim();
                const targetStr = innerArgs.substring(lastCommaIdx + 1).trim();

                const targetMatch = /(?:[A-Za-z0-9_]+\s*\[\s*(\d+)\s*\]|([A-Za-z0-9_]+))/.exec(targetStr);
                if (!targetMatch) {
                    continue;
                }

                let target = 0;
                if (targetMatch[1] !== undefined) {
                    target = parseInt(targetMatch[1], 10);
                }

                const angle = parseAngle(argStr);

                operations.push({
                    operation: gate,
                    angle: angle,
                    target: target
                });
            } else {
                const targetMatch = /(?:[A-Za-z0-9_]+\s*\[\s*(\d+)\s*\]|([A-Za-z0-9_]+))/.exec(innerArgs);
                if (!targetMatch) {
                    continue;
                }

                let target = 0;
                if (targetMatch[1] !== undefined) {
                    target = parseInt(targetMatch[1], 10);
                }

                operations.push({
                    operation: gate,
                    angle: 0,
                    target: target
                });
            }
        }

        return {
            entryPointFound,
            qubitsDeclared,
            operations
        };
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
