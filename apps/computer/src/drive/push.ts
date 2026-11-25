import { DriveRemoteError, type DriveRemote } from './drive-remote.ts';
import type { DrivePushOutcomeEntry } from './drive-response-schema.ts';
import { folderFiles, sha256File } from './folder-files.ts';
import { settlePlacing } from './folder-placing.ts';
import { SymlinkedFolderError } from './folder-spelling.ts';
import {
    type DriveFileRecord,
    type DriveFolderLayout,
    openFolderState,
    unplacedMtimeMs,
} from './folder-state.ts';
import { isSkippedPath } from './folder-walk.ts';
import { type OutcomeContext, restoreUnplaced } from './outcome-converge.ts';
import { type PlannedPut, sendDelete, sendPut } from './push-request.ts';

export async function planDrivePush(layout: DriveFolderLayout) {
    const state = await openFolderState(layout);
    const files = folderFiles(layout);
    await settlePlacing({ files, state });
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
    const puts: PlannedPut[] = [];
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
    options: { closeIf: (result: PushResult) => boolean } = { closeIf: () => true }
) {
    const { files, layout, state } = plan;
    const context: OutcomeContext = { files, layout, remote, state };
    const refused: string[] = [];
    const failed: FileFailure[] = plan.linked.map((path) => {
        const error = new SymlinkedFolderError(path);
        return { code: error.code, message: error.message, path };
    });
    const unrestored: FileFailure[] = [];
    const isolate = async (into: FileFailure[], path: string, send: () => Promise<unknown>) => {
        await send().catch(async (error: unknown) => {
            if (error instanceof DriveRemoteError && unsentCreateCodes.has(error.code)) {
                await state.dropPendingCreate(path);
            }
            if (isFatal(error)) {
                throw error;
            }
            into.push({
                code: (error as { code?: unknown }).code?.toString() ?? 'ERROR',
                message: error instanceof Error ? error.message : String(error),
                path,
            });
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
            const listed = closed?.listed ?? [];
            return { failed, listed, pushClosed: false, refused, sent: 0, unrestored };
        }
        await state.openPush(pushId);
        const noteRefused = (outcome: DrivePushOutcomeEntry) => {
            if (outcome.outcome === 'refused') {
                refused.push(outcome.path);
            }
        };
        for (const record of plan.deletes) {
            await isolate(failed, record.path, () =>
                sendDelete(context, record, pushId).then(noteRefused)
            );
        }
        for (const put of plan.puts) {
            await isolate(failed, put.path, () => sendPut(context, put, pushId).then(noteRefused));
        }
        const sent = plan.deletes.length + plan.puts.length + plan.linked.length - failed.length;
        if (!options.closeIf({ failed, refused })) {
            return { failed, listed: [], pushClosed: false, refused, sent, unrestored };
        }
        const closed = await ignoreGonePush(remote.close(pushId));
        await state.openPush(null);
        const listed = closed?.listed ?? [];
        return { failed, listed, pushClosed: false, refused, sent, unrestored };
    } catch (error) {
        if (error instanceof DriveRemoteError && error.code === 'PUSH_CLOSED') {
            await state.openPush(null);
            return { failed, listed: [], pushClosed: true, refused, sent: 0, unrestored };
        }
        throw error;
    } finally {
        await files.relock();
    }
}

export interface FileFailure {
    code: string;
    message: string;
    path: string;
}

interface PushResult {
    failed: readonly FileFailure[];
    refused: readonly string[];
}

const unsentCreateCodes = new Set(['IDEMPOTENCY_KEY_REUSED', 'NOT_FOUND', 'PUSH_CLOSED']);
const retryableStatuses = new Set([401, 408, 429]);

function isFatal(error: unknown) {
    if (error instanceof DriveRemoteError) {
        return (
            error.code === 'PUSH_CLOSED' ||
            error.code === 'UPLOAD_CONFLICT' ||
            retryableStatuses.has(error.status) ||
            error.status >= 500
        );
    }
    return typeof (error as NodeJS.ErrnoException | null)?.syscall !== 'string';
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
