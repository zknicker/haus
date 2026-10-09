/** The bounded Server MCP reader stopped at its 1 MiB limit. */
export class McpResponseTooLargeError extends Error {
    constructor() {
        super('Server MCP response exceeded its 1 MiB size limit. Narrow the request.');
        this.name = 'McpResponseTooLargeError';
    }
}

export async function readMcpResponseText(response: Response): Promise<string> {
    if (!response.body) {
        throw new Error('Server MCP returned an empty response.');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            bytes += chunk.value.byteLength;
            if (bytes > 1024 * 1024) {
                throw new McpResponseTooLargeError();
            }
            chunks.push(chunk.value);
        }
        return Buffer.concat(chunks).toString('utf8');
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
}
