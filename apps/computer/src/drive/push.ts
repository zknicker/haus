import { createHash } from 'node:crypto';
import { inferAttachmentMediaType } from '@haus/api';
import { DriveRemoteError, type DriveRemote } from './drive-remote.ts';
import { folderFiles, isSkippedPath, sha256File } from './folder-files.ts';
import { SymlinkedFolderError } from './folder-spelling.ts';
import {
    areaOfPath,
    type DriveFileRecord,
    type DriveFolderLayout,
    openFolderState,
    unplacedMtimeMs,
} from './folder-state.ts';
import {
    applyPushOutcome,
    catchUpSkippedHead,
    type OutcomeContext,
    restoreUnplaced,
} from './push-outcome.ts';

export async function planDrivePush(layout: DriveFolderLayout) {
    const state = await openFolderState(layout);
    const files = folderFiles(layout);
    const local = await files.walk();
    const records = state.current().files;
    const linked: string[] = [];
    const missing: DriveFileRecord[] = [];
    for (const record of Object.values(records).sort((a, b) => a.path.localeCompare(b.path))) {
        if (isSkippedPath(record.path) || local.has(record.path)) {
            continue;
        }
        if (await files.underLink(record.path)) {
            linked.push(record.path);
        } else {
            missing.push(record);
        }
    }
    const deletes = missing.filter((record) => record.mtime_ms !== unplacedMtimeMs);
    const restores = missing.filter((record) => record.mtime_ms === unplacedMtimeMs);
    const puts: { path: string; record: DriveFileRecord | null; sha256: string }[] = [];
    for (const [path, stat] of [...local].sort(([a], [b]) => a.localeCompare(b))) {
        const record = records[path] ?? null;
        if (record && stat.size === record.size_bytes && stat.mtimeMs === record.mtime_ms) {
            continue;
        }
        const sha256 = await sha256File(files.absolute(path));
        if (record?.sha256 === sha256) {
            await state.record({ ...record, mtime_ms: stat.mtimeMs });
            continue;
        }
        puts.push({ path, record, sha256 });
    }
    const stalePush = state.current().openPush;
    return {
        deletes,
        files,
        isEmpty:
            deletes.length === 0 &&
            puts.length === 0 &&
            restores.length === 0 &&
            linked.length === 0 &&
            stalePush === null,
        layout,
        linked,
        puts,
        restores,
        stalePush,
        state,
    };
}
export type DrivePushPlan = Awaited<ReturnType<typeof planDrivePush>>;

export async function sendDrivePush(
    plan: DrivePushPlan,
    remote: DriveRemote,
    pushId: string,
    options: { closeWithFailures: boolean } = { closeWithFailures: true }
) {
    const { files, layout, state } = plan;
    const context: OutcomeContext = { files, layout, remote, state };
    const writer = layout.writer;
    const failed: FileFailure[] = plan.linked.map((path) => ({
        message: new SymlinkedFolderError(path).message,
        path,
    }));
    const unrestored: FileFailure[] = [];
    const isolate = async (into: FileFailure[], path: string, send: () => Promise<void>) => {
        await send().catch(async (error: unknown) => {
            if (error instanceof DriveRemoteError && unsentCreateCodes.has(error.code)) {
                await state.dropPendingCreate(path);
            }
            if (isFatal(error)) {
                throw error;
            }
            into.push({ message: error instanceof Error ? error.message : String(error), path });
        });
    };
    await files.clearScratch();
    try {
        for (const record of plan.restores) {
            await isolate(unrestored, record.path, () => restoreUnplaced(context, record.path));
        }
        if (plan.stalePush !== null && plan.stalePush !== pushId) {
            await ignoreGonePush(remote.close(plan.stalePush));
            await state.openPush(null);
        }
        if (plan.deletes.length === 0 && plan.puts.length === 0) {
            const closed =
                plan.stalePush === pushId ? await ignoreGonePush(remote.close(pushId)) : null;
            await state.openPush(null);
            return { failed, listed: closed?.listed ?? [], pushClosed: false, sent: 0, unrestored };
        }
        await state.openPush(pushId);
        for (const record of plan.deletes) {
            await isolate(failed, record.path, async () => {
                const outcome = await remote.delete({
                    base_revision_id: record.revision_id,
                    path: record.path,
                    push_id: pushId,
                    request_id: requestId([writer, record.path, record.revision_id, null]),
                });
                await applyPushOutcome(context, outcome, null);
                if (record.seen_head) {
                    await catchUpSkippedHead(context, record.path);
                }
            });
        }
        for (const put of plan.puts) {
            await isolate(failed, put.path, async () => {
                const file = files.absolute(put.path);
                const head = new Uint8Array(await Bun.file(file).slice(0, 4096).arrayBuffer());
                const outcome = await remote.put(
                    {
                        base_revision_id: put.record?.revision_id,
                        content_type: inferAttachmentMediaType(put.path, head),
                        path: put.path,
                        push_id: pushId,
                        request_id: await putRequestId(plan, put),
                    },
                    file
                );
                await applyPushOutcome(context, outcome, put.sha256);
                if (put.record?.seen_head) {
                    await catchUpSkippedHead(context, put.path);
                }
            });
        }
        const sent = plan.deletes.length + plan.puts.length + plan.linked.length - failed.length;
        if (failed.length > 0 && !options.closeWithFailures) {
            return { failed, listed: [], pushClosed: false, sent, unrestored };
        }
        const closed = await ignoreGonePush(remote.close(pushId));
        await state.openPush(null);
        return { failed, listed: closed?.listed ?? [], pushClosed: false, sent, unrestored };
    } catch (error) {
        if (error instanceof DriveRemoteError && error.code === 'PUSH_CLOSED') {
            await state.openPush(null);
            return { failed, listed: [], pushClosed: true, sent: 0, unrestored };
        }
        throw error;
    } finally {
        await files.relock();
    }
}

interface FileFailure {
    message: string;
    path: string;
}

const unsentCreateCodes = new Set(['IDEMPOTENCY_KEY_REUSED', 'NOT_FOUND', 'PUSH_CLOSED']);

function isFatal(error: unknown) {
    if (error instanceof DriveRemoteError) {
        return error.code === 'PUSH_CLOSED' || error.status === 401 || error.status >= 500;
    }
    return typeof (error as NodeJS.ErrnoException | null)?.syscall !== 'string';
}

async function putRequestId(plan: DrivePushPlan, put: DrivePushPlan['puts'][number]) {
    const { layout, state } = plan;
    if (put.record) {
        return requestId([layout.writer, put.path, put.record.revision_id, put.sha256]);
    }
    const pending = state.current().pendingCreates[put.path];
    if (pending?.sha256 === put.sha256) {
        return pending.request_id;
    }
    const id = requestId([layout.writer, put.path, createSlot(plan, put.path), put.sha256]);
    await state.notePendingCreate(put.path, { request_id: id, sha256: put.sha256 });
    return id;
}

function createSlot(plan: DrivePushPlan, path: string) {
    const { areas, counters, retired } = plan.state.current();
    const area = areaOfPath(areas, path);
    const slot = area ? `${area.area}@${counters[area.area] ?? 0}` : 'outside@0';
    return `${slot}:${retired[path] ?? ''}`;
}

function requestId(parts: (string | null)[]) {
    return `dp_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 48)}`;
}

async function ignoreGonePush<T>(request: Promise<T>) {
    return await request.catch((error: unknown) => {
        if (
            error instanceof DriveRemoteError &&
            (error.code === 'PUSH_CLOSED' || error.code === 'NOT_FOUND')
        ) {
            return null;
        }
        throw error;
    });
}
