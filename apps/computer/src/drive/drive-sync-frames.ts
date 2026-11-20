import { join } from 'node:path';
import { type DriveSyncCommand, drivePullCommandSchema, drivePushCommandSchema } from '@haus/api';
import { mintRunCredential, revokeRunCredential } from '../runner-authority.ts';
import { type DriveRun, pullDriveForRun, pushDriveForRun } from './turn-sync.ts';

export function driveSyncFrames(
    agentsRoot: string,
    attachment: { credential: string; serverOrigin: string }
) {
    return {
        receive(frame: unknown) {
            const command = parseDriveSync(frame);
            if (!command) {
                return false;
            }
            const run: DriveRun = {
                agentId: command.agentId,
                mint: () =>
                    mintRunCredential(attachment, {
                        agentId: command.agentId,
                        chatId: null,
                        runId: command.runId,
                    }),
                revoke: (runnerId) => revokeRunCredential(attachment, runnerId),
                runId: command.runId,
                serverOrigin: attachment.serverOrigin,
                warn: (event, detail) =>
                    console.warn('Drive folder sync did not finish.', {
                        agentId: command.agentId,
                        detail,
                        event,
                        runId: command.runId,
                    }),
            };
            const agentRoot = join(agentsRoot, command.agentId);
            const sync = command.type === 'drive-pull' ? pullDriveForRun : pushDriveForRun;
            void sync(agentRoot, run).catch((error: unknown) =>
                run.warn(
                    'drive-sync-failed',
                    error instanceof Error ? error.message : String(error)
                )
            );
            return true;
        },
    };
}

function parseDriveSync(frame: unknown) {
    const pull = drivePullCommandSchema.safeParse(frame);
    if (pull.success) {
        const command: DriveSyncCommand = pull.data;
        return command;
    }
    const push = drivePushCommandSchema.safeParse(frame);
    return push.success ? push.data : null;
}
