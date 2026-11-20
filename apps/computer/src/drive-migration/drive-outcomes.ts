import { artifactConflictCopyPath } from '@haus/api';
import type { DriveSeedEntry } from './drive-sources.ts';
import { type DriveAuthority, uploadToDrive } from './drive-upload.ts';

export type DriveEntryOutcome =
    | { entry: DriveSeedEntry; kind: 'stored'; revisionId: string }
    | { entry: DriveSeedEntry; kind: 'skipped' }
    | { copy: DriveSeedEntry; entry: DriveSeedEntry; kind: 'kept-both' }
    | { entry: DriveSeedEntry; kind: 'refused'; reason: string }
    | { entry: DriveSeedEntry; kind: 'transient'; reason: string };

const uploadConcurrency = 8;
const copyNameAttempts = 100;

export async function resolveEntries(
    entries: readonly DriveSeedEntry[],
    handle: string,
    authority: DriveAuthority
) {
    const outcomes: DriveEntryOutcome[] = [];
    for (let start = 0; start < entries.length; start += uploadConcurrency) {
        outcomes.push(
            ...(await Promise.all(
                entries
                    .slice(start, start + uploadConcurrency)
                    .map((entry) => resolveEntry(entry, handle, authority))
            ))
        );
    }
    return outcomes;
}

async function resolveEntry(entry: DriveSeedEntry, handle: string, authority: DriveAuthority) {
    const answer = await uploadToDrive(entry, authority);
    const legacy = entry.legacyPath !== null;
    switch (answer.kind) {
        case 'stored':
            return {
                entry,
                kind: 'stored',
                revisionId: answer.revisionId,
            } satisfies DriveEntryOutcome;
        case 'occupied':
            return legacy
                ? await keepBoth(entry, handle, authority)
                : ({ entry, kind: 'skipped' } satisfies DriveEntryOutcome);
        case 'refused':
            return legacy
                ? ({ entry, kind: 'refused', reason: answer.reason } satisfies DriveEntryOutcome)
                : ({ entry, kind: 'skipped' } satisfies DriveEntryOutcome);
        case 'transient':
            return { entry, kind: 'transient', reason: answer.reason } satisfies DriveEntryOutcome;
        default:
            return answer satisfies never;
    }
}

async function keepBoth(entry: DriveSeedEntry, handle: string, authority: DriveAuthority) {
    for (let n = 1; n <= copyNameAttempts; n += 1) {
        const copy = { ...entry, drivePath: artifactConflictCopyPath(entry.drivePath, handle, n) };
        const answer = await uploadToDrive(copy, authority);
        if (answer.kind === 'stored') {
            return { copy, entry, kind: 'kept-both' } satisfies DriveEntryOutcome;
        }
        if (answer.kind !== 'occupied') {
            return { entry, ...answer } satisfies DriveEntryOutcome;
        }
    }
    return {
        entry,
        kind: 'transient',
        reason: `No free conflict copy name for ${entry.drivePath}.`,
    } satisfies DriveEntryOutcome;
}
