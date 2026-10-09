import { agentInboxConversationsResponseSchema, agentInboxViews } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { decodeInboxActivityKey } from './inbox-activity-key.ts';
import {
    type InboxConversationsQuery,
    listAgentInboxConversations,
} from './inbox-conversations.ts';

const defaultLimit = 20;
const maxLimit = 50;

/**
 * `GET /api/agent/inbox/conversations`, behind `haus inbox check`. The list is
 * all or nothing: any failure is a retryable 503, never a partial inbox that
 * reads as "nothing else is unread".
 */
export function registerAgentInboxConversationsRoute(
    app: FastifyInstance,
    options: { db: HausDatabase }
) {
    app.get('/api/agent/inbox/conversations', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const query = parseInboxConversationsQuery(request.query);
        if (typeof query === 'string') {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', query);
        }
        try {
            return agentInboxConversationsResponseSchema.parse(
                await listAgentInboxConversations(options.db, runner, query)
            );
        } catch (cause) {
            request.log.error({ err: cause }, 'Agent inbox conversations failed.');
            return sendAgentApiError(
                reply,
                503,
                'INBOX_UNAVAILABLE',
                'Inbox is temporarily unavailable',
                {
                    nextAction:
                        'Retry in a moment; to drain new messages now use haus message check.',
                    retryable: true,
                }
            );
        }
    });
}

/** The parsed query, or the CLI-facing reason it is invalid. */
export function parseInboxConversationsQuery(raw: unknown): InboxConversationsQuery | string {
    const query = (raw ?? {}) as Record<string, unknown>;
    const view = query.view ?? 'unread';
    if (!agentInboxViews.includes(view as InboxConversationsQuery['view'])) {
        return `--view must be one of ${agentInboxViews.join(', ')}; got ${String(view)}`;
    }
    const rawBefore = query.before;
    const before = typeof rawBefore === 'string' ? decodeInboxActivityKey(rawBefore) : null;
    if (rawBefore !== undefined && before === null) {
        return `--before must be the key printed on the More: line; got ${String(rawBefore).slice(0, 200)}`;
    }
    const limit = query.limit ?? String(defaultLimit);
    const limitValue =
        typeof limit === 'string' && /^[1-9][0-9]*$/u.test(limit) ? Number(limit) : 0;
    if (limitValue < 1 || limitValue > maxLimit) {
        return `--limit must be an integer from 1 to ${maxLimit}; got ${String(limit)}`;
    }
    return {
        before,
        limit: limitValue,
        view: view as InboxConversationsQuery['view'],
    };
}
