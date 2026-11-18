import { expect, test } from 'bun:test';

import type * as z from 'zod';

import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTaskUnfollow } from './agent-task-unfollow.ts';

test('task unfollow posts the Task target and says what still reaches the Agent', async () => {
    const calls: { input?: AgentApiRequest; route: string }[] = [];
    const client: AgentApiRequester = {
        request: async <T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest) => {
            calls.push({ input, route });
            return schema.parse({ target: 'task:SEC-12', unfollowed: true }) as T;
        },
    };
    const output: string[] = [];

    await runTaskUnfollow(args('SEC-12'), { client, write: (text) => output.push(text) });

    expect(calls).toEqual([
        {
            input: { body: { target: 'task:SEC-12' }, method: 'POST' },
            route: '/api/agent/tasks/unfollow',
        },
    ]);
    expect(output.join('')).toBe(
        'Unfollowed task:SEC-12. Its ordinary messages no longer wake you; direct @mentions still do.\nPosting in the Task follows it again.\n'
    );
});

test('task unfollow refuses a target that is not a Task', async () => {
    const client: AgentApiRequester = {
        request: async () => {
            throw new Error('the Server must not be asked');
        },
    };
    await expect(
        runTaskUnfollow(args('#general:1a2b3c4d'), { client, write: () => undefined })
    ).rejects.toBeInstanceOf(AgentCliError);
});

function args(target: string): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: {},
        values: { '--target': target },
    };
}
