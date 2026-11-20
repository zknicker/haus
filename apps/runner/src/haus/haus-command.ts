import {
    type CallExpr,
    type File,
    parse,
    type Redirect,
    type Stmt,
    walk,
    type Word,
    type WordPart,
} from 'sh-syntax';

export type BashCommandRoute =
    | { readonly argv: readonly string[]; readonly kind: 'haus'; readonly stdin: string | null }
    | { readonly kind: 'haus-not-alone' }
    | { readonly kind: 'machine' };

export async function routeBashCommand(command: string) {
    const file = await parseShell(command);
    if (!(file && mentionsHaus(file))) {
        return { kind: 'machine' } satisfies BashCommandRoute;
    }
    return loneHaus(file) ?? ({ kind: 'haus-not-alone' } satisfies BashCommandRoute);
}

async function parseShell(command: string) {
    try {
        return await parse(command, { keepComments: false });
    } catch {
        return null;
    }
}

function loneHaus(file: File) {
    const [stmt, ...rest] = file.stmts;
    if (!stmt || rest.length > 0 || !isPlainStatement(stmt)) {
        return null;
    }
    const cmd = stmt.cmd;
    if (cmd?.type !== 'CallExpr' || cmd.assigns.length > 0) {
        return null;
    }
    const words = cmd.args.map(literalWord);
    if (words[0] !== 'haus' || words.some((word) => word === null)) {
        return null;
    }
    const stdin = stdinOf(stmt.redirs);
    if (stdin === undefined) {
        return null;
    }
    return { argv: words.slice(1) as string[], kind: 'haus', stdin } satisfies BashCommandRoute;
}

function isPlainStatement(stmt: Stmt) {
    return !(stmt.negated || stmt.background || stmt.coprocess || stmt.disown);
}

function stdinOf(redirs: readonly Redirect[]) {
    const [redir, ...rest] = redirs;
    if (!redir) {
        return null;
    }
    if (rest.length > 0 || !(redir.n === null || redir.n.value === '0') || !redir.word) {
        return undefined;
    }
    const operator = redir.op as number;
    if (operator === hereString) {
        const word = literalWord(redir.word);
        return word === null ? undefined : `${word}\n`;
    }
    if (!((operator === heredoc || operator === dashHeredoc) && redir.hdoc)) {
        return undefined;
    }
    const body = redir.hdoc.parts.map((part) => (part.type === 'Lit' ? part.value : null));
    if (body.some((part) => part === null)) {
        return undefined;
    }
    const text = body.join('');
    if (isQuotedDelimiter(redir.word)) {
        return text;
    }
    return /[$`]/u.test(text) ? undefined : unescapeHeredoc(text);
}

const heredoc = 71;
const dashHeredoc = 72;
const hereString = 73;

function isQuotedDelimiter(word: Word) {
    return word.parts.some((part) => part.type !== 'Lit' || part.value.includes('\\'));
}

function literalWord(word: Word) {
    let value = '';
    for (const [index, part] of word.parts.entries()) {
        const literal = literalPart(part, index === 0);
        if (literal === null) {
            return null;
        }
        value += literal;
    }
    return value;
}

function literalPart(part: WordPart, atWordStart: boolean) {
    switch (part.type) {
        case 'Lit':
            return unquotedLiteral(part.value, atWordStart);
        case 'SglQuoted':
            return part.dollar ? null : part.value;
        case 'DblQuoted': {
            if (part.dollar) {
                return null;
            }
            const inner = part.parts.map((child) => (child.type === 'Lit' ? child.value : null));
            return inner.some((child) => child === null)
                ? null
                : unescapeDoubleQuoted(inner.join(''));
        }
        default:
            return null;
    }
}

function unquotedLiteral(raw: string, atWordStart: boolean) {
    if (atWordStart && raw.startsWith('~')) {
        return null;
    }
    let value = '';
    let braceOpen = -1;
    for (let index = 0; index < raw.length; index += 1) {
        const char = raw[index] ?? '';
        if (char === '\\') {
            const next = raw[index + 1] ?? '';
            value += next === '\n' ? '' : next;
            index += 1;
            continue;
        }
        if (char === '*' || char === '?' || char === '[') {
            return null;
        }
        if (char === '{') {
            braceOpen = index;
        } else if (
            char === '}' &&
            braceOpen >= 0 &&
            isBraceExpansion(raw.slice(braceOpen, index))
        ) {
            return null;
        }
        value += char;
    }
    return value;
}

function isBraceExpansion(body: string) {
    return body.includes(',') || body.includes('..');
}

function unescapeDoubleQuoted(raw: string) {
    return raw.replace(/\\([$`"\\\n])/gu, (_match, char: string) => (char === '\n' ? '' : char));
}

function unescapeHeredoc(raw: string) {
    return raw.replace(/\\([\\\n])/gu, (_match, char: string) => (char === '\n' ? '' : char));
}

const shellPrograms = /^(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)$/u;
const commandWrappers = new Set([
    'builtin',
    'command',
    'env',
    'exec',
    'nohup',
    'sudo',
    'time',
    'xargs',
]);

function mentionsHaus(file: File) {
    let found = false;
    walk(file, (node) => {
        found ||= node.type === 'CallExpr' && callRunsHaus(node as CallExpr);
        return !found;
    });
    return found;
}

function callRunsHaus(call: CallExpr) {
    const words = call.args.map(rawWordText);
    for (const [index, word] of words.entries()) {
        if (word === 'haus' || word.endsWith('/haus')) {
            return true;
        }
        if (shellPrograms.test(word)) {
            return words
                .slice(index + 1)
                .some((script) => /(?:^|[\s;&|(`$])haus(?:\s|$)/u.test(script));
        }
        if (!(commandWrappers.has(word) || word.startsWith('-') || word.includes('='))) {
            return false;
        }
    }
    return false;
}

function rawWordText(word: Word) {
    return word.parts
        .map((part) => {
            if (part.type === 'Lit' || part.type === 'SglQuoted') {
                return part.value;
            }
            return part.type === 'DblQuoted'
                ? part.parts.map((child) => (child.type === 'Lit' ? child.value : '')).join('')
                : '';
        })
        .join('');
}
