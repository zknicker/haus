import type { McpPreset } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

/** Hosted MCP tools whose `body` argument becomes text people read on GitHub. */
const signedTools: ReadonlySet<string> = new Set([
    'add_comment_to_pending_review',
    'add_issue_comment',
    'add_reply_to_pull_request_comment',
    'create_pull_request',
    'issue_write',
    'pull_request_review_write',
    'update_issue_comment',
    'update_pull_request',
]);

/**
 * Names the Agent under the text it writes on GitHub, because every Agent
 * shares one bot identity there. The names are read only for a signable call.
 */
export async function signGithubToolCall(input: {
    args: Record<string, unknown>;
    readAgentName: () => Promise<string>;
    readPreset: () => Promise<McpPreset | null>;
    toolName: string;
}): Promise<Record<string, unknown>> {
    const { args } = input;
    const { body } = args;
    if (!signedTools.has(input.toolName) || typeof body !== 'string' || !body.trim()) {
        return args;
    }
    if ((await input.readPreset()) !== 'github') {
        return args;
    }
    const signature = `<sub>Posted by ${await input.readAgentName()} via Haus</sub>`;
    // An edit usually sends back text that already carries the signature.
    return body.trimEnd().endsWith(signature)
        ? args
        : { ...args, body: `${body.trimEnd()}\n\n${signature}` };
}

/** The Agent's display name, as the Server records it. */
export async function readAgentDisplayName(
    db: HausDatabase,
    scope: { agentId: string; serverId: string }
): Promise<string> {
    const [agent] = await db
        .select({ displayName: agentsTable.displayName })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, scope.serverId), eq(agentsTable.id, scope.agentId)))
        .limit(1);
    if (!agent) {
        throw new Error(`Agent ${scope.agentId} has no record on Server ${scope.serverId}.`);
    }
    return agent.displayName;
}
