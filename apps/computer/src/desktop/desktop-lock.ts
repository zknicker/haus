import { type ChildProcess, spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { killProcessTree } from '../invocations/pi/shell.ts';

export interface LockedCommand {
    args: string[];
    cwd?: string;
    env: Record<string, string>;
    executable: string;
}

const supervisor = `exec 3<&0
printf 'held\\n' >&4
IFS= read -r go <&3 || exit 0
[ "$go" = go ] || exit 0
"$@" 3<&- 4>&- &
command=$!
( cat <&3; kill -KILL 0 ) >/dev/null 2>&1 4>&- &
watcher=$!
wait "$command"
status=$?
kill "$watcher"
exit "$status"`;

export async function openLockedDesktop(
    lockPath: string,
    command: LockedCommand,
    signal: AbortSignal
) {
    signal.throwIfAborted();
    const child = spawn(
        '/usr/bin/lockf',
        [
            '-k',
            lockPath,
            '/bin/sh',
            '-c',
            supervisor,
            'haus-desktop',
            command.executable,
            ...command.args,
        ],
        {
            ...(command.cwd ? { cwd: command.cwd } : {}),
            detached: true,
            env: { ...process.env, ...command.env },
            stdio: ['pipe', 'pipe', 'pipe', 'ignore', 'pipe'],
        }
    );
    const stdin = child.stdin as Writable;
    const kill = () => {
        if (child.pid !== undefined) {
            killProcessTree(child.pid);
        }
    };
    signal.addEventListener('abort', kill, { once: true });
    const closed = new Promise<void>((resolve) =>
        child.once('close', () => {
            signal.removeEventListener('abort', kill);
            resolve();
        })
    );
    try {
        await held(child, signal);
    } catch (error) {
        kill();
        drain(child);
        await closed;
        throw error;
    }
    return {
        abandon: async () => {
            stdin.end();
            drain(child);
            await closed;
        },
        child,
        closed,
        finish: () => stdin.end(),
        start: () => {
            (child.stdio[4] as Readable).resume();
            stdin.write('go\n');
        },
    };
}

export type LockedDesktop = Awaited<ReturnType<typeof openLockedDesktop>>;

function held(child: ChildProcess, signal: AbortSignal) {
    const control = child.stdio[4] as Readable;
    return new Promise<void>((resolve, reject) => {
        let stderr = '';
        child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        control.once('data', () => resolve());
        child.once('error', reject);
        child.once('close', (code) =>
            reject(
                signal.aborted
                    ? signal.reason
                    : new Error(
                          `The computer use lock could not be held (${code ?? 'signal'}): ${stderr.trim()}`
                      )
            )
        );
    });
}

function drain(child: ChildProcess) {
    child.stdout?.resume();
    child.stderr?.resume();
    (child.stdio[4] as Readable | null)?.resume();
}
