import { createHash } from 'node:crypto';
import { inferAttachmentMediaType } from '@haus/api';
import { areaOfPath, type DriveFileRecord } from './folder-state.ts';
import { catchUpSkippedHead, type OutcomeContext } from './outcome-converge.ts';
import { applyPushOutcome } from './push-outcome.ts';

export interface PlannedPut {
    path: string;
    record: DriveFileRecord | null;
    sha256: string;
}

export async function sendDelete(context: OutcomeContext, record: DriveFileRecord, pushId: string) {
    const outcome = await context.remote.delete({
        base_revision_id: record.revision_id,
        path: record.path,
        push_id: pushId,
        request_id: requestId([context.layout.writer, record.path, record.revision_id, null]),
    });
    await applyPushOutcome(context, outcome, null);
    if (record.seen_head) {
        await catchUpSkippedHead(context, record.path);
    }
}

export async function sendPut(context: OutcomeContext, put: PlannedPut, pushId: string) {
    const snapshot = await context.files.snapshot(put.path);
    const head = new Uint8Array(await Bun.file(snapshot.file).slice(0, 4096).arrayBuffer());
    const outcome = await context.remote.put(
        {
            base_revision_id: put.record?.revision_id,
            content_type: inferAttachmentMediaType(put.path, head),
            path: put.path,
            push_id: pushId,
            request_id: await putRequestId(context, put, snapshot.sha256),
        },
        snapshot.file
    );
    await applyPushOutcome(context, outcome, snapshot);
    if (put.record?.seen_head) {
        await catchUpSkippedHead(context, put.path);
    }
}

async function putRequestId(context: OutcomeContext, put: PlannedPut, sha256: string) {
    const { layout, state } = context;
    if (put.record) {
        return requestId([layout.writer, put.path, put.record.revision_id, sha256]);
    }
    const pending = state.current().pendingCreates[put.path];
    if (pending?.sha256 === sha256) {
        return pending.request_id;
    }
    const id = requestId([layout.writer, put.path, createSlot(context, put.path), sha256]);
    await state.notePendingCreate(put.path, { request_id: id, sha256 });
    return id;
}

function createSlot(context: OutcomeContext, path: string) {
    const { areas, counters, retired } = context.state.current();
    const area = areaOfPath(areas, path);
    const slot = area ? `${area.area}@${counters[area.area] ?? 0}` : 'outside@0';
    return `${slot}:${retired[path] ?? ''}`;
}

function requestId(parts: (string | null)[]) {
    return `dp_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 48)}`;
}
