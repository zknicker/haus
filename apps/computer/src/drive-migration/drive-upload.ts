import { inferAttachmentMediaType } from '@haus/api';
import { readUploadResponse } from '../agent-cli/commands/artifact-upload.ts';
import { applyServerAcceptEncoding } from '../server-encoding.ts';
import { type DriveSeedEntry, sha256Of } from './drive-sources.ts';

export interface DriveAuthority {
    agentId: string;
    runnerToken: string;
    serverOrigin: string;
}

export type DriveUpload =
    | { kind: 'stored'; revisionId: string; sha256: string }
    | { kind: 'occupied'; revisionId: string | null; sha256: string | null };

export class DriveMigrationError extends Error {
    override name = 'DriveMigrationError';
}

const uploadConcurrency = 8;

export async function uploadEntries(entries: readonly DriveSeedEntry[], authority: DriveAuthority) {
    const uploads: DriveUpload[] = [];
    for (let start = 0; start < entries.length; start += uploadConcurrency) {
        uploads.push(
            ...(await Promise.all(
                entries
                    .slice(start, start + uploadConcurrency)
                    .map((entry) => uploadEntry(entry, authority))
            ))
        );
    }
    return uploads;
}

async function uploadEntry(entry: DriveSeedEntry, authority: DriveAuthority) {
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', authority.serverOrigin);
    url.searchParams.set('path', entry.drivePath);
    url.searchParams.set('request_id', driveMigrationRequestId(authority.agentId, entry));
    url.searchParams.set(
        'content_type',
        inferAttachmentMediaType(entry.drivePath, entry.bytes.subarray(0, 4096))
    );
    const response = await fetch(url, {
        body: entry.bytes,
        headers: applyServerAcceptEncoding(
            new Headers({
                authorization: `Bearer ${authority.runnerToken}`,
                'content-length': String(entry.bytes.byteLength),
                'content-type': 'application/octet-stream',
            })
        ),
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
    }).catch((cause: unknown) => {
        throw new DriveMigrationError(`Drive did not answer for ${entry.drivePath}.`, { cause });
    });
    const outcome = await readUploadResponse(response);
    if (outcome.kind === 'published') {
        if (outcome.artifact.sha256 !== entry.sha256) {
            throw new DriveMigrationError(`Drive stored other bytes at ${entry.drivePath}.`);
        }
        return stored(outcome.artifact);
    }
    const current = outcome.kind === 'conflict' ? outcome.current : null;
    if (current?.sha256 === entry.sha256) {
        return stored(current);
    }
    const occupied =
        outcome.kind === 'conflict' || (outcome.kind === 'failed' && outcome.code === 'PATH_TAKEN');
    if (occupied && entry.legacyPath === null) {
        return {
            kind: 'occupied',
            revisionId: current?.revision_id ?? null,
            sha256: current?.sha256 ?? null,
        } satisfies DriveUpload;
    }
    throw new DriveMigrationError(
        `Drive refused ${entry.drivePath}: ${outcome.kind === 'failed' ? `${outcome.code} ` : ''}${outcome.message}`
    );
}

function driveMigrationRequestId(agentId: string, entry: DriveSeedEntry) {
    return sha256Of(
        new TextEncoder().encode(`drive-migration\0${agentId}\0${entry.drivePath}\0${entry.sha256}`)
    );
}

function stored(artifact: { revision_id: string; sha256: string }) {
    return {
        kind: 'stored',
        revisionId: artifact.revision_id,
        sha256: artifact.sha256,
    } satisfies DriveUpload;
}
