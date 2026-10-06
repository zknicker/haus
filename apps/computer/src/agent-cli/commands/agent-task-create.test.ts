import { expect, test } from 'bun:test';
import type * as z from 'zod';
import {
    type AgentApiRequest,
    type AgentApiRequester,
    AgentApiTransportError,
} from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTaskCreate } from './agent-task-actions.ts';

test('an unanswered task create retries once on the same nonce', async () => {
    const requests: AgentApiRequest[] = [];
    let minted = 0;
    const exit = await runTaskCreate(
        createArgs(),
        taskDeps(
            requester((input) => {
                requests.push(input);
                if (requests.length === 1) {
                    throw new AgentApiTransportError(
                        'SERVER_5XX',
                        'The Haus server is unavailable.'
                    );
                }
                return { tasks: [task()] };
            }),
            () => {
                minted += 1;
                return `task-nonce-${minted}`;
            }
        )
    );

    expect(exit).toBe(0);
    expect(minted).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0]?.body).toMatchObject({ nonce: 'task-nonce-1', titles: ['Ship it'] });
});

test('an answered refusal is never retried', async () => {
    const requests: AgentApiRequest[] = [];
    const refusal = new AgentCliError(
        'IDEMPOTENCY_KEY_REUSED',
        'That task creation nonce was already used for a different request.'
    );

    await expect(
        runTaskCreate(
            createArgs(),
            taskDeps(
                requester((input) => {
                    requests.push(input);
                    throw refusal;
                }),
                () => 'task-nonce'
            )
        )
    ).rejects.toBe(refusal);
    expect(requests).toHaveLength(1);
});

function requester(answer: (input: AgentApiRequest) => unknown): AgentApiRequester {
    return {
        request: async <T>(route: string, schema: z.ZodType<T>, input: AgentApiRequest = {}) => {
            expect(route).toBe('/api/agent/tasks/create');
            return schema.parse(answer(input)) as T;
        },
    };
}

function createArgs(): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--title': ['Ship it'] },
        values: { '--target': '#general' },
    };
}

function taskDeps(client: AgentApiRequester, mintNonce: () => string) {
    return {
        client,
        mintNonce,
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: () => undefined,
    };
}

function task() {
    return {
        assignee: null,
        message: {
            attachments: [],
            author: { id: 'agt_sage', kind: 'agent', label: 'Sage', metadata: {} },
            body_kind: 'text',
            chat_id: 'cht_general',
            content: 'Ship it',
            created_at: '2026-07-26T20:00:00.000Z',
            deleted_at: null,
            delivery_id: null,
            id: 'msg_1a2b3c4d00000000',
            metadata: {},
            nonce: 'task-nonce-1:0',
            role: 'assistant',
            sender: { description: null, handle: 'sage', type: 'agent' },
            sequence: 1,
        },
        number: 1,
        status: 'todo',
        target: '#general',
        version: 1,
    };
}
