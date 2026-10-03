import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTaskAssign, runTaskUnassign } from './agent-task-assign.ts';

test('task assign posts the handle and revision and says status is unchanged', async () => {
    const calls: Array<{ body: unknown; route: string }> = [];
    const outputs: string[] = [];
    await runTaskAssign(
        args({ '--assignee': 'kit', '--expected-revision': '3' }),
        deps(recordingClient(calls, taskRow({ handle: 'kit', id: 'agt_kit' })), outputs)
    );

    expect(calls).toEqual([
        {
            body: { assignee: '@kit', expectedRevision: 3, number: 7, target: '#general' },
            route: '/api/agent/tasks/assign',
        },
    ]);
    expect(outputs.join('')).toBe(
        'Assigned task #7 to @kit [todo, rev=4]. Status is unchanged; the assignee claims it to start.\n'
    );
});

test('task assign without --assignee points at unassign instead of guessing', async () => {
    const calls: Array<{ body: unknown; route: string }> = [];
    const failure = await runTaskAssign(
        args({}),
        deps(recordingClient(calls, taskRow(null)), [])
    ).catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(AgentCliError);
    expect((failure as AgentCliError).message).toContain('--assignee');
    expect(calls).toEqual([]);
});

test('task assign names the @mention path when the Server refuses a human handle', async () => {
    const refusing: AgentApiRequester = {
        request: async () => {
            throw new AgentCliError('TASK_CONFLICT', '@zach is not assignable in this chat.');
        },
    };
    const failure = await runTaskAssign(args({ '--assignee': '@zach' }), deps(refusing, [])).catch(
        (cause: unknown) => cause
    );

    expect((failure as AgentCliError).code).toBe('TASK_CONFLICT');
    expect((failure as AgentCliError).message).toBe('@zach is not assignable in this chat.');
    expect((failure as AgentCliError).options.nextAction).toContain(
        '@mention them in an inline reply where the request arrived'
    );
});

test('task assign rejects a malformed --expected-revision before calling the Server', async () => {
    const calls: Array<{ body: unknown; route: string }> = [];
    const failure = await runTaskAssign(
        args({ '--assignee': '@kit', '--expected-revision': 'soon' }),
        deps(recordingClient(calls, taskRow(null)), [])
    ).catch((cause: unknown) => cause);

    expect((failure as AgentCliError).code).toBe('INVALID_ARG');
    expect(calls).toEqual([]);
});

test('task unassign clears the assignee through its own route', async () => {
    const calls: Array<{ body: unknown; route: string }> = [];
    const outputs: string[] = [];
    await runTaskUnassign(args({}), deps(recordingClient(calls, taskRow(null)), outputs));

    expect(calls).toEqual([
        {
            body: { expectedRevision: undefined, number: 7, target: '#general' },
            route: '/api/agent/tasks/unassign',
        },
    ]);
    expect(outputs.join('')).toBe('Task #7 is now unassigned [todo, rev=4].\n');
});

function args(values: Record<string, string>): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: { '--number': ['7'] },
        values: { '--target': '#general', ...values },
    };
}

function recordingClient(
    calls: Array<{ body: unknown; route: string }>,
    task: unknown
): AgentApiRequester {
    return {
        request: async <T>(route: string, schema: z.ZodType<T>, init?: AgentApiRequest) => {
            calls.push({ body: init?.body, route });
            return schema.parse({ task }) as T;
        },
    };
}

function taskRow(assignee: { handle: string; id: string } | null) {
    return {
        assignee,
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
        number: 7,
        status: 'todo',
        target: '#general',
        version: 4,
    };
}

function deps(client: AgentApiRequester, outputs: string[]) {
    return {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: (text: string) => outputs.push(text),
    };
}
