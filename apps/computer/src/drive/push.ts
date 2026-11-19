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
import { applyPushOutcome, type OutcomeContext } from './push-outcome.ts';

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
    await files.clearScratch();
    try {
        if (plan.stalePush !== null && plan.stalePush !== pushId) {
            await ignorePushClosed(remote.close(plan.stalePush));
            await state.openPush(null);
        }
        if (plan.deletes.length === 0 && plan.puts.length === 0) {
            return { listed: [], sent: 0 };
        }
        await state.openPush(pushId);
        for (const record of plan.deletes) {
            const outcome = await remote.delete({
                base_revision_id: record.revision_id,
                path: record.path,
                push_id: pushId,
                request_id: requestId([writer, record.path, record.revision_id, null]),
            });
            await applyPushOutcome(context, outcome, null);
        }
        for (const put of plan.puts) {
            const head = new Uint8Array(
                await Bun.file(files.absolute(put.path)).slice(0, 4096).arrayBuffer()
            );
            const outcome = await remote.put(
                {
                    base_revision_id: put.record?.revision_id,
                    content_type: inferAttachmentMediaType(put.path, head),
                    path: put.path,
                    push_id: pushId,
                    request_id: requestId([
                        writer,
                        put.path,
                        put.record?.revision_id ?? createSlot(plan, put.path),
                        put.sha256,
                    ]),
                },
                files.absolute(put.path)
            );
            await applyPushOutcome(context, outcome, put.sha256);
        }
        const closed = await ignorePushClosed(remote.close(pushId));
        await state.openPush(null);
        return { listed: closed?.listed ?? [], sent: plan.deletes.length + plan.puts.length };
    } catch (error) {
        if (error instanceof DriveRemoteError && error.code === 'PUSH_CLOSED') {
            await state.openPush(null);
            return { listed: [], sent: 0 };
        }
        throw error;
    } finally {
        await files.relock();
    }
}

function createSlot(plan: DrivePushPlan, path: string) {
    const { areas, counters } = plan.state.current();
    const area = areaOfPath(areas, path);
    return area ? `${area.area}@${counters[area.area] ?? 0}` : 'outside@0';
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
