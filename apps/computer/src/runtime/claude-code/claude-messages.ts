import * as z from 'zod';

/**
 * The slice of Claude Code's `--output-format stream-json` protocol the driver reads, validated
 * at the stdout boundary. Objects stay loose: a CLI upgrade adds fields constantly, and the
 * normalizer reads only what is named here.
 */
const usageSchema = z.looseObject({
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
    thinking: z.string().optional(),
    tool_use_id: z.string().optional(),
    type: z.string(),
});
export type ClaudeContentBlock = z.infer<typeof contentBlockSchema>;

const conversationSchema = z.looseObject({
    error: z.string().nullish(),
    isSynthetic: z.boolean().optional(),
    message: z.looseObject({
        content: z.union([z.string(), z.array(contentBlockSchema)]),
        usage: usageSchema.nullish(),
    }),
    parent_tool_use_id: z.string().nullish(),
    tool_use_result: z.unknown().optional(),
    type: z.enum(['assistant', 'user']),
});
export type ClaudeConversationMessage = z.infer<typeof conversationSchema>;

const streamEventSchema = z.looseObject({
    event: z.looseObject({
        content_block: z
            .looseObject({
                id: z.string().optional(),
                name: z.string().optional(),
                type: z.string(),
            })
            .optional(),
        delta: z
            .looseObject({
                text: z.string().optional(),
                thinking: z.string().optional(),
                // A `message_delta`'s delta carries the stop reason and no type.
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

const resultSchema = z.looseObject({
    api_error_status: z.number().nullish(),
    errors: z.array(z.unknown()).nullish(),
    is_error: z.boolean().optional(),
    /** `task-notification`: Claude Code started this turn itself to report background work. */
    origin: z.looseObject({ kind: z.string() }).nullish(),
    result: z.string().nullish(),
    stop_reason: z.string().nullish(),
    subtype: z.string(),
    terminal_reason: z.string().nullish(),
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
    patch: z
        .looseObject({ error: z.string().optional(), status: z.string().optional() })
        .optional(),
    subtype: z.string(),
    task_id: z.string().optional(),
    /** `background_tasks_changed`: every live background task, replacing the previous set. */
    tasks: z
        .array(
            z.looseObject({
                ambient: z.boolean().optional(),
                task_id: z.string(),
                task_type: z.string(),
            })
        )
        .optional(),
    type: z.literal('system'),
});
export type ClaudeSystemMessage = z.infer<typeof systemSchema>;

const lifecycleSchema = z.looseObject({
    command_uuid: z.string(),
    state: z.string(),
    type: z.literal('command_lifecycle'),
});
export type ClaudeCommandLifecycle = z.infer<typeof lifecycleSchema>;

const controlResponseSchema = z.looseObject({
    response: z.looseObject({
        error: z.string().optional(),
        request_id: z.string(),
        response: z.unknown().optional(),
        subtype: z.enum(['error', 'success']),
    }),
    type: z.literal('control_response'),
});
export type ClaudeControlResponse = z.infer<typeof controlResponseSchema>;

const rateLimitSchema = z.looseObject({
    rate_limit_info: z
        .looseObject({ resetsAt: z.number().optional(), status: z.string().optional() })
        .optional(),
    type: z.literal('rate_limit_event'),
});
export type ClaudeRateLimitEvent = z.infer<typeof rateLimitSchema>;

/** One stdout message, discriminated for the normalizer; `other` carries only its type. */
export type ClaudeMessage =
    | { readonly kind: 'conversation'; readonly message: ClaudeConversationMessage }
    | { readonly kind: 'control-response'; readonly message: ClaudeControlResponse }
    | { readonly kind: 'lifecycle'; readonly message: ClaudeCommandLifecycle }
    | { readonly kind: 'other'; readonly nativeType: string }
    | { readonly kind: 'rate-limit'; readonly message: ClaudeRateLimitEvent }
    | { readonly kind: 'result'; readonly message: ClaudeResult }
    | { readonly kind: 'stream'; readonly message: ClaudeStreamEvent }
    | { readonly kind: 'system'; readonly message: ClaudeSystemMessage };

const envelopeSchema = z.looseObject({ session_id: z.string().optional(), type: z.string() });

export interface ParsedClaudeLine {
    readonly message: ClaudeMessage;
    /** The raw object, for consumers that read Claude's own shape (sub-agent events). */
    readonly raw: Record<string, unknown>;
    readonly sessionId?: string;
}

/**
 * Parses one stdout line. Returns `null` for a line that is not a JSON object with a `type`;
 * a known type whose shape fails its schema is reported as `invalid` so the caller can log it.
 */
export function parseClaudeLine(
    line: string
): ParsedClaudeLine | { readonly invalid: string } | null {
    let json: unknown;
    try {
        json = JSON.parse(line);
    } catch {
        return null;
    }
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
        return null;
    }
    const raw = envelope.data as Record<string, unknown>;
    const message = classify(envelope.data.type, json);
    if (!message) {
        return { invalid: envelope.data.type };
    }
    return {
        message,
        raw,
        ...(envelope.data.session_id ? { sessionId: envelope.data.session_id } : {}),
    };
}

function classify(type: string, json: unknown): ClaudeMessage | null {
    switch (type) {
        case 'assistant':
        case 'user':
            return parsed(conversationSchema, json, (message) => ({
                kind: 'conversation',
                message,
            }));
        case 'command_lifecycle':
            return parsed(lifecycleSchema, json, (message) => ({ kind: 'lifecycle', message }));
        case 'control_response':
            return parsed(controlResponseSchema, json, (message) => ({
                kind: 'control-response',
                message,
            }));
        case 'rate_limit_event':
            return parsed(rateLimitSchema, json, (message) => ({ kind: 'rate-limit', message }));
        case 'result':
            return parsed(resultSchema, json, (message) => ({ kind: 'result', message }));
        case 'stream_event':
            return parsed(streamEventSchema, json, (message) => ({ kind: 'stream', message }));
        case 'system':
            return parsed(systemSchema, json, (message) => ({ kind: 'system', message }));
        default:
            return { kind: 'other', nativeType: type };
    }
}

function parsed<Schema extends z.ZodType>(
    schema: Schema,
    json: unknown,
    wrap: (value: z.infer<Schema>) => ClaudeMessage
): ClaudeMessage | null {
    const result = schema.safeParse(json);
    return result.success ? wrap(result.data) : null;
}
