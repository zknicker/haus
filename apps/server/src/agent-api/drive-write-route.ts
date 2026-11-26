import { agentDriveWriteInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { type TaskDriveWriteOptions, writeTaskDriveFile } from '../drive/task-drive-write.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

/** `haus drive write`: one Task deliverable, sent as base64 JSON like an attachment upload. */
export function registerAgentDriveWriteRoute(app: FastifyInstance, options: TaskDriveWriteOptions) {
    app.post(
        '/api/agent/drive/write',
        { bodyLimit: 70 * 1024 * 1024 },
        async (request, reply) => {
            const runner = await authorizeAgentRunner(options.db, request);
            if (!runner) {
                return await sendAgentApiError(
                    reply,
                    401,
                    'MISSING_TOKEN',
                    'A valid runner credential is required.'
                );
            }
            try {
                const input = agentDriveWriteInputSchema.parse(request.body ?? {});
                return await writeTaskDriveFile(options, runner, input);
            } catch (cause) {
                return await sendArtifactError(reply, cause);
            }
        }
    );
}
