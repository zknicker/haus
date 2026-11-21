import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const markerFileName = 'session-authority.json';

export async function applyResetGeneration(input: {
    agentRoot: string;
    clear: () => Promise<void>;
    generation: number;
    kind: 'full' | 'session';
}) {
    const applied = await readAppliedGeneration(input.agentRoot);
    if (applied !== null && input.generation <= applied) {
        return 'current' as const;
    }
    const clears = input.kind === 'full' && input.generation > 1;
    if (clears) {
        await input.clear();
    }
    await mkdir(input.agentRoot, { mode: 0o700, recursive: true });
    const destination = join(input.agentRoot, markerFileName);
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ generation: input.generation })}\n`, {
        mode: 0o600,
    });
    await rename(temporary, destination);
    return clears ? ('cleared' as const) : ('advanced' as const);
}

async function readAppliedGeneration(agentRoot: string) {
    const file = Bun.file(join(agentRoot, markerFileName));
    if (!(await file.exists())) {
        return null;
    }
    const value = JSON.parse(await file.text()) as { generation?: unknown };
    return Number.isInteger(value.generation) && (value.generation as number) > 0
        ? (value.generation as number)
        : null;
}
