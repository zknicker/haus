import {
    type AgentInboxLocation,
    consumeVisibleMessages,
    recordRunVisibleMessages,
    type VisibleMessageIdentity,
} from './inbox-store.ts';
import { attestVisibleMessages } from './visibility-receipt.ts';

/**
 * Records the messages a proxied response showed the model: the run's local
 * visibility, the Server's seen receipt, and local inbox consumption, so a
 * shown message is never delivered again as news. Returns a failure Response
 * when the receipt could not be recorded, or null to return the original
 * response. Mutations (send, react, a held Cloud Agent launch) already acted
 * or deliberately did not, so their result is returned even when recording
 * fails.
 */
export async function recordProxyVisibility(input: {
    activeRunId: string | null;
    location: AgentInboxLocation | null;
    mutation: boolean;
    runnerToken: string;
    serverOrigin: string;
    visible: VisibleMessageIdentity[];
}): Promise<Response | null> {
    const { activeRunId, location, visible } = input;
    if (!location || visible.length === 0) {
        return null;
    }
    try {
        if (activeRunId) {
            await recordRunVisibleMessages(location, activeRunId, visible);
        }
        const attested = activeRunId
            ? await attestVisibleMessages(input.serverOrigin, input.runnerToken, visible)
            : null;
        if (!((activeRunId && attested) || input.mutation)) {
            return Response.json(
                {
                    code: 'VISIBILITY_RECEIPT_UNAVAILABLE',
                    message: 'The Server could not record visible messages.',
                },
                { status: 502 }
            );
        }
        await consumeVisibleMessages(location, attested ?? visible);
        return null;
    } catch {
        if (input.mutation) {
            return null;
        }
        return Response.json(
            {
                code: 'LOCAL_INBOX_UNAVAILABLE',
                message: 'The Agent inbox could not record visible messages.',
            },
            { status: 500 }
        );
    }
}
