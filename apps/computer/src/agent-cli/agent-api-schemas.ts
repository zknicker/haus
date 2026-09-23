import {
    agentAutomationEventSchema,
    chatMessageReplySchema,
    type HausAgentMessage,
    type HausAgentSendResponse,
    taskOrigins,
} from '@haus/api';
import * as z from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const taskActorSchema = z.object({
    handle: z.string().nullable(),
    id: z.string(),
});

const messageAskSchema = z.object({
    addressee_handle: z.string().nullable(),
    id: z.string(),
    options: z.array(z.string()),
    status: z.enum(['open', 'answered']),
    title: z.string(),
});

const messageTaskSchema = z.object({
    assignee: taskActorSchema.nullable(),
    claimed_at: z.string().nullable(),
    created_at: z.string(),
    labels: z.array(
        z.object({
            color: z.enum([
                'red',
                'orange',
                'amber',
                'green',
                'teal',
                'blue',
                'purple',
                'pink',
                'gray',
            ]),
            id: z.string(),
            name: z.string(),
        })
    ),
    number: z.number().int().positive(),
    origin: z.enum(taskOrigins),
    priority: z.enum(['none', 'urgent', 'high', 'medium', 'low']),
    status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'closed']),
    updated_at: z.string(),
});

const messageCloudAgentWorkSchema = z.object({
    activity: z.string().nullable(),
    id: z.string(),
    latest_run: z
        .object({
            branches: z.array(
                z.object({
                    branch: z.string(),
                    pull_request_url: z.string().nullable(),
                    repository: z.string(),
                })
            ),
            error_code: z.string().nullable(),
            run_id: z.string(),
            status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'expired']),
            summary: z.string().nullable(),
        })
        .nullable(),
    provider: z.literal('cursor'),
    provider_url: z.string().nullable(),
    repository: z.string(),
    starting_ref: z.string().nullable(),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'expired']),
    title: z.string(),
});

/** The Agent one Agent created, as the creating Message carries it. */
const messageAgentCreatedSchema = z.object({
    agent_id: z.string(),
    description: z.string().nullable(),
    display_name: z.string(),
    handle: z.string(),
    retired: z.boolean(),
});

export const agentMessageSchema = z.object({
    agent_created: messageAgentCreatedSchema.nullable().optional(),
    ask: messageAskSchema.nullable().optional(),
    cloud_agent_work: messageCloudAgentWorkSchema.nullable().optional(),
    attachments: z.array(jsonObjectSchema),
    author: z.object({
        id: z.string().min(1),
        kind: z.enum(['user', 'agent', 'system', 'external', 'plugin']),
        label: z.string().nullable(),
        metadata: jsonObjectSchema,
    }),
    body_kind: z.enum(['text', 'ask', 'cloud-agent-work', 'agent-created']),
    chat_id: z.string().min(1),
    content: z.string(),
    created_at: z.string().min(1),
    deleted_at: z.string().nullable(),
    delivery_id: z.string().nullable(),
    id: z.string().min(1),
    metadata: jsonObjectSchema,
    nonce: z.string().nullable(),
    reactions: z
        .array(z.object({ actors: z.array(taskActorSchema), emoji: z.string() }))
        .optional(),
    replyCount: z.number().int().nonnegative().optional(),
    reply: chatMessageReplySchema.nullable().optional(),
    replyTarget: z.string().min(1).optional(),
    role: z.enum(['user', 'assistant', 'system']),
    sender: z.object({
        description: z.string().nullable(),
        handle: z.string().nullable(),
        type: z.enum(['human', 'agent', 'system']),
    }),
    sequence: z.number().int().positive(),
    task: messageTaskSchema.nullable().optional(),
    threadId: z.string().min(1).optional(),
}) satisfies z.ZodType<HausAgentMessage>;

export type AgentCliMessage = HausAgentMessage;

export const agentSendResponseSchema: z.ZodType<HausAgentSendResponse> = z.discriminatedUnion(
    'state',
    [
        z.object({
            message: agentMessageSchema,
            recentUnread: z.array(
                z.object({ message: agentMessageSchema, target: z.string().min(1) })
            ),
            state: z.literal('sent'),
        }),
        z.object({
            continueAnywaySuggested: z.boolean(),
            formalMentionCount: z.number().int().nonnegative(),
            newMessageCount: z.number().int().positive(),
            omittedMessageCount: z.number().int().nonnegative(),
            reholdCount: z.number().int().positive(),
            shownMessages: z.array(agentMessageSchema).max(12),
            state: z.literal('held'),
        }),
    ]
);

