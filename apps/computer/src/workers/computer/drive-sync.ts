import { driveRemote } from '../../drive/drive-remote.ts';
import { pullDrive } from '../../drive/pull.ts';
import { planDrivePush, sendDrivePush } from '../../drive/push.ts';
import { serialized } from '../serialized.ts';
import { mintPushCredential, type WorkerServer } from './credentials.ts';
import type { WorkerLayout } from './layout.ts';

export interface WorkerDriveFolder {
    agentId: string;
    layout: WorkerLayout;
    server: WorkerServer;
}

export function pullWorkerDrive(folder: WorkerDriveFolder, token: string) {
    const layout = folder.layout.driveFolder(folder.agentId);
    return serialized(`drive:${layout.folder}`, async () => {
        const pulled = await pullDrive({
            layout,
            remote: driveRemote({ serverOrigin: folder.server.serverOrigin, token }),
        });
        if (!pulled.advanced) {
            warn('worker.drive-pull-blocked', folder, `${pulled.blocked} local paths blocked`);
        }
    }).catch((error: unknown) => warn('worker.drive-pull-failed', folder, messageOf(error)));
}

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
            return;
        }
        const minted = await mintPushCredential(folder.server, turnId);
        if (minted.state === 'refused') {
            throw new Error(`The Server refused the push credential: ${minted.reason}.`);
        }
        const pushed = await sendDrivePush(plan, remoteOf(folder, minted.token), turnId);
        for (const file of pushed.failed) {
            warn('worker.drive-push-file-failed', folder, `${file.path}: ${file.message}`);
        }
    }).catch((error: unknown) => warn('worker.drive-push-failed', folder, messageOf(error)));
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
