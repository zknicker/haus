import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { RunAgentLaunchOptions } from '../launch.ts';
import { mintRunner, revokeRunner } from '../runner-authority.ts';
import { driveRemote } from './drive-remote.ts';
import { driveFolderLayout } from './folder-state.ts';
import { pullDrive } from './pull.ts';
import { planDrivePush, sendDrivePush } from './push.ts';

export async function pullDriveBeforeTurn(
    options: RunAgentLaunchOptions,
    agentRoot: string,
    runnerToken: string
) {
    try {
        const pulled = await pullDrive({
            layout: driveFolderLayout(agentRoot, options.command.agentId),
            remote: driveRemote({ serverOrigin: options.serverOrigin, token: runnerToken }),
        });
        if (!pulled.advanced) {
            await warn(options, 'drive-pull-blocked', `${pulled.blocked} local paths blocked`);
        }
    } catch (error) {
        await warn(options, 'drive-pull-failed', messageOf(error));
    }
}

export async function pushDriveAfterTurn(options: RunAgentLaunchOptions, agentRoot: string) {
    try {
        const plan = await planDrivePush(driveFolderLayout(agentRoot, options.command.agentId));
        if (plan.isEmpty) {
            return;
        }
        const runner = await mintRunner(options);
        try {
            const remote = driveRemote({
                serverOrigin: options.serverOrigin,
                token: runner.runnerToken,
            });
            await sendDrivePush(plan, remote, options.command.runId);
        } finally {
            await revokeRunner(options, runner.runnerId).catch(() => undefined);
        }
    } catch (error) {
        await warn(options, 'drive-push-failed', messageOf(error));
    }
}

async function warn(options: RunAgentLaunchOptions, event: string, detail: string) {
    await settle(
        options.runtime,
        Effect.logWarning('Drive folder sync did not finish.').pipe(
            Effect.annotateLogs({
                agentId: options.command.agentId,
                detail,
                event,
                runId: options.command.runId,
            })
        )
    );
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
