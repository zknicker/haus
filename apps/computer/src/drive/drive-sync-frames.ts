import { join } from 'node:path';
import {
    agentPathSegment,
    type DriveSyncCommand,
    drivePullCommandSchema,
    drivePushCommandSchema,
} from '@haus/api';
import { mintRunCredential, revokeRunCredential } from '../runner-authority.ts';
import { type DriveRun, pullDriveForRun, pushDriveForRun } from './turn-sync.ts';

export function driveSyncFrames(
    agentsRoot: string,
    attachment: { credential: string; serverOrigin: string }
) {
    const generations = new Map<string, number>();
    return {
        receive(frame: unknown) {
            const command = parseDriveSync(frame);
            if (!command) {
                return false;
            }
            if (!isAgentSegment(command.agentId)) {
                console.warn('Ignored a drive sync frame for an unusable Agent id.', {
                    agentId: command.agentId,
                });
                return true;
            }
            if (command.sessionGeneration < (generations.get(command.agentId) ?? 0)) {
                console.warn('Ignored a drive sync frame from an earlier Agent session.', {
                    agentId: command.agentId,
                    runId: command.runId,
                    sessionGeneration: command.sessionGeneration,
                });
                return true;
            }
            generations.set(command.agentId, command.sessionGeneration);
            const run: DriveRun = {
                agentId: command.agentId,
                mint: () =>
                    mintRunCredential(attachment, {
                        agentId: command.agentId,
                        chatId: null,
                        purpose: 'drive-sync',
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
            const agentRoot = join(agentsRoot, agentPathSegment(command.agentId));
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

function isAgentSegment(agentId: string) {
    try {
        agentPathSegment(agentId);
        return true;
    } catch {
        return false;
    }
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
