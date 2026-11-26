import { formatTaskTarget } from '@haus/api';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { taskShortIdArgument } from './agent-command-utils.ts';

export const TASK_UNFOLLOW_SUBCOMMAND: SubCommand = {
    examples: ['haus task unfollow --target task:k3mq7xta'],
    flags: [
        {
            description: 'The Task to stop following',
            name: '--target',
            valueName: '<task:shortId>',
        },
    ],
    name: 'unfollow',
    positionals: [],
    run: (args) => runTaskUnfollow(args, defaultDeps()),
    summary: 'Stop following a Task',
    usage: 'haus task unfollow --target <task:shortId>',
};

interface TaskUnfollowDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

const unfollowResponseSchema = z.looseObject({
    target: z.string().min(1),
    unfollowed: z.literal(true),
});

export async function runTaskUnfollow(args: ParsedArgs, deps: TaskUnfollowDeps): Promise<number> {
    const target = formatTaskTarget(taskShortIdArgument(args.values['--target'], '--target'));
    const response = await deps.client.request(
        '/api/agent/tasks/unfollow',
        unfollowResponseSchema,
        {
            body: { target },
            method: 'POST',
        }
    );
    deps.write(
        [
            `Unfollowed ${response.target}. Its ordinary messages no longer wake you; direct @mentions still do.`,
            'Posting in the Task follows it again.',
            '',
        ].join('\n')
    );
    return 0;
}

function defaultDeps(): TaskUnfollowDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
