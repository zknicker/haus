import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeTrace(
    input: { dirs: { runtime: string }; command: { runId: string } },
    content: string
) {
    // Raw traces are Computer-local; only the compact summary leaves.
    await writeFile(join(input.dirs.runtime, `turn-${input.command.runId}.log`), content, {
        mode: 0o600,
    });
}

export function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
