import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FakeLaunch {
    args: string[];
    cwd: string;
    env: Record<string, unknown>;
    pid: number;
}

/** A throwaway root holding a `claude` binary that runs `fake-claude.ts` and logs each launch. */
export async function createFakeDriverHarness() {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-driver-'));
    await mkdir(join(root, 'home'), { recursive: true });
    const binaryPath = join(root, 'claude');
    await writeFile(
        binaryPath,
        `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, 'fake-claude.ts')}" "$@"\n`
    );
    await chmod(binaryPath, 0o755);
    const log = join(root, 'launches.jsonl');
    return {
        async launches(): Promise<FakeLaunch[]> {
            try {
                return (await readFile(log, 'utf8'))
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => JSON.parse(line) as FakeLaunch);
            } catch {
                return [];
            }
        },
        async close() {
            await rm(root, { force: true, recursive: true });
        },
        root,
    };
}

export function signal(): AbortSignal {
    return new AbortController().signal;
}
