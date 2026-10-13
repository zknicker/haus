import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { type ArtifactMetadata, artifactPathKey, inferAttachmentMediaType } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { displayPath, sha256File, shellArg, THEIRS_SUFFIX } from './artifact-local-files.ts';
import { manifestEntryFor, recordArtifactManifestEntry } from './artifact-manifest.ts';
import { type PushItem, planArtifactPush } from './artifact-push-plan.ts';
import {
    type ArtifactUploader,
    type ArtifactUploadInput,
    type ArtifactUploadOutcome,
    artifactMaxUploadBytes,
} from './artifact-upload.ts';

type ConflictReason = 'changed' | 'exists' | 'deleted' | 'in_progress';
interface PushConflict {
    base_revision_id: string | null;
    current: Pick<
        ArtifactMetadata,
        'creator' | 'path' | 'revision_id' | 'revision_number' | 'updated_at'
    > | null;
    local: string;
    message: string;
    path: string;
    /** The command that fetches the current head beside the local edits, when there is one. */
    pull: string | null;
    reason: ConflictReason;
}
interface Written {
    local: string;
    path: string;
    revision_id: string;
    stable_url: string;
}
export interface PushSummary {
    conflicts: PushConflict[];
    created: Written[];
    errors: { code: string; local: string; message: string; path?: string }[];
    planned?: { action: 'create' | 'update' | 'replace'; local: string; path: string }[];
    skipped: string[];
    unchanged: number;
    unmerged: string[];
    updated: Written[];
}

/** Failures a fresh request id resolves: the deterministic id names a deleted, moved, or failed upload. */
const retryWithFreshId = new Set(['DELETED', 'IDEMPOTENCY_KEY_REUSED', 'UPLOAD_CONFLICT']);

/** `haus artifact push <local> [<drive-path>]`: publishes what changed since the last pull. */
export async function runArtifactPush(args: ParsedArgs, upload: ArtifactUploader): Promise<number> {
    const [local, target] = args.positionals;
    if (!local) {
        throw new AgentCliError('INVALID_ARG', 'Name a local file or folder to push.');
    }
    const plan = await planArtifactPush(local, target);
    const title = args.values['--title'];
    if (title && plan.items.length > 1) {
        throw new AgentCliError('INVALID_ARG', '--title applies to a single-file push.');
    }
    const summary: PushSummary = {
        created: [],
        updated: [],
        unchanged: 0,
        conflicts: [],
        unmerged: [],
        errors: plan.invalid.map((entry) => ({
            code: 'INVALID_PATH',
            local: displayPath(entry.local),
            message: entry.message,
        })),
        skipped: plan.skipped.map(displayPath),
        ...(args.flags['--dry-run'] ? { planned: [] } : {}),
    };
    const options = { replace: Boolean(args.flags['--replace']), title, upload };
    for (const item of plan.items) {
        await pushOne(item, options, summary);
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.conflicts.length > 0) {
        process.stderr.write(
            `${summary.conflicts.length} file(s) changed on the drive since you last pulled them, so they were not pushed. For each, run its pull command: your edits stay, and the drive version lands beside your file as ${THEIRS_SUFFIX}. Merge it in, delete the ${THEIRS_SUFFIX} file, and push again. Use --replace only to deliberately overwrite someone else's changes.\n`
        );
    }
    if (summary.unmerged.length > 0) {
        process.stderr.write(
            `Not pushed until merged: ${summary.unmerged.join(', ')}. Merge each ${THEIRS_SUFFIX} file into its original, delete it, and push again.\n`
        );
    }
    return summary.conflicts.length + summary.errors.length + summary.unmerged.length > 0 ? 1 : 0;
}

/** Deterministic per file, content, base, and metadata, so rerunning a push never duplicates a revision. */
export function pushRequestId(
    input: Omit<ArtifactUploadInput, 'file' | 'requestId'> & { sha256: string }
) {
    const parts = [
        input.path,
        input.sha256,
        input.baseRevisionId ?? (input.replace ? 'replace' : 'create'),
        input.title ?? '',
        input.contentType,
    ];
    return `push-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 40)}`;
}

