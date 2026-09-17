import type { agentCreationFixture } from './agent-creation-fixture.ts';

type InlineReplyFixture = ReturnType<typeof agentCreationFixture>;

export function createInlineReplyHelpers(fixture: InlineReplyFixture) {
    return {
        follows: async (rootMessageId: string) => {
            return (await fixture.harness.sql`
                select agent_id as "agentId", followed
                from agent_message_follows
                where server_id = ${fixture.serverId} and chat_id = ${fixture.channelId}
                  and root_message_id = ${rootMessageId}
                order by agent_id
            `) as Array<{ agentId: string; followed: boolean }>;
        },
        recipients: async (messageId: string | undefined) => {
            if (!messageId) {
                return [];
            }
            return (await fixture.harness.sql`
                select agent_id as "agentId", mentioned
                from agent_inbox
                where server_id = ${fixture.serverId} and dedupe_key = ${messageId}
                order by agent_id
            `) as Array<{ agentId: string; mentioned: boolean }>;
        },
        sendAgentMessage,
        sendAgentRequest,
        sendInlineAgent,
    };

    async function sendAgentRequest(
        token: string,
        body: {
            content?: string;
            continueAnyway?: boolean;
            nonce: string;
            replyToMessageId?: string;
            sendDraft?: boolean;
            target: string;
        }
    ) {
        const response = await fetch(new URL('/api/agent/messages/send', fixture.harness.url), {
            body: JSON.stringify(body),
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            method: 'POST',
        });
        return {
            body: (await response.json()) as {
                message?: {
                    id: string;
                    reply?: {
                        parent: { id: string };
                        parentMessageId: string;
                        root: { id: string };
                        rootMessageId: string;
                    } | null;
                };
                state?: string;
            },
            status: response.status,
        };
    }

    async function sendInlineAgent(
        token: string,
        body: {
            content: string;
            nonce: string;
            replyToMessageId: string;
            target: string;
        }
    ) {
        return await sendAgentMessage(token, body);
    }

    async function sendAgentMessage(
        token: string,
        body: {
            content: string;
            nonce: string;
            replyToMessageId?: string;
            target: string;
        }
    ) {
        const first = await sendAgentRequest(token, body);
        if (first.body.state !== 'held') {
            return first;
        }
        const reheld = await sendAgentRequest(token, {
            nonce: `${body.nonce}_draft`,
            sendDraft: true,
            target: body.target,
        });
        if (reheld.body.state !== 'held') {
            return reheld;
        }
        return await sendAgentRequest(token, {
            continueAnyway: true,
            nonce: `${body.nonce}_release`,
            sendDraft: true,
            target: body.target,
        });
    }
}
