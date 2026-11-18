import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CloudAgentProvider, cloudAgentProviderSchema } from '@haus/api';
import * as z from 'zod';

const settingsSchema = z
    .object({
        defaultProvider: cloudAgentProviderSchema,
        /** This Computer's pinned Claude cloud environment; absent in files written before it existed. */
        claudeEnvironmentId: z.string().trim().min(1).max(200).nullable().default(null),
    })
    .strict();
type Settings = z.infer<typeof settingsSchema>;

/** Computers that never chose ran Cursor, the only provider they had. */
const fallbackProvider: CloudAgentProvider = 'cursor';
const fallbackSettings: Settings = { defaultProvider: fallbackProvider, claudeEnvironmentId: null };

/**
 * The provider `haus cloud-agent start` uses on this Computer when the Agent
 * names none. It is Computer-local, like the provider connections it chooses
 * between, and holds no credential.
 */
export async function readDefaultCloudAgentProvider(dataRoot: string): Promise<CloudAgentProvider> {
    return (await readSettings(dataRoot)).defaultProvider;
}

export async function writeDefaultCloudAgentProvider(
    dataRoot: string,
    provider: CloudAgentProvider
): Promise<void> {
    await writeSettings(dataRoot, { ...(await readSettings(dataRoot)), defaultProvider: provider });
}

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

/** Read-merge-write keeps one setting's write from clobbering the other's current value. */
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

function settingsPath(dataRoot: string): string {
    return join(dataRoot, 'cloud-agents.json');
}
