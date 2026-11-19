import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSeedConfiguration } from '../agent-configuration.ts';
import { type AgentDrive, agentDrive, recordAgentDriveHandle } from '../drive/agent-drive.ts';
import { exists } from '../workspace-volumes/workspace-volume.ts';
import { type DriveEntryOutcome, resolveEntries } from './drive-outcomes.ts';
import { applyOutcome, refusedLocation, removeLegacyDirectories } from './drive-placement.ts';
import { legacyEntries, seedEntries, sha256Of } from './drive-sources.ts';
import { type DriveAuthority, DriveMigrationError } from './drive-upload.ts';

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

export interface DriveMigration {
    conflicts: { copy: string; path: string }[];
    drive: AgentDrive;
    memory: DriveMemoryDigests | null;
    moved: number;
    refused: { location: string; path: string; reason: string }[];
}

export async function prepareAgentDrive(input: PrepareAgentDriveInput) {
    await recordAgentDriveHandle(input.agentRoot, input.handle);
    const drive = agentDrive(input.agentRoot, input.handle);
    if (await hasSeedReceipt(input.agentRoot)) {
        return {
            conflicts: [],
            drive,
            memory: null,
            moved: 0,
            refused: [],
        } satisfies DriveMigration;
    }
    const entries = await sourceEntries(input, drive);
    const outcomes = await resolveEntries(entries, drive.handle, input);
    const unsettled = outcomes.flatMap((outcome) =>
        outcome.kind === 'transient' ? [`${outcome.entry.drivePath} (${outcome.reason})`] : []
    );
    if (unsettled.length > 0) {
        throw new DriveMigrationError(`Drive did not take ${unsettled.join(', ')}.`);
    }
    for (const outcome of outcomes) {
        await applyOutcome(input.agentRoot, drive, outcome);
    }
    await removeLegacyDirectories(input.agentRoot);
    const migration = {
        conflicts: outcomes.flatMap((outcome) =>
            outcome.kind === 'kept-both'
                ? [{ copy: outcome.copy.drivePath, path: outcome.entry.drivePath }]
                : []
        ),
        drive,
        memory: await memoryDigests(drive, outcomes),
        moved: entries.length,
        refused: outcomes.flatMap((outcome) =>
            outcome.kind === 'refused'
                ? [
                      {
                          location: refusedLocation(outcome.entry),
                          path: outcome.entry.drivePath,
                          reason: outcome.reason,
                      },
                  ]
                : []
        ),
    } satisfies DriveMigration;
    await writeSeedReceipt(input.agentRoot, migration);
    return migration;
}

export function driveMigrationTrace(migration: DriveMigration) {
    const { drive, memory } = migration;
    return [
        memory
            ? `Drive prepared agents/${drive.handle}/: MEMORY.md before=${memory.before} revision=${memory.revisionId ?? 'none'} after=${memory.after ?? 'none'}\n`
            : `Drive prepared agents/${drive.handle}/ with no MEMORY.md to move.\n`,
        ...migration.conflicts.map(
            (conflict) =>
                `Drive kept both at ${conflict.path}; the legacy copy is ${conflict.copy}\n`
        ),
        ...migration.refused.map(
            (refusal) =>
                `Drive refused ${refusal.path} (${refusal.reason}); kept at ${refusal.location}\n`
        ),
    ].join('');
}

async function sourceEntries(input: PrepareAgentDriveInput, drive: AgentDrive) {
    const legacy = await legacyEntries(input.agentRoot, drive);
    if (legacy.length > 0 || (await exists(drive.memory))) {
        return legacy;
    }
    return await seedEntries(input.agentRoot, drive, input.seed);
}

async function memoryDigests(drive: AgentDrive, outcomes: readonly DriveEntryOutcome[]) {
    const outcome = outcomes.find(
        (candidate) => candidate.entry.drivePath === `agents/${drive.handle}/MEMORY.md`
    );
    if (!outcome) {
        return null;
    }
    const after = (await exists(drive.memory)) ? await readFile(drive.memory) : null;
    return {
        after: after ? sha256Of(after) : null,
        before: outcome.entry.sha256,
        revisionId: outcome.kind === 'stored' ? outcome.revisionId : null,
    } satisfies DriveMemoryDigests;
}

function receiptPath(agentRoot: string) {
    return join(agentRoot, 'runtime', 'drive-seed.json');
}

async function hasSeedReceipt(agentRoot: string) {
    return await exists(receiptPath(agentRoot));
}

async function writeSeedReceipt(agentRoot: string, migration: DriveMigration) {
    const destination = receiptPath(agentRoot);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    const { conflicts, memory, refused } = migration;
    await writeFile(
        temporary,
        `${JSON.stringify({ completedAt: new Date().toISOString(), conflicts, memory, refused, version: 1 })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, destination);
}
