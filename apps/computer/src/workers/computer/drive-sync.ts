import { join } from 'node:path';
import { drivePushUnsentMax } from '@haus/api';
import { driveRemote } from '../../drive/drive-remote.ts';
import { pullDrive } from '../../drive/pull.ts';
import {
    type DrivePushPlan,
    type FileFailure,
    planDrivePush,
    sendDrivePush,
} from '../../drive/push.ts';
import { serialized } from '../serialized.ts';
import { mintPushCredential, type WorkerServer } from './credentials.ts';
import { seedWorkerDrive } from './drive-seed.ts';
import type { WorkerLayout } from './layout.ts';

export interface WorkerDriveFolder {
    agentId: string;
    layout: WorkerLayout;
    server: WorkerServer;
}

export function pullWorkerDrive(folder: WorkerDriveFolder, token: string) {
    const layout = folder.layout.driveFolder(folder.agentId);
    return serialized(`drive:${layout.folder}`, async () => {
        await seedWorkerDrive(folder.layout, folder.agentId).catch((error: unknown) =>
            warn('worker.drive-seed-failed', folder, messageOf(error))
        );
        const pulled = await pullDrive({
            layout,
            remote: driveRemote({ serverOrigin: folder.server.serverOrigin, token }),
        });
        for (const file of pulled.held) {
            warn('worker.drive-pull-held', folder, `${file.path}: ${file.message}`);
        }
        if (!pulled.advanced) {
            warn('worker.drive-pull-blocked', folder, `${pulled.blocked} local paths blocked`);
        }
    }).catch((error: unknown) => warn('worker.drive-pull-failed', folder, messageOf(error)));
}

export type WorkerPushResult = 'finished' | 'retry';

export function pushWorkerDrive(folder: WorkerDriveFolder, turnId: string) {
    const layout = folder.layout.driveFolder(folder.agentId);
    return serialized(`drive:${layout.folder}`, async () => {
        let plan = await planDrivePush(layout);
        if (plan.stalePush !== null && plan.stalePush !== turnId) {
            await closeStalePush(folder, plan.stalePush).catch((error: unknown) =>
                warn('worker.drive-stale-push', folder, messageOf(error))
            );
            await plan.state.openPush(null);
            plan = await planDrivePush(layout);
        }
        if (plan.isEmpty) {
            return 'finished' satisfies WorkerPushResult;
        }
        const minted = await mintPushCredential(folder.server, turnId);
        if (minted.state === 'refused') {
            warn('worker.drive-push-refused', folder, minted.reason);
            await setAsideUnsent(folder, plan);
            return 'finished' satisfies WorkerPushResult;
        }
        const remote = remoteOf(folder, minted.token);
        const pushed = await sendDrivePush(plan, remote, turnId, {
            closeIf: ({ failed }) => allNeverWrite(failed),
        });
        if (pushed.pushClosed) {
            warn('worker.drive-push-closed', folder, `Push ${turnId} was already closed.`);
        }
        for (const file of pushed.failed) {
            warn('worker.drive-push-file-failed', folder, `${file.path}: ${file.message}`);
        }
        for (const file of pushed.unrestored) {
            warn('worker.drive-restore-failed', folder, `${file.path}: ${file.message}`);
        }
        if (!allNeverWrite(pushed.failed)) {
            return 'retry' satisfies WorkerPushResult;
        }
        const unsent = await setAsideUnsent(folder, await planDrivePush(layout));
        if (pushed.pushClosed && unsent.length > 0) {
            await remote.close(turnId, unsent.slice(0, drivePushUnsentMax));
        }
        return 'finished' satisfies WorkerPushResult;
    }).catch((error: unknown) => {
        warn('worker.drive-push-failed', folder, messageOf(error));
        return 'retry' satisfies WorkerPushResult;
    });
}

const neverWrites = new Set([
    'AGENT_MOVED',
    'AGENT_RESET',
    'ESYMLINKFOLDER',
    'FORBIDDEN',
    'NOT_FOUND',
]);

function allNeverWrite(failed: readonly FileFailure[]) {
    return failed.every((file) => neverWrites.has(file.code));
}

async function setAsideUnsent(folder: WorkerDriveFolder, plan: DrivePushPlan) {
    const { files, layout } = plan;
    for (const put of plan.puts) {
        await files.setAside(
            put.path,
            join(layout.refused, ...put.path.split('/')),
            put.sha256,
            null
        );
    }
    const unsent = plan.puts.map((put) => put.path);
    if (unsent.length > 0) {
        warn('worker.drive-set-aside', folder, `${layout.refused}: ${unsent.join(', ')}`);
    }
    return unsent;
}

async function closeStalePush(folder: WorkerDriveFolder, pushId: string) {
    const minted = await mintPushCredential(folder.server, pushId);
    if (minted.state === 'minted') {
        await remoteOf(folder, minted.token)
            .close(pushId)
            .catch((error: unknown) => {
                if (!(error instanceof Error && 'code' in error && error.code === 'PUSH_CLOSED')) {
                    throw error;
                }
            });
    }
}

function remoteOf(folder: WorkerDriveFolder, token: string) {
    return driveRemote({ serverOrigin: folder.server.serverOrigin, token });
}

function warn(event: string, folder: WorkerDriveFolder, detail: string) {
    console.error('Worker drive folder sync did not finish.', {
        detail,
        event,
        workerId: folder.layout.workerId,
    });
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
