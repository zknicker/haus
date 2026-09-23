import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { AvatarImageService } from '../avatar-generation/service.ts';
import { setAgentInlineReplyFollow } from '../chats/reply-follow-route.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { registerAgentAgentRoutes } from './agent-routes.ts';
import { registerAgentAskRoutes } from './ask-routes.ts';
import { registerAgentAttachmentRoutes } from './attachment-routes.ts';
import { unfollowAgentThread } from './attention.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { registerAgentChannelRoutes } from './channel-routes.ts';
import { registerAgentCloudAgentRoutes } from './cloud-agent-routes.ts';
import { readAgentServerDirectory } from './directory.ts';
import { registerAgentInboxRoutes } from './inbox-routes.ts';
import { registerAgentManualRoutes } from './manual.ts';
import { registerAgentMcpRoutes } from './mcp-routes.ts';
import { readAgentHistory, resolveAgentMessage, searchAgentMessages } from './message-read.ts';
import { registerAgentMessageSendRoute } from './message-send-route.ts';
import { readAgentProfile, updateAgentProfile } from './profile.ts';
import { registerAgentReactionRoutes } from './reaction-routes.ts';
import { registerAgentReminderRoutes } from './reminder-routes.ts';
import { registerAgentTaskRoutes } from './task-routes.ts';
import { registerAgentTriggerRoutes } from './trigger-routes.ts';

const historyQuerySchema = z.object({
    after: z.string().min(1).optional(),
    around: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    target: z.string().min(1),
});
const searchQuerySchema = z.object({
    after: z.coerce.date().optional(),
    before: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    q: z.string().trim().min(1).max(500),
    sender: z.string().trim().min(1).max(128).optional(),
    sort: z.enum(['recent', 'relevance']).default('relevance'),
    target: z.string().trim().min(1).max(200).optional(),
});
const directoryQuerySchema = z.object({
    agents: z.coerce.boolean().default(false),
    channels: z.coerce.boolean().default(false),
    humans: z.coerce.boolean().default(false),
    joined: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    query: z.string().trim().min(1).max(200).optional(),
});
const targetQuerySchema = z.object({ target: z.string().trim().min(1).max(200) });
const messageFollowSchema = z
    .object({
        messageId: z.string().trim().min(1).max(200),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

/**
 * The Agent surface behind the Computer's loopback proxy. A managed
 * Agent's `haus message send` reaches here with the scoped runner token the
 * Computer minted. The token fixes the author and Server; this route resolves
 * the product target and access Server-side and trusts no chat id from the body.
 */
export function registerAgentApiRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: import('../agent-delivery/delivery.ts').AgentDelivery;
        avatarImageService: AvatarImageService;
        attachmentRoot: AttachmentRoot;
        computers: import('../computers/connections.ts').ComputerConnections;
        db: HausDatabase;
        mcpRuntime: import('../server-mcp/runtime.ts').McpRuntime;
        postCommitWork: ServerPostCommitWork;
    }
) {
    registerAgentAttachmentRoutes(app, { db: options.db, root: options.attachmentRoot });
    registerAgentAgentRoutes(app, {
        agentDelivery: options.agentDelivery,
        avatarImageService: options.avatarImageService,
        db: options.db,
        postCommitWork: options.postCommitWork,
    });
    registerAgentAskRoutes(app, options);
    registerAgentChannelRoutes(app, { db: options.db });
    registerAgentCloudAgentRoutes(app, {
        agentDelivery: options.agentDelivery,
        computers: options.computers,
        db: options.db,
        postCommitWork: options.postCommitWork,
    });
    registerAgentInboxRoutes(app, options);
    registerAgentManualRoutes(app, options.db);
    registerAgentMcpRoutes(app, { db: options.db, runtime: options.mcpRuntime });
    registerAgentReactionRoutes(app, options.db);
    registerAgentReminderRoutes(app, options.db);
    registerAgentTaskRoutes(app, {
        agentDelivery: options.agentDelivery,
        db: options.db,
        postCommitWork: options.postCommitWork,
    });
    registerAgentTriggerRoutes(app, options.db);

    app.get('/api/agent/profile', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        const parsed = z.object({ target: z.string().optional() }).safeParse(request.query);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The profile request was invalid.');
        }
        try {
            return await readAgentProfile(options.db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/profile/update', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        const parsed = z
            .object({ description: z.string().trim().min(1).max(500) })
            .safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The profile request was invalid.');
        }
        try {
            return await updateAgentProfile(options.db, runner, parsed.data.description);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.get('/api/agent/server', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = directoryQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The directory request was invalid.'
            );
        }
        return await readAgentServerDirectory(options.db, runner, parsed.data);
    });

    app.post('/api/agent/threads/unfollow', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        const parsed = targetQuerySchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The thread request was invalid.');
        }
        try {
            return await unfollowAgentThread(options.db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    for (const [path, followed] of [
        ['/api/agent/messages/follow', true],
        ['/api/agent/messages/unfollow', false],
    ] as const) {
        app.post(path, async (request, reply) => {
            const runner = await authorizeAgentRunner(options.db, request);
            const parsed = messageFollowSchema.safeParse(request.body);
            if (!(runner && parsed.success)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The inline reply follow request was invalid.'
                );
            }
            try {
                return await setAgentInlineReplyFollow(options.db, runner, {
                    followed,
                    messageId: parsed.data.messageId,
                    target: parsed.data.target,
                });
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }

    app.get('/api/agent/history', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = historyQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The history request was invalid.');
        }
        try {
            return await readAgentHistory(options.db, runner, parsed.data);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.get('/api/agent/messages/search', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = searchQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The search request was invalid.');
        }
        try {
            return {
                messages: await searchAgentMessages(options.db, runner, {
                    ...parsed.data,
                    query: parsed.data.q,
                }),
            };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.get('/api/agent/messages/:id', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = z.object({ id: z.string().min(1).max(200) }).safeParse(request.params);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The message id was invalid.');
        }
        try {
            return { message: await resolveAgentMessage(options.db, runner, parsed.data.id) };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    registerAgentMessageSendRoute(app, options);
}
