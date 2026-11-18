import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, requiredValue } from './agent-command-utils.ts';

const responseSchema = z.object({ target: z.string(), followed: z.boolean() });

interface AttentionDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const MESSAGE_ATTENTION_SUBCOMMANDS: SubCommand[] = ['follow', 'unfollow'].map((name) => ({
    examples: [`haus message ${name} --target "#general" --message-id 1a2b3c4d`],
    flags: [
        { name: '--target', valueName: '<target>', description: 'Channel or DM target' },
        { name: '--message-id', valueName: '<id>', description: 'Any message in the reply chain' },
    ],
    name,
    positionals: [],
    run: (args) =>
        runMessageAttention(name === 'follow', args, {
            client: createAgentApiClient(),
            write: (text) => process.stdout.write(text),
        }),
    summary: `${name === 'follow' ? 'Receive' : 'Leave'} ordinary inline reply notifications`,
    usage: `haus message ${name} --target <target> --message-id <id>`,
}));

export async function runMessageAttention(
    follow: boolean,
    args: ParsedArgs,
    deps: AttentionDeps
): Promise<number> {
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    const messageId = requiredValue(args, '--message-id');
    const response = await deps.client.request(
        `/api/agent/messages/${follow ? 'follow' : 'unfollow'}`,
        responseSchema,
        { body: { target, messageId }, method: 'POST' }
    );
    deps.write(
        response.followed
            ? `Following inline replies to ${messageId} in ${response.target}.\n`
            : `Left inline replies to ${messageId} in ${response.target}. Direct mentions still reach you.\n`
    );
    return 0;
}
