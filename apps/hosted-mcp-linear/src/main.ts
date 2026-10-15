import * as z from 'zod';
import { createLinearMcpHandler } from './mcp-http.ts';

// The Server spawns this process (ADR 0042): configuration arrives as one
// stdin line, MCP is served on the private socket, and stdin closing means the
// Server is gone. The connector holds no credentials and writes no output.

const startupSchema = z.object({
    control_token: z.string().min(1),
    root: z.string().min(1),
    socket: z.string().min(1),
});

process.umask(0o077);
const reader = Bun.stdin.stream().getReader();
const startup = startupSchema.parse(JSON.parse(await readFirstLine(reader)));
const server = Bun.serve({
    error: () => new Response(null, { status: 500 }),
    fetch: createLinearMcpHandler(),
    maxRequestBodySize: 1_048_576,
    unix: startup.socket,
});
while (!(await reader.read()).done) {
    // Drain until the Server closes the pipe.
}
await server.stop(true);
process.exit(0);

async function readFirstLine(stream: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffered = '';
    for (;;) {
        const { done, value } = await stream.read();
        if (done) {
            throw new Error('Startup configuration did not arrive.');
        }
        buffered += decoder.decode(value, { stream: true });
        const newline = buffered.indexOf('\n');
        if (newline >= 0) {
            return buffered.slice(0, newline);
        }
    }
}
