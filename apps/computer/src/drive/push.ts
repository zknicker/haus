import { createHash } from 'node:crypto';
import { inferAttachmentMediaType } from '@haus/api';
import { DriveRemoteError, type DriveRemote } from './drive-remote.ts';
import { folderFiles, isSkippedPath, sha256File } from './folder-files.ts';
import {
    areaOfPath,
    type DriveFileRecord,
    type DriveFolderLayout,
    openFolderState,
} from './folder-state.ts';
import { applyPushOutcome, catchUpSkippedHead, type OutcomeContext } from './push-outcome.ts';

export async function planDrivePush(layout: DriveFolderLayout) {
    const state = await openFolderState(layout);
    const files = folderFiles(layout);
    const local = await files.walk();
    const records = state.current().files;
    const deletes = Object.values(records)
        .filter((record) => !(isSkippedPath(record.path) || local.has(record.path)))
        .sort((a, b) => a.path.localeCompare(b.path));
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
        isEmpty: deletes.length === 0 && puts.length === 0 && stalePush === null,
        layout,
        puts,
        stalePush,
        state,
    };
}
export type DrivePushPlan = Awaited<ReturnType<typeof planDrivePush>>;

export async function sendDrivePush(plan: DrivePushPlan, remote: DriveRemote, pushId: string) {
    const { files, layout, state } = plan;
    const context: OutcomeContext = { files, layout, remote, state };
    const writer = layout.writer;
    const failed: { message: string; path: string }[] = [];
    const isolate = async (path: string, send: () => Promise<void>) => {
        await send().catch(async (error: unknown) => {
            if (isFatal(error)) {
                throw error;
            }
            if (error instanceof DriveRemoteError && error.code === 'IDEMPOTENCY_KEY_REUSED') {
                await state.dropPendingCreate(path);
            }
            failed.push({ message: error instanceof Error ? error.message : String(error), path });
        });
    };
    await files.clearScratch();
    try {
        if (plan.stalePush !== null && plan.stalePush !== pushId) {
            await ignorePushClosed(remote.close(plan.stalePush));
            await state.openPush(null);
        }
        if (plan.deletes.length === 0 && plan.puts.length === 0) {
            const closed =
                plan.stalePush === pushId ? await ignorePushClosed(remote.close(pushId)) : null;
            await state.openPush(null);
            return { failed, listed: closed?.listed ?? [], sent: 0 };
        }
        await state.openPush(pushId);
        for (const record of plan.deletes) {
            await isolate(record.path, async () => {
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
            await isolate(put.path, async () => {
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
        const closed = await ignorePushClosed(remote.close(pushId));
        await state.openPush(null);
        const sent = plan.deletes.length + plan.puts.length - failed.length;
        return { failed, listed: closed?.listed ?? [], sent };
    } catch (error) {
        if (error instanceof DriveRemoteError && error.code === 'PUSH_CLOSED') {
            await state.openPush(null);
            return { failed, listed: [], sent: 0 };
        }
        throw error;
    } finally {
        await files.relock();
    }
}

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

async function ignorePushClosed<T>(request: Promise<T>) {
    return await request.catch((error: unknown) => {
        if (error instanceof DriveRemoteError && error.code === 'PUSH_CLOSED') {
            return null;
        }
        throw error;
    });
}
