import { expect, test } from 'bun:test';
import type * as z from 'zod';
import { AgentApiClient, type AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTaskClaim, runTaskCreate, runTaskList } from './agent-task-actions.ts';

test('a claim reports each granted task with its thread address, without routing advice', async () => {
    const outputs: string[] = [];
    await runTaskClaim(
        claimArgs(['7']),
        taskDeps(stubClient({ results: [granted(7, 'claimed')] }), outputs)
    );

    expect(outputs.join('')).toBe(
        'Claim results (1 claimed):\n#7 (msg:1a2b3c4d): claimed · thread "#general:1a2b3c4d"\n'
    );
    expect(outputs.join('')).not.toContain('Work it in thread target');
});

test('a partial batch claim prints every row and still succeeds', async () => {
    const outputs: string[] = [];
    const exit = await runTaskClaim(
        claimArgs(['7', '8', '9']),
        taskDeps(
            stubClient({
                results: [
                    granted(7, 'claimed'),
                    granted(8, 'already_yours'),
                    {
                        claimConflict: sageConflict,
                        number: 9,
                        outcome: 'refused',
                        reason: 'That task is already owned by another assignee.',
                        task: task(9),
                    },
                ],
            }),
            outputs
        )
    );

    expect(exit).toBe(0);
    expect(outputs.join('')).toBe(
        'Claim results (1 claimed, 1 already yours, 1 refused):\n' +
            '#7 (msg:1a2b3c4d): claimed · thread "#general:1a2b3c4d"\n' +
            '#8 (msg:1a2b3c4d): already yours · thread "#general:1a2b3c4d"\n' +
            '#9 (msg:1a2b3c4d): refused — held by @sage\n'
    );
});

test('a batch claim with nothing granted fails with one line per refusal', async () => {
    const outputs: string[] = [];
    const failure = await runTaskClaim(
        claimArgs(['9', '10']),
        taskDeps(
            stubClient({
                results: [
                    {
                        claimConflict: sageConflict,
                        number: 9,
                        outcome: 'refused',
                        reason: 'That task is already owned by another assignee.',
                        task: task(9),
                    },
                    {
                        claimConflict: null,
                        number: 10,
                        outcome: 'refused',
                        reason: 'No task #10 exists in that target.',
                        task: null,
                    },
                ],
            }),
            outputs
        )
    ).then(
        () => null,
        (error: unknown) => error
    );

    expect(outputs.join('')).toContain('#10: refused — No task #10 exists in that target\n');
    expect(failure).toBeInstanceOf(AgentCliError);
    expect((failure as AgentCliError).message).toBe(
        'Claim refused — #9 held by @sage; #10 No task #10 exists in that target.'
    );
});

test('a lost claim prints the structured conflict instead of a refresh notice', async () => {
    const fetcher = (async () =>
        Response.json({
            results: [
                {
                    claimConflict: sageConflict,
                    number: 7,
                    outcome: 'refused',
                    reason: 'That task is already owned by another assignee.',
                    task: task(7),
                },
            ],
        })) as unknown as typeof fetch;
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

test('task create names every created task its own thread address', async () => {
    const outputs: string[] = [];
    const second = { ...task(8), message: { ...task(8).message, id: 'msg_9f8e7d6c00000000' } };
    await runTaskCreate(
        {
            flags: {},
            help: false,
            positionals: [],
            valueLists: { '--title': ['one', 'two'] },
            values: { '--target': '#general' },
        },
        taskDeps(stubClient({ tasks: [task(7), second] }), outputs)
    );

    expect(outputs.join('')).toBe(
        'Created task #7 [in_progress] in #general. Message ID: msg_1a2b3c4d00000000. Thread: "#general:1a2b3c4d".\n' +
            'Created task #8 [in_progress] in #general. Message ID: msg_9f8e7d6c00000000. Thread: "#general:9f8e7d6c".\n'
    );
});

test('task list sends --mine and states how many rows the limit hid', async () => {
    const outputs: string[] = [];
    const routes: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(route: string, schema: z.ZodType<T>) => {
            routes.push(route);
            return schema.parse({ omitted: 12, tasks: [task(7)] }) as T;
        },
    };
    await runTaskList(
        {
            flags: { '--mine': true },
            help: false,
            positionals: [],
            valueLists: {},
            values: { '--status': 'all' },
        },
        taskDeps(client, outputs)
    );

    expect(routes).toEqual(['/api/agent/tasks?status=all&mine=true']);
    expect(outputs.join('')).toContain(
        '\nTruncated: 12 more. Narrow with --target, --status, or --mine.\n'
    );
});

const sageConflict = {
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
};

function task(number: number) {
    return {
        assignee: null,
        message: {
            attachments: [],
            author: { id: 'usr_wren', kind: 'user', label: 'wren', metadata: {} },
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
            sender: { description: null, handle: 'wren', type: 'human' },
            sequence: 1,
        },
        number,
        status: 'in_progress',
        target: '#general',
    };
}

function granted(number: number, outcome: 'already_yours' | 'claimed') {
    return { claimConflict: null, number, outcome, reason: null, task: task(number) };
}

function claimArgs(numbers: string[]): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--number': numbers },
        values: { '--target': '#general' },
    };
}

function stubClient(body: unknown): AgentApiRequester {
    return {
        request: async <T>(_route: string, schema: z.ZodType<T>) => schema.parse(body) as T,
    };
}

function taskDeps(client: AgentApiRequester, outputs: string[]) {
    return {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: (text: string) => outputs.push(text),
    };
}
