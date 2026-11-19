import { cloudAgentProviderSchema, taskKeySchema } from '@haus/api';
import * as z from 'zod';
import { WorkerLaunchFailedError, startWorker } from './launch-work.ts';
import { CloudAgentProviderUnavailableError } from './provider.ts';
import { sendWorker } from './send-work.ts';
import type { WorkerSupervisor } from './work-runner.ts';

const workerStartSchema = z.object({
    cause: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1),
    instructions: z.string().trim().min(1),
    nonce: z.string().trim().min(1),
    provider: cloudAgentProviderSchema,
    repository: z.string().trim().min(1),
    replyToMessageId: z.string().trim().min(1).optional(),
    startingRef: z.string().trim().min(1).nullable(),
    target: z.string().trim().min(1),
    task: taskKeySchema.optional(),
    title: z.string().trim().min(1),
});
const workerSendSchema = z.object({
    workerId: z.string().trim().min(1),
    nonce: z.string().trim().min(1).max(128),
    instructions: z.string().trim().min(1).max(128_000),
    interrupt: z.boolean().default(false),
});

/**
 * `haus worker start` runs here, not upstream: the Computer owns the
 * provider access, so it checks readiness before Server records anything and
 * keeps the provider instructions local. Cancellation needs none of that and
 * forwards to Server, which rides the cancel back down this Computer's socket.
 */
export async function handleWorkerStart(
    request: Request,
    url: URL,
    input: {
        dataRoot?: string;
        supervisor?: Pick<WorkerSupervisor, 'reconcile' | 'report' | 'runLaunch' | 'watch'>;
        runnerToken: string;
        serverId?: string;
        serverOrigin: string;
    }
): Promise<Response | null> {
    const sending = url.pathname === '/api/agent/workers/send';
    if (!((url.pathname === '/api/agent/workers' || sending) && request.method === 'POST')) {
        return null;
    }
    if (!(input.serverId && input.dataRoot && input.supervisor)) {
        return Response.json(
            {
                code: 'WORKER_UNAVAILABLE',
                message: 'This launch has no attached Server to record Worker.',
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
            const parsed = workerSendSchema.parse(body);
            operation = () => sendWorker({ ...context, request: parsed });
        } else {
            const parsed = workerStartSchema.parse(body);
            operation = () => startWorker({ ...context, request: parsed });
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
                { code: 'WORKER_UNAVAILABLE', message: error.message },
                { status: 409 }
            );
        }
        if (error instanceof WorkerLaunchFailedError) {
            return Response.json(
                {
                    code: 'WORKER_LAUNCH_FAILED',
                    message: `${error.message} The work is recorded as failed; read it in the Task.`,
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
                        : 'The Server could not record the Worker.',
            },
            { status: 502 }
        );
    }
}
