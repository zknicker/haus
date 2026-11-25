import { join } from 'node:path';
import type { DriveRemote } from '../../drive/drive-remote.ts';
import { areaOfPath, isReadOnlyArea, unplacedMtimeMs } from '../../drive/folder-state.ts';
import { restoreUnplaced } from '../../drive/outcome-converge.ts';
import type { DrivePushPlan, FileFailure } from '../../drive/push.ts';

export async function copyUnsentAside(plan: DrivePushPlan) {
    for (const put of plan.puts) {
        await plan.files.copyAside(
            put.path,
            join(plan.layout.refused, ...put.path.split('/')),
            put.sha256
        );
    }
    return plan.puts.map((put) => put.path);
}

export async function takeUnsentOut(plan: DrivePushPlan, remote: DriveRemote | null) {
    const { files, layout, state } = plan;
    for (const put of plan.puts) {
        const area = areaOfPath(state.current().areas, put.path);
        const lock = area && isReadOnlyArea(area.area, layout.writer) ? area.root : null;
        await files.remove(put.path, lock);
        if (put.record) {
            await state.record({ ...put.record, mtime_ms: unplacedMtimeMs });
        } else {
            await state.dropPendingCreate(put.path);
        }
    }
    const unrestored = remote ? await restoreRecorded(plan, remote) : [];
    await files.relock();
    return unrestored;
}

async function restoreRecorded(plan: DrivePushPlan, remote: DriveRemote) {
    const { files, layout, state } = plan;
    const unrestored: FileFailure[] = [];
    for (const put of plan.puts.filter((planned) => planned.record)) {
        await restoreUnplaced({ files, layout, remote, state }, put.path).catch(
            (error: unknown) => {
                unrestored.push({
                    code: 'ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    path: put.path,
                });
            }
        );
    }
    return unrestored;
}
