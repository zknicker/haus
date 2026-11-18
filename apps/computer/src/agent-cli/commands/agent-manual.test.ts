import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runManualGet, runManualSearch } from './agent-manual.ts';

const taskClaimRecipeMetadata = {
    class: 'technique' as const,
    evidence: 'verified' as const,
    industries: ['universal'],
    prereqs: ['task board or message id'],
    tier: 'seeded' as const,
    triggers: ['should I claim this before starting'],
};

test('manual get sends intent and reason and renders the complete topic body', async () => {
    const requests: AgentApiRequest[] = [];
    const client = requester((route, input) => {
        expect(route).toBe('/api/agent/manual/get');
        requests.push(input);
        return {
            topic: {
                body: 'Claim the task before doing work.',
                ...taskClaimRecipeMetadata,
                id: 'recipes/technique/task-claim-lock',
                kind: 'recipe',
                related: ['recipes/index'],
                summary: 'Use the task claim as the concurrency lock.',
                title: 'Before doing work, claim the task',
            },
        };
    });
    let output = '';

    await runManualGet(
        args('recipes/technique/task-claim-lock', {
            '--intent': 'I need the procedure before changing the repository.',
            '--reason': 'The task requires a safe, auditable implementation path.',
        }),
        { client, write: (text) => (output += text) }
    );

    expect(requests).toEqual([
        {
            query: {
                intent: 'I need the procedure before changing the repository.',
                reason: 'The task requires a safe, auditable implementation path.',
                topic: 'recipes/technique/task-claim-lock',
            },
        },
    ]);
    expect(output).toBe(
        '# Before doing work, claim the task\n\nClaim the task before doing work.\n'
    );
});

test('manual search joins keyword positionals and scopes recipe results for a later get', async () => {
    const requests: AgentApiRequest[] = [];
    const client = requester((route, input) => {
        expect(route).toBe('/api/agent/manual/search');
        requests.push(input);
        return {
            query: 'claim task',
            results: [
                {
                    ...taskClaimRecipeMetadata,
                    id: 'recipes/technique/task-claim-lock',
                    kind: 'recipe',
                    summary: 'Use the task claim as the concurrency lock.',
                    title: 'Before doing work, claim the task',
                },
            ],
            scope: 'recipes',
        };
    });
    let output = '';

    await runManualSearch(
        args(['claim', 'task'], {
            '--intent': 'I need matching guidance before I start work.',
            '--limit': '5',
            '--reason': 'The task asks for a safe procedure selection.',
            '--scope': 'recipes',
        }),
        { client, write: (text) => (output += text) }
    );

    expect(requests).toEqual([
        {
            query: {
                intent: 'I need matching guidance before I start work.',
                limit: '5',
                q: 'claim task',
                reason: 'The task asks for a safe procedure selection.',
                scope: 'recipes',
            },
        },
    ]);
    expect(output).toBe(
        [
            'recipes/technique/task-claim-lock — Before doing work, claim the task',
            '  Use the task claim as the concurrency lock.',
            '',
            'Next: open the top result with haus manual get recipes/technique/task-claim-lock --intent "I need matching guidance before I start work." --reason "The task asks for a safe procedure selection."',
            '',
        ].join('\n')
    );
});

test('manual search next step single-quotes intent text the shell would expand', async () => {
    const client = requester(() => ({
        query: 'reminder',
        results: [
            {
                id: 'reminder',
                kind: 'overview',
                summary: 'Schedule anchored wake-ups.',
                title: 'Reminders',
            },
        ],
        scope: 'all',
    }));
    let output = '';

    await runManualSearch(
        args(['reminder'], {
            '--intent': "Check $BUILD after it's done tonight",
            '--reason': 'I have not scheduled a reminder before.',
        }),
        { client, write: (text) => (output += text) }
    );

    expect(output).toContain(
        `haus manual get reminder --intent 'Check $BUILD after it'\\''s done tonight' --reason "I have not scheduled a reminder before."`
    );
});

test('manual commands reject short intent before making a request', async () => {
    let requested = false;
    const client = requester(() => {
        requested = true;
        return {};
    });

    await expect(
        runManualGet(
            args('index', { '--intent': 'too short', '--reason': 'This reason is long enough.' }),
            { client, write: () => undefined }
        )
    ).rejects.toMatchObject({ code: 'INVALID_ARG' });
    expect(requested).toBe(false);
});

test('manual get preserves the server recovery hint for an unknown topic', async () => {
    const client = requester(() => {
        throw new AgentCliError('MANUAL_TOPIC_NOT_FOUND', 'The topic was not found.', {
            nextAction: "Run 'haus manual get index' to browse available topics.",
        });
    });

    await expect(
        runManualGet(
            args('recipes/no-such-topic', {
                '--intent': 'I need a missing topic for the recovery test.',
                '--reason': 'The CLI should preserve the Server hint for the Agent.',
            }),
            { client, write: () => undefined }
        )
    ).rejects.toMatchObject({
        code: 'MANUAL_TOPIC_NOT_FOUND',
        options: { nextAction: expect.stringContaining('haus manual get index') },
    });
});

function args(topic: string | string[], values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: Array.isArray(topic) ? topic : [topic], values };
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
