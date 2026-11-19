import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

// Not strict: files written before W2 still carry the retired `defaultProvider` key.
const settingsSchema = z.object({
    /** This Computer's pinned Claude cloud environment; absent in files written before it existed. */
    claudeEnvironmentId: z.string().trim().min(1).max(200).nullable().default(null),
});
type Settings = z.infer<typeof settingsSchema>;

const fallbackSettings: Settings = { claudeEnvironmentId: null };

/** The Claude cloud environment this Computer's Claude launches are pinned to; `null` is unpinned. */
export async function readClaudeEnvironmentId(dataRoot: string): Promise<string | null> {
    return (await readSettings(dataRoot)).claudeEnvironmentId;
}

export async function writeClaudeEnvironmentId(
    dataRoot: string,
    environmentId: string | null
): Promise<void> {
    await writeSettings(dataRoot, {
        ...(await readSettings(dataRoot)),
        claudeEnvironmentId: environmentId,
    });
}

async function readSettings(dataRoot: string): Promise<Settings> {
    let raw: string;
    try {
        raw = await readFile(settingsPath(dataRoot), 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return fallbackSettings;
        }
        throw error;
    }
    return settingsSchema.parse(JSON.parse(raw));
}

async function writeSettings(dataRoot: string, settings: Settings): Promise<void> {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    const destination = settingsPath(dataRoot);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(settings), { flag: 'wx', mode: 0o600 });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}

// The file keeps its pre-W2 name so an upgraded Computer keeps its Claude environment pin.
function settingsPath(dataRoot: string): string {
    return join(dataRoot, 'cloud-agents.json');
}
