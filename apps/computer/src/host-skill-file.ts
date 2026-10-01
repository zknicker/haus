import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type HostSkillFileRequest,
    type HostSkillFileResult,
    hostSkillFileMaxBytes,
    hostSkillFileRequestSchema,
} from '@haus/api';
import { reportStateError } from './computer-report.ts';
import { findHostSkillSource } from './host-skills.ts';

export function parseHostSkillFileRequest(frame: unknown): HostSkillFileRequest | null {
    const parsed = hostSkillFileRequestSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Answers a relayed host skill read; returns false when the frame is not one. */
export function handleHostSkillFileRequest(
    frame: unknown,
    input: { send(frame: unknown): boolean; track<T>(work: Promise<T>): Promise<T> }
): boolean {
    const request = parseHostSkillFileRequest(frame);
    if (!request) {
        return false;
    }
    void input.track(
        runHostSkillFileRequest(request)
            .then((result) => input.send(result))
            .catch(reportStateError)
    );
    return true;
}

/**
 * Reads one host-installed skill's `SKILL.md` for an operator preview. The
 * directory is never taken from the wire: the opaque source id is resolved
 * against a fresh scan of this Computer's own host skill roots.
 */
export async function runHostSkillFileRequest(
    request: HostSkillFileRequest,
    roots?: string[]
): Promise<HostSkillFileResult> {
    const base = { requestId: request.requestId, type: 'host-skill-file-result' } as const;
    try {
        const source = await findHostSkillSource(request.sourceId, roots);
        if (!source) {
            return { ...base, error: 'not-found', status: 'failed' };
        }
        const content = await readCappedFile(join(source.directory, 'SKILL.md'));
        return content === null
            ? { ...base, error: 'too-large', status: 'failed' }
            : { ...base, content, status: 'read' };
    } catch (cause) {
        if (isMissingFile(cause)) {
            return { ...base, error: 'not-found', status: 'failed' };
        }
        return { ...base, error: 'unreadable', status: 'failed' };
    }
}

/**
 * Returns null when the file exceeds the relay cap; rechecks bytes read in case
 * it grew. A symlinked `SKILL.md` is refused, as the bundle import refuses it,
 * so the preview cannot reach a file the skill directory merely points at.
 */
async function readCappedFile(path: string): Promise<string | null> {
    const info = await lstat(path);
    if (!info.isFile()) {
        throw new Error('SKILL.md is not a regular file.');
    }
    if (info.size > hostSkillFileMaxBytes) {
        return null;
    }
    const bytes = await readFile(path);
    return bytes.byteLength > hostSkillFileMaxBytes ? null : bytes.toString('utf8');
}

function isMissingFile(cause: unknown) {
    return (
        cause instanceof Error &&
        'code' in cause &&
        (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
    );
}
