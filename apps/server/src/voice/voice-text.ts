/** Byte bounds also conservatively bound tokens, without splitting a Unicode character. */
export function voiceTextChunks(text: string, maxBytes = 450) {
    const chunks: string[] = [];
    let chunk = '';
    let bytes = 0;
    for (const character of text) {
        const width = Buffer.byteLength(character);
        if (bytes + width > maxBytes) {
            chunks.push(chunk);
            chunk = '';
            bytes = 0;
        }
        chunk += character;
        bytes += width;
    }
    if (chunk) {
        chunks.push(chunk);
    }
    return chunks;
}

export function liveHistory(messages: { agentId: string | null; content: string }[]) {
    let remaining = 6000;
    const result: {
        type: 'message';
        role: 'assistant' | 'user';
        content: { type: 'output_text' | 'input_text'; text: string }[];
    }[] = [];
    for (const message of [...messages].reverse()) {
        if (remaining < 4) {
            break;
        }
        const text = voiceTextChunks(message.content, Math.min(remaining, 1500))[0] ?? '';
        if (!text) {
            continue;
        }
        remaining -= Buffer.byteLength(text);
        result.unshift({
            type: 'message',
            role: message.agentId ? 'assistant' : 'user',
            content: [
                {
                    type: message.agentId ? 'output_text' : 'input_text',
                    text,
                },
            ],
        });
    }
    return result;
}
