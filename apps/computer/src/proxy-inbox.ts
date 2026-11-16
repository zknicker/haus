import { agentMessageSchema } from './agent-cli/agent-api-schemas.ts';
import {
    type AgentInboxLocation,
    consumeVisibleMessages,
    isAutomationInboxItem,
    readPendingInboxState,
    recordRunVisibleMessages,
    type VisibleMessageIdentity,
} from './inbox-store.ts';

/** Serves the Computer's cached message page after recording its visibility. */
export async function serveLocalAgentEvents(input: {
    location: AgentInboxLocation;
    getRunId(): string | null;
    attest(identities: VisibleMessageIdentity[]): Promise<void>;
}): Promise<Response | null> {
    const local = await localAgentEvents(input.location);
    if (!local) {
        return null;
    }
    const runId = input.getRunId();
    if (!runId) {
        return Response.json(
            { code: 'AGENT_IDLE', message: 'The Agent has no active turn.' },
            { status: 409 }
        );
    }
    await recordRunVisibleMessages(input.location, runId, local.identities);
    await input.attest(local.identities);
    await consumeVisibleMessages(input.location, local.identities);
    return Response.json({ automations: [], messages: local.messages, more: local.more });
}

async function localAgentEvents(location: AgentInboxLocation) {
    const pending = await readPendingInboxState(location);
    // A pending fire or claim assignment has no cached body and only the Server
    // can retire it. Let the whole pull go upstream so those items and messages
    // arrive in one ordered response instead of being split across a local page
    // and a Server page.
    if (pending.items.some(isAutomationInboxItem)) {
        return null;
    }
    const visible = pending.items
        .map((item) => {
            const message = agentMessageSchema.safeParse(item.message);
            return message.success ? { item, message: message.data } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
    if (visible.length === 0) {
        return null;
    }
    const selected = visible.slice(0, 40);
    return {
        identities: selected.map(({ message }) => ({
            chatId: message.chat_id,
            id: message.id,
            sequence: message.sequence,
        })),
        messages: selected.map(({ item, message }) => ({
            message,
            target: item.target,
            ...(item.threadFollowReactivated ? { threadFollowReactivated: true } : {}),
        })),
        more: pending.totalPending > selected.length,
    };
}
