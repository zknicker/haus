export const memoryCharacterCap = 8000;

export const memoryFileName = 'MEMORY.md';

export function formatMemoryBlock(content: string) {
    const body = content.trimEnd();
    const capped = body.length > memoryCharacterCap ? cutAtLine(body) : body;
    return [
        '<haus-memory>',
        `Your ${memoryFileName}, as it is now. Haus puts it here whenever it changed since this session last saw it.`,
        '',
        capped,
        ...(capped === body ? [] : ['', capNotice(body.length)]),
        '</haus-memory>',
    ].join('\n');
}

function capNotice(length: number) {
    return `[${memoryFileName} is ${length.toLocaleString('en-US')} characters, over the ${memoryCharacterCap.toLocaleString('en-US')}-character cap, so Haus cut it at the last full line above. Tighten ${memoryFileName} under ${memoryCharacterCap.toLocaleString('en-US')} characters: move detail into notes/ and keep a pointer to it.]`;
}

function cutAtLine(body: string) {
    const lastBreak = body.lastIndexOf('\n', memoryCharacterCap);
    return (lastBreak > 0 ? body.slice(0, lastBreak) : body.slice(0, memoryCharacterCap)).trimEnd();
}