export const agentMessageCheckResponseSchema = z.object({
    /**
     * Bodiless inbox items served on the same pull: Trigger and Reminder fires,
     * and task assignments. None writes a Chat message, so they ride their own
     * array and carry their own envelope bodies.
     */
    automations: z.array(agentAutomationEventSchema).default([]),
    messages: z.array(
        z.object({
            message: agentMessageSchema,
            target: z.string().min(1),
            threadFollowReactivated: z.boolean().optional(),
        })
    ),
    more: z.boolean(),
});

export type AgentCliAutomationEvent = z.infer<typeof agentAutomationEventSchema>;

export const agentInboxCheckResponseSchema = z.object({
    rows: z.array(
        z.object({
            // An older Server omits the work facts; its rows print untagged.
            ask: z
                .object({
                    addresseeHandle: z.string().min(1).nullable(),
                    status: z.enum(['answered', 'open']),
                })
                .nullable()
                .default(null),
            chatId: z.string().min(1),
            cloudAgentResult: z.boolean().default(false),
            firstShortId: z.string().min(1),
            latestSender: z.string().min(1),
            latestShortId: z.string().min(1),
            mentioned: z.boolean(),
            pendingCount: z.number().int().positive(),
            target: z.string().min(1),
            taskNumber: z.number().int().positive().nullable().default(null),
        })
    ),
    totalPending: z.number().int().nonnegative(),
});

export const agentChannelActionResponseSchema = z.object({
    joined: z.boolean().optional(),
    left: z.boolean().optional(),
    muted: z.boolean().optional(),
    target: z.string().min(1),
});

export const agentHistoryResponseSchema = z.object({
    has_more: z.boolean(),
    has_newer: z.boolean(),
    has_older: z.boolean(),
    last_read: z.object({ after: z.number().int().nonnegative(), unread_after: z.number().int() }),
    messages: z.array(agentMessageSchema),
    target: z.string().min(1),
    thread_follow_reactivated_message_ids: z.array(z.string().min(1)).default([]),
});

const directoryPersonSchema = z.object({
    description: z.string().nullable(),
    handle: z.string().min(1),
});

export const agentChannelSchema = z.object({
    description: z.string().nullable(),
    handle: z.string().min(1),
    joined: z.boolean(),
    memberCount: z.number().int().nonnegative(),
});

export const agentServerInfoSchema = z.object({
    agents: z.array(directoryPersonSchema),
    channels: z.array(agentChannelSchema),
    hasMore: z.object({ agents: z.boolean(), channels: z.boolean(), humans: z.boolean() }),
    humans: z.array(directoryPersonSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.object({
        agents: z.number().int().nonnegative(),
        channels: z.number().int().nonnegative(),
        humans: z.number().int().nonnegative(),
    }),
});

export const agentChannelMembersSchema = z.object({
    members: z.array(
        z.object({
            description: z.string().nullable(),
            handle: z.string().nullable(),
            role: z.enum(['human', 'agent']),
        })
    ),
    target: z.string().min(1),
});

export const resolvedAgentMessageSchema = z.object({ message: agentMessageSchema });
export const agentSearchResponseSchema = z.object({
    messages: z.array(agentMessageSchema.extend({ target: z.string().min(1) })),
});

export const agentReactionResponseSchema = z.object({ message: agentMessageSchema });

export const agentProfileSchema = z.object({
    description: z.string().nullable(),
    handle: z.string().min(1),
    isSelf: z.boolean(),
});

export const agentProfileResponseSchema = z.object({ profile: agentProfileSchema });

export const agentAttachmentSchema = z.object({
    byteSize: z.number().int().nonnegative(),
    filename: z.string().min(1),
    id: z.string().min(1),
    mediaType: z.string().nullable(),
});

export const agentAttachmentUploadResponseSchema = z.object({
    attachment: agentAttachmentSchema,
});

export const agentAttachmentViewResponseSchema = z.object({
    attachment: agentAttachmentSchema.extend({ dataBase64: z.string() }),
});

export const agentSkillSummarySchema = z.object({
    description: z.string(),
    id: z.string(),
    name: z.string(),
});

export const agentSkillListResponseSchema = z.object({ skills: z.array(agentSkillSummarySchema) });
export const agentSkillViewResponseSchema = agentSkillSummarySchema.extend({
    content: z.string(),
    hash: z.string(),
    supportFiles: z.array(z.object({ hash: z.string(), path: z.string() })),
});
export const agentSkillCreateResponseSchema = z.object({ skill: agentSkillSummarySchema });
export const agentSkillChangeResponseSchema = z.object({
    change: z.object({
        afterHash: z.string(),
        beforeHash: z.string().nullable(),
        path: z.string(),
        skillId: z.string(),
    }),
});
export const agentSkillDeleteResponseSchema = z.object({
    deleted: z.object({ agentId: z.string(), skillId: z.string() }),
});
