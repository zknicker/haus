import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CloudAgentComputerSettings, cloudAgentComputerSettingsSchema } from '@haus/api';

export type CloudAgentSettings = CloudAgentComputerSettings;
const writes = new Map<string, Promise<unknown>>();

export async function readCloudAgentSettings(dataRoot: string): Promise<CloudAgentSettings> {
    try {
        return cloudAgentComputerSettingsSchema.parse(
            JSON.parse(await readFile(join(dataRoot, 'cloud-agents.json'), 'utf8'))
        );
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return { defaultProvider: 'cursor', claudeEnvironmentId: null };
        }
        throw error;
    }
}

/** Computer configuration contains no provider credential and never changes Claude's defaults. */
export async function writeCloudAgentSettings(
    dataRoot: string,
    update: Partial<CloudAgentSettings>
): Promise<CloudAgentSettings> {
    const previous = writes.get(dataRoot) ?? Promise.resolve();
    const operation = previous
        .catch(() => undefined)
        .then(() => persistCloudAgentSettings(dataRoot, update));
    writes.set(dataRoot, operation);
    try {
        return await operation;
    } finally {
        if (writes.get(dataRoot) === operation) {
            writes.delete(dataRoot);
        }
    }
}

async function persistCloudAgentSettings(
    dataRoot: string,
    update: Partial<CloudAgentSettings>
): Promise<CloudAgentSettings> {
    const settings = cloudAgentComputerSettingsSchema.parse({
        ...(await readCloudAgentSettings(dataRoot)),
        ...update,
    });
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    const destination = join(dataRoot, 'cloud-agents.json');
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(settings), { mode: 0o600, flag: 'wx' });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
    return settings;
}
