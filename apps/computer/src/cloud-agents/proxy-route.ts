import * as z from 'zod';
import { CloudAgentLaunchFailedError, startCloudAgentWork } from './launch-work.ts';
import { CloudAgentProviderUnavailableError } from './provider.ts';
import { sendCloudAgentWork } from './send-work.ts';
import type { CloudAgentWorkSupervisor } from './work-runner.ts';

const cloudAgentStartSchema = z.object({
    content: z.string().trim().min(1),
    instructions: z.string().trim().min(1),
    nonce: z.string().trim().min(1),
    repository: z.string().trim().min(1),
    replyToMessageId: z.string().trim().min(1).optional(),
    startingRef: z.string().trim().min(1).nullable(),
    target: z.string().trim().min(1),
    title: z.string().trim().min(1),
});
const cloudAgentSendSchema = z.object({
    workId: z.string().trim().min(1),
    nonce: z.string().trim().min(1).max(128),
    instructions: z.string().trim().min(1).max(128_000),
    interrupt: z.boolean().default(false),
});

/**
 * `haus cloud-agent start` runs here, not upstream: the Computer owns the
 * provider access, so it checks readiness before Server records anything and
 * keeps the provider instructions local. Cancellation needs none of that and
 * forwards to Server, which rides the cancel back down this Computer's socket.
 */
export async function handleCloudAgentStart(
    request: Request,
    url: URL,
    input: {
        dataRoot?: string;
        supervisor?: CloudAgentWorkSupervisor;
        runnerToken: string;
        serverId?: string;
        serverOrigin: string;
    }
): Promise<Response | null> {
    const sending = url.pathname === '/api/agent/cloud-agents/send';
    if (!((url.pathname === '/api/agent/cloud-agents' || sending) && request.method === 'POST')) {
        return null;
    }
    if (!(input.serverId && input.dataRoot && input.supervisor)) {
        return Response.json(
            {
                code: 'CLOUD_AGENT_UNAVAILABLE',
                message: 'This launch has no attached Server to record Cloud Agent work.',
            },
            { status: 409 }
        );
    }
    const { dataRoot, serverId, supervisor } = input;
    let operation: () => Promise<unknown>;
    try {
        const body = await request.json();
        const context = {
            dataRoot,
            serverId,
            supervisor,
            runnerToken: input.runnerToken,
            serverOrigin: input.serverOrigin,
        };
        if (sending) {
            const parsed = cloudAgentSendSchema.parse(body);
            operation = () => sendCloudAgentWork({ ...context, request: parsed });
        } else {
            const parsed = cloudAgentStartSchema.parse(body);
            operation = () => startCloudAgentWork({ ...context, request: parsed });
        }
    } catch (error) {
        return Response.json(
            {
                code: 'INVALID_ARG',
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 400 }
        );
    }
    try {
        return Response.json(await supervisor.runLaunch(operation));
    } catch (error) {
        if (error instanceof CloudAgentProviderUnavailableError) {
            return Response.json(
                { code: 'CLOUD_AGENT_UNAVAILABLE', message: error.message },
                { status: 409 }
            );
        }
        if (error instanceof CloudAgentLaunchFailedError) {
            return Response.json(
                {
                    code: 'CLOUD_AGENT_LAUNCH_FAILED',
                    message: `${error.message} The work is recorded as failed; read it in the thread.`,
                },
                { status: 502 }
            );
        }
        const failure = error as { code?: unknown; message?: unknown };
        return Response.json(
            {
                code: typeof failure.code === 'string' ? failure.code : 'SERVER_5XX',
                message:
                    typeof failure.message === 'string'
                        ? failure.message
                        : 'The Server could not record the Cloud Agent work.',
            },
            { status: 502 }
        );
    }
}
