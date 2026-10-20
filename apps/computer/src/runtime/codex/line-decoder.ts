/**
 * Splits a byte stream into complete lines. A chunk may end mid-line or mid-UTF-8 sequence; the
 * partial tail waits for the next chunk, so a JSON-RPC message is parsed only once whole.
 */
export function createLineDecoder(onLine: (line: string) => void) {
    const decoder = new TextDecoder();
    let pending = '';
    const emit = (text: string) => {
        const lines = (pending + text).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
            if (trimmed.trim().length > 0) {
                onLine(trimmed);
            }
        }
    };
    return {
        /** Flushes a final line the stream ended without a newline. */
        end() {
            emit(decoder.decode());
            if (pending.trim().length > 0) {
                onLine(pending);
            }
            pending = '';
        },
        push(chunk: Uint8Array) {
            emit(decoder.decode(chunk, { stream: true }));
        },
    };
}
