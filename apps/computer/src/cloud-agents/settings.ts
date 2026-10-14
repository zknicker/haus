import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CloudAgentProvider, cloudAgentProviderSchema } from '@haus/api';
import * as z from 'zod';

const settingsSchema = z.object({ defaultProvider: cloudAgentProviderSchema }).strict();

/** Computers that never chose ran Cursor, the only provider they had. */
const fallbackProvider: CloudAgentProvider = 'cursor';

/**
 * The provider `haus cloud-agent start` uses on this Computer when the Agent
 * names none. It is Computer-local, like the provider connections it chooses
 * between, and holds no credential.
 */
export async function readDefaultCloudAgentProvider(dataRoot: string): Promise<CloudAgentProvider> {
    let raw: string;
    try {
        raw = await readFile(settingsPath(dataRoot), 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return fallbackProvider;
        }
        throw error;
    }
    return settingsSchema.parse(JSON.parse(raw)).defaultProvider;
}

export async function writeDefaultCloudAgentProvider(
    dataRoot: string,
    provider: CloudAgentProvider
): Promise<void> {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    const destination = settingsPath(dataRoot);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify({ defaultProvider: provider }), {
            flag: 'wx',
            mode: 0o600,
        });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}

function settingsPath(dataRoot: string): string {
    return join(dataRoot, 'cloud-agents.json');
}
