import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { HostedMcpDefinition } from './catalog.ts';

export interface HostedMcpProcess {
    exited: Promise<number | null>;
    request(path: string, init?: RequestInit): Promise<Response>;
    stop(): Promise<void>;
}

export async function openHostedMcpProcess(
    definition: HostedMcpDefinition,
    storageRoot: string
): Promise<HostedMcpProcess> {
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'haus-mcp-'));
    const socket = join(temporaryRoot, 'http.sock');
    const controlToken = randomBytes(32).toString('base64url');
    const child = spawn(definition.command[0], definition.command.slice(1), {
        cwd: definition.cwd,
        detached: true,
        env: definition.environment,
        stdio: ['pipe', 'pipe', 'ignore'],
    });
    const workerGroups = new Set<number>();
    const events = createInterface({ input: child.stdout });
    events.on('line', (line) => {
        if (line.length > 512) {
            return;
        }
        try {
            const event: unknown = JSON.parse(line);
            if (
                typeof event !== 'object' ||
                event === null ||
                !('pid' in event) ||
                !('event' in event) ||
                typeof event.pid !== 'number' ||
                !Number.isSafeInteger(event.pid) ||
                event.pid <= 1
            ) {
                return;
            }
            if (event.event === 'worker_started') {
                workerGroups.add(event.pid);
            }
            if (event.event === 'worker_stopped') {
                workerGroups.delete(event.pid);
            }
        } catch {
            // Arbitrary connector output is discarded, never logged.
        }
    });
    // A private stdin pipe carries startup authority and detects parent death.
    child.stdin.on('error', () => undefined);
    const exited = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
    });
    // Install rejection handling before spawn can fail while readiness is probing.
    void exited.catch(() => undefined);
    child.stdin.write(
        `${JSON.stringify({ root: storageRoot, socket, control_token: controlToken })}\n`
    );
    let stopping: Promise<void> | undefined;
    return {
        exited,
        request(path, init) {
            const headers = new Headers(init?.headers);
            headers.set('Host', 'localhost:80');
            if (path === '/accounts' || path.startsWith('/accounts/')) {
                headers.set('Authorization', `Bearer ${controlToken}`);
            }
            return fetch(`http://localhost${path}`, {
                ...init,
                headers,
                redirect: 'error',
                unix: socket,
            });
        },
        stop() {
            stopping ??= stop();
            return stopping;
        },
    };

    async function stop() {
        child.stdin.end();
        signalGroup('SIGTERM');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                exited.catch(() => undefined),
                new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, 3000);
                }),
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
            // Account workers own groups so call timeout can reap their descendants too.
            for (const pid of workerGroups) {
                signalGroup('SIGKILL', pid);
            }
            signalGroup('SIGKILL');
            events.close();
            await exited.catch(() => undefined);
            await rm(temporaryRoot, { recursive: true, force: true });
        }
    }

    function signalGroup(signal: NodeJS.Signals, pid = child.pid) {
        if (pid === undefined) {
            return;
        }
        try {
            process.kill(-pid, signal);
        } catch (cause) {
            if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) {
                throw cause;
            }
        }
    }
}
