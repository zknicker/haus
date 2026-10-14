import { cloudAgentInputAnswersSchema, cloudAgentInputRequestSchema } from '@haus/api';
import * as z from 'zod';
import { createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { requiredValue } from './agent-command-utils.ts';

export const CLOUD_AGENT_INPUT_COMMANDS: SubCommand[] = [
    {
        name: 'input',
        positionals: [],
        examples: ['haus cloud-agent input --work <workId>'],
        usage: 'haus cloud-agent input --work <workId>',
        summary: 'Read the native questions for work you delegated',
        flags: [
            { name: '--work', valueName: '<workId>', description: 'Delegated Cloud Agent work' },
        ],
        async run(args) {
            const workId = requiredValue(args, '--work');
            const result = await createAgentApiClient().request(
                `/api/agent/cloud-agents/input?workId=${encodeURIComponent(workId)}`,
                z.object({ requests: z.array(cloudAgentInputRequestSchema) })
            );
            process.stdout.write(`${JSON.stringify(result)}\n`);
            return 0;
        },
    },
    {
        name: 'answer',
        positionals: [],
        examples: [
            'printf \'{"Which route?":"alpha"}\' | haus cloud-agent answer --request <requestId>',
        ],
        usage: 'haus cloud-agent answer --request <requestId>',
        summary: 'Answer a pending Cloud Agent question; JSON answers come from stdin',
        flags: [
            {
                name: '--request',
                valueName: '<requestId>',
                description: 'Still-pending input request',
            },
        ],
        async run(args) {
            const id = requiredValue(args, '--request');
            const raw = process.stdin.isTTY ? '' : await readAgentStdin();
            let body: unknown;
            try {
                body = JSON.parse(raw);
            } catch {
                throw new AgentCliError(
                    'INVALID_ARG',
                    'Provide a JSON mapping from exact question text to answer on stdin.'
                );
            }
            const parsed = cloudAgentInputAnswersSchema.safeParse(body);
            if (!parsed.success) {
                throw new AgentCliError(
                    'INVALID_ARG',
                    'Each question needs a nonempty text answer.'
                );
            }
            const result = await createAgentApiClient().request(
                '/api/agent/cloud-agents/input/answer',
                z.object({ request: cloudAgentInputRequestSchema }),
                { method: 'POST', body: { id, answer: parsed.data } }
            );
            process.stdout.write(
                `Answer saved for ${result.request.id}. Pending input clears after Claude consumes it.\n`
            );
            return 0;
        },
    },
];
