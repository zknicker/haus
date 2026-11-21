export function parsePlist(xml: string) {
    const start = xml.indexOf('<plist');
    if (start === -1) {
        throw new Error('The property list has no <plist> element.');
    }
    const tokens = [...xml.slice(start).matchAll(tokenPattern)]
        .map(toToken)
        .filter((token) => token.kind !== 'text' || token.text.trim() !== '');
    const cursor = { index: 1 };
    return readValue(tokens, cursor);
}

type Token =
    | { kind: 'close'; name: string }
    | { kind: 'empty'; name: string }
    | { kind: 'open'; name: string }
    | { kind: 'text'; text: string };

const tokenPattern = /<(?<close>\/)?(?<name>[a-z]+)(?:\s[^>]*?)?(?<empty>\/)?>|(?<text>[^<]+)/giu;

const entities: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };

function readValue(tokens: Token[], cursor: { index: number }) {
    const token = next(tokens, cursor);
    if (token.kind === 'empty') {
        return emptyValue(token.name);
    }
    if (token.kind !== 'open') {
        throw new Error('The property list has a value outside an element.');
    }
    switch (token.name) {
        case 'dict':
            return readDict(tokens, cursor);
        case 'array':
            return readArray(tokens, cursor);
        case 'integer':
        case 'real':
            return Number(readText(tokens, cursor, token.name));
        case 'string':
        case 'date':
        case 'data':
            return readText(tokens, cursor, token.name);
        default:
            throw new Error(`The property list has an unknown <${token.name}> element.`);
    }
}

function readDict(tokens: Token[], cursor: { index: number }) {
    const dict: Record<string, unknown> = {};
    while (!closes(tokens[cursor.index], 'dict')) {
        const key = next(tokens, cursor);
        if (key.kind !== 'open' || key.name !== 'key') {
            throw new Error('The property list has a dict entry without a key.');
        }
        dict[readText(tokens, cursor, 'key')] = readValue(tokens, cursor);
    }
    cursor.index += 1;
    return dict;
}

function readArray(tokens: Token[], cursor: { index: number }) {
    const array: unknown[] = [];
    while (!closes(tokens[cursor.index], 'array')) {
        array.push(readValue(tokens, cursor));
    }
    cursor.index += 1;
    return array;
}

function readText(tokens: Token[], cursor: { index: number }, name: string) {
    const token = next(tokens, cursor);
    if (closes(token, name)) {
        return '';
    }
    if (token.kind !== 'text' || !closes(next(tokens, cursor), name)) {
        throw new Error(`The property list has a malformed <${name}> element.`);
    }
    return token.text;
}

function emptyValue(name: string) {
    const values: Record<string, unknown> = {
        array: [],
        data: '',
        dict: {},
        false: false,
        string: '',
        true: true,
    };
    if (!(name in values)) {
        throw new Error(`The property list has an empty <${name}> element.`);
    }
    return values[name];
}

function next(tokens: Token[], cursor: { index: number }) {
    const token = tokens[cursor.index];
    if (!token) {
        throw new Error('The property list ends early.');
    }
    cursor.index += 1;
    return token;
}

function closes(token: Token | undefined, name: string) {
    return token?.kind === 'close' && token.name === name;
}

function toToken(match: RegExpMatchArray) {
    const groups = match.groups ?? {};
    if (groups.text !== undefined) {
        return { kind: 'text', text: decodeEntities(groups.text) } satisfies Token;
    }
    const name = groups.name ?? '';
    if (groups.close) {
        return { kind: 'close', name } satisfies Token;
    }
    return { kind: groups.empty ? 'empty' : 'open', name } satisfies Token;
}

function decodeEntities(text: string) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, entity: string) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        }
        if (entity.startsWith('#')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        }
        return entities[entity] ?? whole;
    });
}
