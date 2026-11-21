export function shellPipeline(script: string) {
    const segments: string[][] = [[]];
    let word = '';
    let quote: string | null = null;
    let quoted = false;
    const push = () => {
        if (word.length > 0 || quoted) {
            segments.at(-1)?.push(word);
        }
        word = '';
        quoted = false;
    };
    for (let index = 0; index < script.length; index += 1) {
        const char = script[index] ?? '';
        if (quote) {
            if (char === quote) {
                quote = null;
            } else if (quote === '"' && expandingCharacters.has(char)) {
                return null;
            } else {
                word += char;
            }
        } else if (word === '' && !quoted && isStderrMerge(script, index)) {
            index += stderrMerge.length - 1;
        } else if (char === "'" || char === '"') {
            quote = char;
            quoted = true;
        } else if (/\s/u.test(char)) {
            push();
        } else if (char === '|' && script[index + 1] !== '|') {
            push();
            segments.push([]);
        } else if (unsafeCharacters.has(char)) {
            return null;
        } else {
            word += char;
        }
    }
    if (quote) {
        return null;
    }
    push();
    return segments.every((segment) => segment.length > 0) ? segments : null;
}

export function admitsFilter(words: readonly string[]) {
    const [program = '', ...args] = words;
    const spec = filterSpecs[program];
    if (!spec) {
        return false;
    }
    let positionals = 0;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index] ?? '';
        if (spec.valueFlags.has(arg)) {
            index += 1;
            if (!/^\d+$/u.test(args[index] ?? '')) {
                return false;
            }
        } else if (arg.startsWith('-')) {
            if (!spec.switches.test(arg)) {
                return false;
            }
        } else {
            positionals += 1;
        }
    }
    return positionals <= spec.positionals;
}

export function isPathLike(word: string) {
    return (
        /[/~*?]/u.test(word) ||
        word === '.' ||
        word === '..' ||
        /^[^.].*\.[A-Za-z0-9]{1,10}$/u.test(word)
    );
}

const stderrMerge = '2>&1';

function isStderrMerge(script: string, index: number) {
    return (
        script.startsWith(stderrMerge, index) &&
        /^(?:\s|$)/u.test(script.charAt(index + stderrMerge.length))
    );
}

const expandingCharacters = new Set(['$', '`', '\\']);

const unsafeCharacters = new Set([
    ';',
    '&',
    '|',
    '<',
    '>',
    '$',
    '`',
    '(',
    ')',
    '{',
    '}',
    '\\',
    '*',
    '?',
    '~',
    '\n',
]);

interface FilterSpec {
    readonly positionals: number;
    readonly switches: RegExp;
    readonly valueFlags: ReadonlySet<string>;
}

const filterSpecs: Readonly<Record<string, FilterSpec>> = {
    egrep: {
        positionals: 1,
        switches: /^-[iEFvcowxnqs]+$/u,
        valueFlags: new Set(['-A', '-B', '-C', '-m']),
    },
    grep: {
        positionals: 1,
        switches: /^-[iEFvcowxnqs]+$/u,
        valueFlags: new Set(['-A', '-B', '-C', '-m']),
    },
    head: { positionals: 0, switches: /^-\d+$/u, valueFlags: new Set(['-c', '-n']) },
    jq: {
        positionals: 1,
        switches:
            /^(?:-[rcjaSCMe]+|--(?:raw-output|compact-output|join-output|ascii-output|sort-keys|exit-status))$/u,
        valueFlags: new Set(),
    },
    sort: { positionals: 0, switches: /^-[nrufb]+$/u, valueFlags: new Set() },
    tail: { positionals: 0, switches: /^-\d+$/u, valueFlags: new Set(['-c', '-n']) },
    uniq: { positionals: 0, switches: /^-[cdu]+$/u, valueFlags: new Set() },
    wc: { positionals: 0, switches: /^-[lwcm]+$/u, valueFlags: new Set() },
};
