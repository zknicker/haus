import { join } from 'node:path';
import type { DrivePushOutcomeEntry } from './drive-response-schema.ts';
import { type FileStamp, sameStamp } from './folder-walk.ts';
import {
    converge,
    download,
    type OutcomeContext,
    readOnlyRoot,
    recordOf,
    respellTo,
} from './outcome-converge.ts';

export interface OwnBytes {
    sha256: string;
    stamp: FileStamp;
}

export async function applyPushOutcome(
    context: OutcomeContext,
    outcome: DrivePushOutcomeEntry,
    own: OwnBytes | null
) {
    if (own === null) {
        await applyDeleteOutcome(context, outcome);
        return;
    }
    const { files, state } = context;
    const { current, path } = outcome;
    const target = current?.path ?? path;
    const lock = readOnlyRoot(context, target);
    const asideTarget = asideTargetOf(context, outcome);
    const atPath = asideTarget ? null : own.sha256;
    const incoming = current && atPath !== current.sha256 ? await download(context, current) : null;
    if (!sameStamp(await files.stamp(path), own.stamp)) {
        await keepNewerEdit(context, outcome, own, incoming === null && asideTarget === null);
        return;
    }
    const aside = asideTarget
        ? await files.setAside(path, asideTarget, own.sha256, readOnlyRoot(context, path))
        : null;
    if (current === null) {
        await files.remove(path, lock);
        await state.forget(path);
    } else {
        await respellTo(context, path, target, lock);
        await converge(context, target, current, incoming, lock, own.stamp);
    }
    if (aside) {
        const mtimeMs = await files.release(aside);
        if (outcome.outcome === 'kept_both' && aside === asideTarget) {
            await state.record(recordOf(outcome.copy, mtimeMs));
        }
    }
}

async function keepNewerEdit(
    context: OutcomeContext,
    outcome: DrivePushOutcomeEntry,
    own: OwnBytes,
    landedOwnBytes: boolean
) {
    const { current, path } = outcome;
    if (current && landedOwnBytes) {
        await respellTo(context, path, current.path, readOnlyRoot(context, current.path));
        await context.state.record(recordOf(current, own.stamp.mtimeMs));
        return;
    }
    await context.state.markSeen(path, current?.revision_id ?? 'deleted');
}

async function applyDeleteOutcome(context: OutcomeContext, outcome: DrivePushOutcomeEntry) {
    const { files, state } = context;
    const { current, path } = outcome;
    const target = current?.path ?? path;
    const occupant = await files.occupant(target);
    if (occupant === 'variant' || current === null) {
        await state.forget(path);
        return;
    }
    if (occupant === 'exact') {
        await state.markSeen(path, current.revision_id);
        return;
    }
    const lock = readOnlyRoot(context, target);
    const incoming = await download(context, current);
    await respellTo(context, path, target, lock);
    await converge(context, target, current, incoming, lock, null);
}

function asideTargetOf(context: OutcomeContext, outcome: DrivePushOutcomeEntry) {
    if (outcome.outcome === 'kept_both') {
        return context.files.absolute(outcome.copy.path);
    }
    return outcome.outcome === 'refused'
        ? join(context.layout.refused, ...outcome.path.split('/'))
        : null;
}
