import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSeedConfiguration } from '../agent-configuration.ts';
import { type AgentDrive, agentDrive, recordAgentDriveHandle } from '../drive/agent-drive.ts';
import { exists } from '../workspace-volumes/workspace-volume.ts';
import { placeEntry, removeLegacyDirectories } from './drive-placement.ts';
import { type DriveSeedEntry, legacyEntries, seedEntries, sha256Of } from './drive-sources.ts';
import { type DriveAuthority, type DriveUpload, uploadEntries } from './drive-upload.ts';

export { DriveMigrationError } from './drive-upload.ts';

export interface PrepareAgentDriveInput extends DriveAuthority {
    agentRoot: string;
    handle: string;
    seed: AgentSeedConfiguration;
}

export interface DriveMemoryDigests {
    after: string | null;
    before: string;
    revisionId: string | null;
}

export async function prepareAgentDrive(input: PrepareAgentDriveInput) {
    await recordAgentDriveHandle(input.agentRoot, input.handle);
    const drive = agentDrive(input.agentRoot, input.handle);
    if (await hasSeedReceipt(input.agentRoot)) {
        return { drive, memory: null, moved: 0 };
    }
    const entries = await sourceEntries(input, drive);
    const uploads = await uploadEntries(entries, input);
    for (const [index, entry] of entries.entries()) {
        if (uploads[index]?.kind === 'stored') {
            await placeEntry(drive, entry);
        }
    }
    await removeLegacyDirectories(input.agentRoot);
    const memory = await memoryDigests(drive, entries, uploads);
    await writeSeedReceipt(input.agentRoot, memory);
    return { drive, memory, moved: entries.length };
}

export function driveMemoryTraceLine(drive: AgentDrive, memory: DriveMemoryDigests | null) {
    return memory
        ? `Drive prepared agents/${drive.handle}/: MEMORY.md before=${memory.before} revision=${memory.revisionId ?? 'none'} after=${memory.after ?? 'none'}\n`
        : `Drive prepared agents/${drive.handle}/ with no MEMORY.md to move.\n`;
}

async function sourceEntries(input: PrepareAgentDriveInput, drive: AgentDrive) {
    const legacy = await legacyEntries(input.agentRoot, drive);
    if (legacy.length > 0 || (await exists(drive.memory))) {
        return legacy;
    }
    return await seedEntries(input.agentRoot, drive, input.seed);
}

async function memoryDigests(
    drive: AgentDrive,
    entries: readonly DriveSeedEntry[],
    uploads: readonly DriveUpload[]
) {
    const index = entries.findIndex(
        (entry) => entry.drivePath === `agents/${drive.handle}/MEMORY.md`
    );
    const entry = entries[index];
    if (!entry) {
        return null;
    }
    const after = (await exists(drive.memory)) ? await readFile(drive.memory) : null;
    return {
        after: after ? sha256Of(after) : null,
        before: entry.sha256,
        revisionId: uploads[index]?.revisionId ?? null,
    } satisfies DriveMemoryDigests;
}

function receiptPath(agentRoot: string) {
    return join(agentRoot, 'runtime', 'drive-seed.json');
}

async function hasSeedReceipt(agentRoot: string) {
    return await exists(receiptPath(agentRoot));
}

async function writeSeedReceipt(agentRoot: string, memory: DriveMemoryDigests | null) {
    const destination = receiptPath(agentRoot);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(
        temporary,
        `${JSON.stringify({ completedAt: new Date().toISOString(), memory, version: 1 })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, destination);
}