async function pushOne(
    item: PushItem,
    options: { replace: boolean; title?: string; upload: ArtifactUploader },
    summary: PushSummary
) {
    const local = displayPath(item.local);
    if (await fs.lstat(`${item.local}${THEIRS_SUFFIX}`).catch(() => null)) {
        summary.unmerged.push(local);
        return;
    }
    const file = Bun.file(item.local);
    if (file.size > artifactMaxUploadBytes) {
        summary.errors.push({
            code: 'SIZE_LIMIT',
            local,
            path: item.path,
            message: 'Files are limited to 256 MiB.',
        });
        return;
    }
    const sha256 = await sha256File(item.local);
    const entry = manifestEntryFor(item.manifest, item.local, item.path);
    if (entry?.sha256 === sha256) {
        summary.unchanged += 1;
        return;
    }
    const baseRevisionId = options.replace ? undefined : entry?.revision_id;
    if (summary.planned) {
        const action = options.replace ? 'replace' : baseRevisionId ? 'update' : 'create';
        summary.planned.push({ action, local, path: item.path });
        return;
    }
    const contentType = inferAttachmentMediaType(
        item.local,
        new Uint8Array(await file.slice(0, 4096).arrayBuffer())
    );
    const input = {
        baseRevisionId,
        contentType,
        file: item.local,
        path: item.path,
        replace: options.replace,
        title: options.title,
    };
    const outcome = await publish(options.upload, input, sha256);
    if (outcome.kind === 'published') {
        const { artifact } = outcome;
        await recordArtifactManifestEntry(item.manifest, item.local, {
            artifact_id: artifact.artifact_id,
            path: artifact.path,
            revision_id: artifact.revision_id,
            sha256: artifact.sha256,
        });
        const written = {
            local,
            path: artifact.path,
            revision_id: artifact.revision_id,
            stable_url: artifact.stable_url,
        };
        (artifact.revision_number === 1 ? summary.created : summary.updated).push(written);
    } else if (outcome.kind === 'conflict') {
        summary.conflicts.push(conflictReport(item, baseRevisionId, outcome));
    } else {
        const code = outcome.kind === 'failed' ? outcome.code : 'ARTIFACT_PUBLISH_UNCONFIRMED';
        summary.errors.push({ code, local, path: item.path, message: outcome.message });
    }
}

/**
 * One publish with two safe recoveries: a fresh request id when the deterministic one is spent,
 * and following a file that moved but did not change since the base.
 */
async function publish(
    upload: ArtifactUploader,
    input: Omit<ArtifactUploadInput, 'requestId'>,
    sha256: string,
    followedMove = false
): Promise<ArtifactUploadOutcome> {
    let outcome = await upload({ ...input, requestId: pushRequestId({ ...input, sha256 }) });
    if (outcome.kind === 'failed' && retryWithFreshId.has(outcome.code)) {
        outcome = await upload({ ...input, requestId: `push-${randomUUID()}` });
    }
    const current = outcome.kind === 'conflict' ? outcome.current : null;
    if (
        !followedMove &&
        current &&
        input.baseRevisionId === current.revision_id &&
        artifactPathKey(current.path) !== artifactPathKey(input.path)
    ) {
        return publish(upload, { ...input, path: current.path }, sha256, true);
    }
    return outcome;
}

function conflictReport(
    item: PushItem,
    base: string | undefined,
    outcome: Extract<ArtifactUploadOutcome, { kind: 'conflict' }>
): PushConflict {
    const { current } = outcome;
    let reason: ConflictReason;
    if (current) {
        reason = base ? 'changed' : 'exists';
    } else {
        reason = base ? 'deleted' : 'in_progress';
    }
    return {
        base_revision_id: base ?? null,
        current: current
            ? {
                  creator: current.creator,
                  path: current.path,
                  revision_id: current.revision_id,
                  revision_number: current.revision_number,
                  updated_at: current.updated_at,
              }
            : null,
        local: displayPath(item.local),
        message: outcome.message,
        path: item.path,
        pull: current
            ? `haus artifact pull ${shellArg(current.path)} ${shellArg(displayPath(item.local))}`
            : null,
        reason,
    };
}
