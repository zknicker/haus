import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';

const lines = createInterface({ input: process.stdin });
const schema = z.object({ socket: z.string(), root: z.string(), control_token: z.string() });
lines.once('line', (line) => {
    const config = schema.parse(JSON.parse(line));
    writeFileSync(join(config.root, 'fixture-pid'), String(process.pid));
    const server = Bun.serve({
        unix: config.socket,
        fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === '/healthz') {
                return Response.json({ status: 'ok' });
            }
            if (path === '/worker') {
                const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
                    detached: true,
                    stdio: 'ignore',
                });
                process.stdout.write(
                    `${JSON.stringify({ event: 'worker_started', pid: worker.pid })}\n`
                );
                return Response.json(worker.pid);
            }
            return Response.json(process.pid);
        },
    });
    lines.once('close', () => {
        server.stop(true);
        process.exit(0);
    });
});
