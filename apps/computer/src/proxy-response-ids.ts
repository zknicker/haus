import {
    agentHistoryResponseSchema,
    agentMessageCheckResponseSchema,
    agentReactionResponseSchema,
    agentSearchResponseSchema,
    agentSendResponseSchema,
    resolvedAgentMessageSchema,
} from './agent-cli/agent-api-schemas.ts';
import type { VisibleMessageIdentity } from './inbox-store.ts';

type VisibleExtractor = (body: unknown) => VisibleMessageIdentity[];

const visibleByPath: Readonly<Record<string, VisibleExtractor>> = {
    '/api/agent/events': (body) => {
        const parsed = agentMessageCheckResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map((row) => identity(row.message)) : [];
    },
    '/api/agent/history': (body) => {
        const parsed = agentHistoryResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map(identity) : [];
    },
    '/api/agent/messages/react': (body) => {
        const parsed = agentReactionResponseSchema.safeParse(body);
        return parsed.success ? [identity(parsed.data.message)] : [];
    },
    '/api/agent/messages/search': (body) => {
        const parsed = agentSearchResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map(identity) : [];
    },
    '/api/agent/messages/send': (body) => {
        const parsed = agentSendResponseSchema.safeParse(body);
        if (!parsed.success) {
            return [];
        }
        return parsed.data.state === 'held'
            ? parsed.data.shownMessages.map(identity)
            : parsed.data.recentUnread.map((row) => identity(row.message));
    },
};

const resolvedMessagePath = /^\/api\/agent\/messages\/[^/]+$/u;

function visibleInResolvedMessage(body: unknown): VisibleMessageIdentity[] {
    const parsed = resolvedAgentMessageSchema.safeParse(body);
    return parsed.success ? [identity(parsed.data.message)] : [];
}

/** Automation ids a `/api/agent/events` response served, for the local mirror. */
export function extractServedAutomationIds(responseBody: string): string[] {
    const parsed = agentMessageCheckResponseSchema.safeParse(parseJson(responseBody));
    return parsed.success ? parsed.data.automations.map((event) => event.id) : [];
}

/** Messages a proxied response showed the model, for visibility receipts. */
export function extractVisibleMessageIds(
    pathname: string,
    responseBody: string
): VisibleMessageIdentity[] {
    const body = parseJson(responseBody);
    if (!(body && typeof body === 'object')) {
        return [];
    }
    const extract =
        visibleByPath[pathname] ??
        (resolvedMessagePath.test(pathname) ? visibleInResolvedMessage : undefined);
    return extract ? extract(body) : [];
}

function identity(message: {
    chat_id: string;
    id: string;
    sequence: number;
}): VisibleMessageIdentity {
    return { chatId: message.chat_id, id: message.id, sequence: message.sequence };
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
