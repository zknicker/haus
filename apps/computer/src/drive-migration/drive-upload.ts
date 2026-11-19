import { inferAttachmentMediaType } from '@haus/api';
import { readUploadResponse } from '../agent-cli/commands/artifact-upload.ts';
import { applyServerAcceptEncoding } from '../server-encoding.ts';
import { type DriveSeedEntry, sha256Of } from './drive-sources.ts';

export interface DriveAuthority {
    agentId: string;
    runId: string;
    runnerToken: string;
    serverOrigin: string;
}

export type DriveAnswer =
    | { kind: 'stored'; revisionId: string }
    | { kind: 'occupied' }
    | { kind: 'refused'; reason: string }
    | { kind: 'transient'; reason: string };

export class DriveMigrationError extends Error {
    override name = 'DriveMigrationError';
}

const failureKinds: Partial<Record<string, 'occupied' | 'transient'>> = {
    AUTH_UNAVAILABLE: 'transient',
    DELETED: 'transient',
    NOT_FOUND: 'transient',
    PATH_TAKEN: 'occupied',
    STORAGE_UNAVAILABLE: 'transient',
    UNAUTHORIZED: 'transient',
    UPLOAD_CONFLICT: 'transient',
};
const transientStatuses = new Set([401, 404, 408, 429]);

export async function uploadToDrive(entry: DriveSeedEntry, authority: DriveAuthority) {
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', authority.serverOrigin);
    url.searchParams.set('path', entry.drivePath);
    url.searchParams.set('request_id', driveMigrationRequestId(authority, entry));
    url.searchParams.set(
        'content_type',
        inferAttachmentMediaType(entry.drivePath, entry.bytes.subarray(0, 4096))
    );
    let response: Response;
    try {
        response = await fetch(url, {
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
        });
    } catch (cause) {
        return transient(`Drive did not answer: ${(cause as Error).message}`);
    }
    const outcome = await readUploadResponse(response);
    switch (outcome.kind) {
        case 'published':
            return outcome.artifact.sha256 === entry.sha256
                ? stored(outcome.artifact.revision_id)
                : transient('Drive answered with other bytes.');
        case 'conflict':
            return outcome.current?.sha256 === entry.sha256
                ? stored(outcome.current.revision_id)
                : ({ kind: 'occupied' } satisfies DriveAnswer);
        case 'unconfirmed':
            return transient(`Drive's answer could not be read (HTTP ${response.status}).`);
        case 'failed':
            return failed(response.status, outcome.code, `${outcome.code} ${outcome.message}`);
        default:
            return outcome satisfies never;
    }
}

function failed(status: number, code: string, reason: string) {
    const kind =
        failureKinds[code] ??
        (status >= 400 && status < 500 && !transientStatuses.has(status) ? 'refused' : 'transient');
    return kind === 'occupied'
        ? ({ kind } satisfies DriveAnswer)
        : ({ kind, reason } satisfies DriveAnswer);
}

function driveMigrationRequestId(authority: DriveAuthority, entry: DriveSeedEntry) {
    return sha256Of(
        new TextEncoder().encode(
            `drive-migration\0${authority.agentId}\0${authority.runId}\0${entry.drivePath}\0${entry.sha256}`
        )
    );
}

function stored(revisionId: string) {
    return { kind: 'stored', revisionId } satisfies DriveAnswer;
}

function transient(reason: string) {
    return { kind: 'transient', reason } satisfies DriveAnswer;
}
