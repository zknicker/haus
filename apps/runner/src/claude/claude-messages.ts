import * as z from 'zod';

const usageSchema = z.looseObject({
    cache_creation: z
        .looseObject({
            ephemeral_1h_input_tokens: z.number().nullish(),
            ephemeral_5m_input_tokens: z.number().nullish(),
        })
        .nullish(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
    input_tokens: z.number().nullish(),
    output_tokens: z.number().nullish(),
});
export type ClaudeUsage = z.infer<typeof usageSchema>;

const contentBlockSchema = z.looseObject({
    content: z.unknown().optional(),
    id: z.string().optional(),
    input: z.unknown().optional(),
    is_error: z.boolean().nullish(),
    name: z.string().optional(),
    text: z.string().optional(),
    tool_use_id: z.string().optional(),
    type: z.string(),
});
export type ClaudeContentBlock = z.infer<typeof contentBlockSchema>;

const conversationSchema = z.looseObject({
    error: z.string().nullish(),
    isSynthetic: z.boolean().optional(),
    message: z.looseObject({
        content: z.union([z.string(), z.array(contentBlockSchema)]),
    }),
    parent_tool_use_id: z.string().nullish(),
    tool_use_result: z.unknown().optional(),
    type: z.enum(['assistant', 'user']),
});
export type ClaudeConversationMessage = z.infer<typeof conversationSchema>;

const streamEventSchema = z.looseObject({
    event: z.looseObject({
        content_block: z.looseObject({ type: z.string() }).optional(),
        delta: z
            .looseObject({
                text: z.string().optional(),
                thinking: z.string().optional(),
                type: z.string().optional(),
            })
            .optional(),
        index: z.number().optional(),
        message: z.looseObject({ usage: usageSchema.nullish() }).optional(),
        type: z.string(),
        usage: usageSchema.nullish(),
    }),
    parent_tool_use_id: z.string().nullish(),
    type: z.literal('stream_event'),
});
export type ClaudeStreamEvent = z.infer<typeof streamEventSchema>;

const modelUsageSchema = z.looseObject({
    cacheCreationInputTokens: z.number().nullish(),
    cacheReadInputTokens: z.number().nullish(),
    contextWindow: z.number().nullish(),
    inputTokens: z.number().nullish(),
    outputTokens: z.number().nullish(),
});
export type ClaudeModelUsage = z.infer<typeof modelUsageSchema>;

const resultSchema = z.looseObject({
    api_error_status: z.number().nullish(),
    errors: z.array(z.unknown()).nullish(),
    is_error: z.boolean().optional(),
    modelUsage: z.record(z.string(), modelUsageSchema).nullish(),
    num_turns: z.number().nullish(),
    result: z.string().nullish(),
    subtype: z.string(),
    total_cost_usd: z.number().nullish(),
    type: z.literal('result'),
    usage: usageSchema.nullish(),
    user_message_uuid: z.string().nullish(),
    user_message_uuids: z.array(z.string()).nullish(),
});
export type ClaudeResult = z.infer<typeof resultSchema>;

const systemSchema = z.looseObject({
    capabilities: z.array(z.string()).optional(),
    compact_metadata: z
        .looseObject({
            post_tokens: z.number().optional(),
            pre_tokens: z.number().optional(),
            trigger: z.string().optional(),
        })
        .optional(),
    error: z.string().nullish(),
    error_status: z.number().nullish(),
    subtype: z.string(),
    tasks: z
        .array(
            z.looseObject({
                ambient: z.boolean().optional(),
                task_id: z.string(),
                task_type: z.string(),
            })
        )
        .optional(),
    tools: z.array(z.string()).optional(),
    type: z.literal('system'),
});
export type ClaudeSystemMessage = z.infer<typeof systemSchema>;

const lifecycleSchema = z.looseObject({
    command_uuid: z.string(),
    state: z.string(),
    type: z.literal('command_lifecycle'),
});
export type ClaudeCommandLifecycle = z.infer<typeof lifecycleSchema>;

const unifiedWindowSchema = z
    .looseObject({ resetsAt: z.number(), utilization: z.number() })
    .optional()
    .catch(undefined);

const rateLimitSchema = z.looseObject({
    rate_limit_info: z
        .looseObject({
            resetsAt: z.number().optional(),
            status: z.string().optional(),
            unifiedWindows: z
                .looseObject({ five_hour: unifiedWindowSchema, seven_day: unifiedWindowSchema })
                .optional()
                .catch(undefined),
        })
        .optional(),
    type: z.literal('rate_limit_event'),
});
export type ClaudeRateLimitInfo = NonNullable<z.infer<typeof rateLimitSchema>['rate_limit_info']>;

export type ClaudeMessage =
    | { readonly kind: 'conversation'; readonly message: ClaudeConversationMessage }
    | { readonly kind: 'invalid'; readonly nativeType: string }
    | { readonly kind: 'lifecycle'; readonly message: ClaudeCommandLifecycle }
    | { readonly kind: 'other'; readonly nativeType: string }
    | { readonly kind: 'rate-limit'; readonly message: z.infer<typeof rateLimitSchema> }
    | { readonly kind: 'result'; readonly message: ClaudeResult }
    | { readonly kind: 'stream'; readonly message: ClaudeStreamEvent }
    | { readonly kind: 'system'; readonly message: ClaudeSystemMessage };

export interface ParsedClaudeMessage {
    readonly message: ClaudeMessage;
    readonly sessionId?: string;
}

const envelopeSchema = z.looseObject({ session_id: z.string().optional(), type: z.string() });

export function parseClaudeMessage(value: unknown) {
    const envelope = envelopeSchema.safeParse(value);
    if (!envelope.success) {
        const parsed: ParsedClaudeMessage = { message: { kind: 'invalid', nativeType: 'unknown' } };
        return parsed;
    }
    const parsed: ParsedClaudeMessage = {
        message: classify(envelope.data.type, value),
        ...(envelope.data.session_id ? { sessionId: envelope.data.session_id } : {}),
    };
    return parsed;
}

function classify(type: string, value: unknown) {
    switch (type) {
        case 'assistant':
        case 'user':
            return parsed(type, conversationSchema, value, (message) => ({
                kind: 'conversation',
                message,
            }));
        case 'command_lifecycle':
            return parsed(type, lifecycleSchema, value, (message) => ({
                kind: 'lifecycle',
                message,
            }));
        case 'rate_limit_event':
            return parsed(type, rateLimitSchema, value, (message) => ({
                kind: 'rate-limit',
                message,
            }));
        case 'result':
            return parsed(type, resultSchema, value, (message) => ({ kind: 'result', message }));
        case 'stream_event':
            return parsed(type, streamEventSchema, value, (message) => ({
                kind: 'stream',
                message,
            }));
        case 'system':
            return parsed(type, systemSchema, value, (message) => ({ kind: 'system', message }));
        default: {
            const other: ClaudeMessage = { kind: 'other', nativeType: type };
            return other;
        }
    }
}

function parsed<Schema extends z.ZodType>(
    type: string,
    schema: Schema,
    value: unknown,
    wrap: (message: z.infer<Schema>) => ClaudeMessage
) {
    const result = schema.safeParse(value);
    const invalid: ClaudeMessage = { kind: 'invalid', nativeType: type };
    return result.success ? wrap(result.data) : invalid;
}
