import { type ChildProcessByStdio, spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

type Holder = ChildProcessByStdio<Writable, Readable, Readable>;

export async function holdDesktopLock(lockPath: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const holder = spawn('/usr/bin/lockf', ['-k', lockPath, '/bin/cat'], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exited = new Promise<void>((resolve) => holder.once('close', () => resolve()));
    const stop = () => {
        holder.stdin.end();
        holder.kill('SIGKILL');
    };
    signal.addEventListener('abort', stop, { once: true });
    try {
        await held(holder, signal);
    } catch (error) {
        stop();
        await exited;
        throw error;
    } finally {
        signal.removeEventListener('abort', stop);
    }
    return {
        release: async () => {
            holder.stdin.end();
            await exited;
        },
    };
}

function held(holder: Holder, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        let stderr = '';
        holder.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        holder.stdin.on('error', (error) => {
            stderr += error.message;
        });
        holder.stdout.once('data', () => resolve());
        holder.once('error', reject);
        holder.once('close', (code) =>
            reject(
                signal.aborted
                    ? signal.reason
                    : new Error(
                          `The computer use lock could not be held (${code ?? 'signal'}): ${stderr.trim()}`
                      )
            )
        );
        holder.stdin.write('\n');
    });
}
