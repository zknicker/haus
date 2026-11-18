import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runReminderSchedule, runReminderUpdate } from './agent-reminder.ts';

const reminder = {
    anchorTarget: 'task:SEC-12',
    description: null,
    fireAt: '2026-11-17T19:35:00.000Z',
    id: 'rem_task',
    repeat: null,
    script: false,
    status: 'scheduled',
    title: 'Deploy Check',
    version: 3,
};

test('a reminder on a Task sends its task: target and no message id (ADR 0053)', async () => {
    const requests: AgentApiRequest[] = [];
    const client = requester((_route, input) => {
        requests.push(input);
        return { reminder };
    });

    await runReminderSchedule(
        args({ '--delay-seconds': '600', '--target': 'task:SEC-12', '--title': 'Deploy Check' }),
        { client, write: () => undefined }
    );

    expect(requests[0]?.body).toMatchObject({ target: 'task:SEC-12', title: 'Deploy Check' });
    expect(requests[0]?.body).not.toHaveProperty('messageId');
});

test('a bare Task key reads as its task: target', async () => {
    const requests: AgentApiRequest[] = [];
    const client = requester((_route, input) => {
        requests.push(input);
        return { reminder };
    });

    await runReminderSchedule(
        args({ '--delay-seconds': '600', '--target': 'SEC-12', '--title': 'Deploy Check' }),
        { client, write: () => undefined }
    );

    expect(requests[0]?.body).toMatchObject({ target: 'task:SEC-12' });
});

test.each([
    [{ '--message-id': 'deadbeef', '--target': 'task:SEC-12' }, 'not both'],
    [{}, 'or --target task:KEY-n for a Task'],
    [{ '--target': '#general' }, '--target needs a Task key like SEC-12'],
])('refuses an anchor that is not exactly one message or Task: %p', async (anchor, message) => {
    const routes: string[] = [];
    const client = requester((route) => {
        routes.push(route);
        return { reminder };
    });
    await expect(
        runReminderSchedule(args({ '--delay-seconds': '600', '--title': 'Check', ...anchor }), {
            client,
            write: () => undefined,
        })
    ).rejects.toThrow(message);
    expect(routes).toEqual([]);
});

test('a recurring reminder on a Task is refused before any request, pointing at a Channel', async () => {
    const routes: string[] = [];
    const client = requester((route) => {
        routes.push(route);
        return { reminder };
    });
    const error = await runReminderSchedule(
        args({ '--repeat': 'every:1h', '--target': 'task:SEC-12', '--title': 'Watch' }),
        { client, write: () => undefined }
    ).catch((cause: unknown) => cause);

    expect(routes).toEqual([]);
    expect(error).toBeInstanceOf(AgentCliError);
    const rendered = renderAgentCliError(error as AgentCliError);
    expect(rendered).toContain('Code: TASK_RECURRING_REMINDER');
    expect(rendered).toContain('Next action: Recurring reminders belong on a Channel');
});

test("the Server's TASK_RECURRING_REMINDER refusal gains the same next step", async () => {
    const client = requester((route) => {
        if (route === '/api/agent/reminders') {
            return { reminders: [reminder] };
        }
        throw new AgentCliError('TASK_RECURRING_REMINDER', 'A Task holds only one-time reminders.');
    });
    const error = await runReminderUpdate(args({ '--id': reminder.id, '--repeat': 'every:1h' }), {
        client,
        write: () => undefined,
    }).catch((cause: unknown) => cause);

    expect(error).toMatchObject({
        code: 'TASK_RECURRING_REMINDER',
        message: 'A Task holds only one-time reminders.',
        options: { nextAction: expect.stringContaining('belong on a Channel') },
    });
});

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values };
}

function requester(respond: (route: string, input: AgentApiRequest) => unknown): AgentApiRequester {
    return {
        async request<T>(
            route: string,
            schema: z.ZodType<T>,
            input: AgentApiRequest = {}
        ): Promise<T> {
            return schema.parse(respond(route, input));
        },
    };
}
