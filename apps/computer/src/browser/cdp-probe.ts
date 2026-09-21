import fs from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import type { CdpAttachment, CdpProber, CdpSnapshot } from './types.ts';

const probeTimeoutMs = 1500;
const versionSchema = z.object({
    Browser: z.string().min(1),
    webSocketDebuggerUrl: z.string().url(),
});

// Chrome writes its OS-selected port and browser target identity here.
export function readDevToolsActivePort(
    userDataDir: string
): { port: number; webSocketPath: string } | null {
    let contents: string;
    try {
        contents = fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8');
    } catch {
        return null;
    }
    const [portLine, pathLine] = contents.split('\n');
    const port = Number(portLine?.trim());
    const webSocketPath = pathLine?.trim() ?? '';
    if (
        !Number.isInteger(port) ||
        port <= 0 ||
        port > 65_535 ||
        !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/u.test(webSocketPath)
    ) {
        return null;
    }
    return { port, webSocketPath };
}

export class SystemCdpProber implements CdpProber {
    async probe(userDataDir: string): Promise<CdpSnapshot> {
        const startedAt = performance.now();
        try {
            await this.attachment(userDataDir);
            return { latencyMs: Math.round(performance.now() - startedAt), state: 'healthy' };
        } catch {
            return { latencyMs: null, state: 'unreachable' };
        }
    }

    async attachment(userDataDir: string): Promise<CdpAttachment> {
        const active = readDevToolsActivePort(userDataDir);
        if (!active) {
            throw new Error('Browser CDP endpoint is unavailable.');
        }
        const response = await fetch(`http://127.0.0.1:${active.port}/json/version`, {
            redirect: 'error',
            signal: AbortSignal.timeout(probeTimeoutMs),
        });
        if (!response.ok) {
            throw new Error('Browser CDP endpoint is unavailable.');
        }
        const payload = versionSchema.parse(await response.json());
        const endpoint = new URL(payload.webSocketDebuggerUrl);
        if (
            !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
            endpoint.protocol !== 'ws:' ||
            Number(endpoint.port) !== active.port ||
            endpoint.pathname !== active.webSocketPath
        ) {
            throw new Error('Browser CDP identity does not match this profile.');
        }
        return {
            port: active.port,
            webSocketDebuggerUrl: `ws://127.0.0.1:${active.port}${active.webSocketPath}`,
        };
    }
}
