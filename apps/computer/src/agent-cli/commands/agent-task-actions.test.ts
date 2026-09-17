import { expect, test } from 'bun:test';
import type * as z from 'zod';
import { AgentApiClient, type AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTaskClaim } from './agent-task-actions.ts';

test('a claim matches Raft follow-up guidance without rerouting replies', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                claimed: [
                    {
                        assignee: null,
                        message: {
                            attachments: [],
                            author: {
                                id: 'usr_wren',
                                kind: 'user',
                                label: 'wren',
                                metadata: {},
                            },
                            body_kind: 'text',
                            chat_id: 'cht_general',
                            content: 'Audit the Server export',
                            created_at: '2026-07-26T20:00:00.000Z',
                            deleted_at: null,
                            delivery_id: null,
                            id: 'msg_1a2b3c4d00000000',
                            metadata: {},
                            nonce: 'task-cli-test',
                            role: 'user',
                            sender: {
                                description: null,
                                handle: 'wren',
                                type: 'human',
                            },
                            sequence: 1,
                        },
                        number: 7,
                        status: 'in_progress',
                        target: '#general',
                    },
                ],
            }) as T,
    };
    const args: ParsedArgs = {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--number': ['7'] },
        values: { '--target': '#general' },
    };

    await runTaskClaim(args, {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: (text) => outputs.push(text),
    });

    expect(outputs.join('')).toBe('Claim results (1 claimed):\n#7 (msg:1a2b3c4d): claimed\n');
    expect(outputs.join('')).not.toContain('Work it in thread target');
});

test('a lost claim prints the structured conflict instead of a refresh notice', async () => {
    const fetcher = (async () =>
        Response.json(
            {
                claimConflict: {
                    blockedActions: ['start_conflicting_execution'],
                    claimedAt: '2026-09-08T17:04:11.000Z',
                    conflictScope: 'implementation_execution',
                    currentAssignee: { name: 'sage', type: 'agent' },
                    kind: 'claim_conflict',
                    observedAt: '2026-09-08T17:09:52.000Z',
                    status: 'in_progress',
                    unblockedActionExamples: [
                        'reading the task and its Thread',
                        'replying in the Thread with findings, questions, or review',
                        'claiming a different task in this lane',
                        'raising the routing with the people in the original Chat',
                    ],
                },
                code: 'TASK_CONFLICT',
                message: 'That task is already owned by another assignee.',
            },
            { status: 409 }
        )) as unknown as typeof fetch;
    const client = new AgentApiClient(
        {
            agentId: 'agt_wren',
            serverUrl: 'http://127.0.0.1:18790',
            token: `grta_${'a'.repeat(43)}`,
            tokenFile: '/tmp/token',
        },
        fetcher
    );
    const args: ParsedArgs = {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--number': ['7'] },
        values: { '--target': '#general' },
    };

    const failure = await runTaskClaim(args, {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: () => undefined,
    }).then(
        () => null,
        (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(AgentCliError);
    expect(renderAgentCliError(failure as AgentCliError)).toBe(
        'Claim failed — @sage currently holds the implementation lock (assignment state as of 2026-09-08T17:09:52.000Z).\n' +
            'Blocked: starting conflicting implementation/change work.\n' +
            'Not blocked by this claim conflict (each still subject to its own authority/policy): reading the task and its Thread · replying in the Thread with findings, questions, or review · claiming a different task in this lane · raising the routing with the people in the original Chat.\n' +
            'This is not a ruling on who owns or leads this lane. If you are its canonical owner or believe it is misrouted: correct the routing in the original thread.\n' +
            'Code: TASK_CONFLICT\n'
    );
});

test('a task conflict without a structured body keeps the ordinary refusal', async () => {
    const fetcher = (async () =>
        Response.json(
            {
                code: 'TASK_CONFLICT',
                message: 'That task changed; refresh it before updating.',
            },
            { status: 409 }
        )) as unknown as typeof fetch;
    const client = new AgentApiClient(
        {
            agentId: 'agt_wren',
            serverUrl: 'http://127.0.0.1:18790',
            token: `grta_${'a'.repeat(43)}`,
            tokenFile: '/tmp/token',
        },
        fetcher
    );
    const args: ParsedArgs = {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--number': ['7'] },
        values: { '--target': '#general' },
    };

    const failure = await runTaskClaim(args, {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: () => undefined,
    }).then(
        () => null,
        (error: unknown) => error
    );

    expect(renderAgentCliError(failure as AgentCliError)).toBe(
        'Error: That task changed; refresh it before updating.\nCode: TASK_CONFLICT\n'
    );
});
