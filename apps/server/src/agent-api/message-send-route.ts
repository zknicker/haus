import { agentSendInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import { publishAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import { inferMessageCause } from '../automations/infer-message-cause.ts';
import { MessageCauseError, resolveMessageCause } from '../automations/message-cause.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { InvalidInlineReplyError } from '../chats/reply-context.ts';
import {
    AgentMessageContentTooLongError,
    AgentSendConflictError,
    sendAgentMessage,
} from '../chats/send-agent-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { resolveAgentSendTarget } from './resolve-send-target.ts';
import { AgentTargetError } from './resolve-target.ts';
import { AgentSendModeError, clearAgentDraft, prepareAgentSend } from './send-hold.ts';

export function registerAgentMessageSendRoute(
    app: FastifyInstance,
    options: {
        db: HausDatabase;
        agentDelivery: import('../agent-delivery/delivery.ts').AgentDelivery;
        postCommitWork: ServerPostCommitWork;
    }
) {
    app.post('/api/agent/messages/send', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }

        const parsed = agentSendInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The message send request was invalid.'
            );
        }
        const input = {
            ...parsed.data,
            content: parsed.data.content?.trimEnd(),
        };

        try {
            const committed = await options.db.transaction(async (tx) => {
                await lockServerRow(tx, runner.serverId);
                const chatId = await resolveAgentSendTarget(tx, runner, input.target);
                // Provenance is resolved before the hold check so an unknown or
                // borrowed fire id is refused outright, never held. Without an
                // explicit `--cause`, a sole served fire answered in its anchor
                // Chat is inferred instead.
                const cause = input.cause
                    ? {
                          attribution: 'explicit' as const,
                          fire: await resolveMessageCause(tx, {
                              agentId: runner.agentId,
                              cause: input.cause,
                              serverId: runner.serverId,
                          }),
                      }
                    : await inferMessageCause(tx, { ...runner, chatId });
                const prepared = await prepareAgentSend(tx, runner, chatId, input);
                if (prepared.kind === 'held') {
                    return { kind: 'held' as const, response: prepared.response };
                }
                const result = await sendAgentMessage(
                    tx,
                    {
                        agentId: runner.agentId,
                        attachmentIds: prepared.outgoing.attachmentIds,
                        ...(cause ? { cause } : {}),
                        chatId,
                        content: prepared.outgoing.content,
                        nonce: input.nonce,
                        ...(prepared.outgoing.replyToMessageId
                            ? { replyToMessageId: prepared.outgoing.replyToMessageId }
                            : {}),
                        runId: runner.runId,
                        serverId: runner.serverId,
                        target: input.target,
                    },
                    options.agentDelivery
                );
                await clearAgentDraft(tx, runner, chatId);
                return { chatId, kind: 'sent' as const, result };
            });
            if (committed.kind === 'held') {
                return committed.response;
            }
            const { chatId, result } = committed;
            for (const activity of result.activities) {
                publishCommittedAgentActivity(activity);
            }
            publishAgentLifecycle({
                agentId: runner.agentId,
                chatId,
                compositionId: input.compositionId ?? runner.runId,
                phase: 'sending',
                runId: runner.runId,
                serverId: runner.serverId,
                text: result.message.content,
            });
            publishAgentLifecycle({
                agentId: runner.agentId,
                chatId,
                phase: 'working',
                runId: runner.runId,
                serverId: runner.serverId,
            });
            for (const event of result.events) {
                emitDurableChatEvent({ audienceUserId: null, event });
            }
            await options.postCommitWork.wakeAgents(options.agentDelivery, result.wakes);
            return { message: result.message, recentUnread: [], state: 'sent' as const };
        } catch (cause) {
            return sendAgentMessageError(reply, cause);
        }
    });
}

function sendAgentMessageError(reply: import('fastify').FastifyReply, cause: unknown) {
    if (
        cause instanceof AgentMessageContentTooLongError ||
        cause instanceof MessageCauseError ||
        cause instanceof InvalidInlineReplyError
    ) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
    }
    if (cause instanceof AgentSendConflictError) {
        return sendAgentApiError(reply, 409, 'SEND_FAILED', cause.message);
    }
    if (cause instanceof AgentSendModeError) {
        return sendAgentApiError(reply, cause.status, cause.code, cause.message);
    }
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not record the message.');
}
