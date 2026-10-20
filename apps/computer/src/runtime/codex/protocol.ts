import * as z from 'zod';

/**
 * The slice of the `codex app-server` v2 JSON-RPC protocol the Codex driver reads, validated at
 * the wire. Shapes follow the bindings the pinned CLI generates
 * (`codex app-server generate-ts --out <dir>`, Codex 0.159.0); every object stays loose so a
 * field Codex adds later never fails a message the driver can still read.
 */
export const initializeResultSchema = z.looseObject({
    codexHome: z.string().optional(),
    userAgent: z.string().min(1),
});

export const threadResultSchema = z.looseObject({
    thread: z.looseObject({ id: z.string().min(1) }),
});

export const turnStartResultSchema = z.looseObject({
    turn: z.looseObject({ id: z.string().min(1) }),
});

export const configReadResultSchema = z.looseObject({
    config: z.record(z.string(), z.unknown()).nullish(),
    layers: z.array(z.looseObject({ config: z.unknown() })).nullish(),
});

const tokenBreakdownSchema = z.looseObject({
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheWriteInputTokens: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().optional(),
});
export type CodexTokenBreakdown = z.infer<typeof tokenBreakdownSchema>;

export const tokenUsageParamsSchema = z.looseObject({
    threadId: z.string().optional(),
    tokenUsage: z.looseObject({ last: tokenBreakdownSchema, total: tokenBreakdownSchema }),
    turnId: z.string().optional(),
});

/**
 * `codexErrorInfo` is a string tag or a one-key object such as
 * `{ responseStreamDisconnected: { httpStatusCode: 401 } }`.
 */
export const codexErrorInfoSchema = z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.null(),
]);

export const turnErrorSchema = z.looseObject({
    additionalDetails: z.string().nullish(),
    codexErrorInfo: codexErrorInfoSchema.optional(),
    message: z.string(),
});
export type CodexTurnError = z.infer<typeof turnErrorSchema>;

export const errorParamsSchema = z.looseObject({
    error: turnErrorSchema,
    threadId: z.string().optional(),
    turnId: z.string().optional(),
    willRetry: z.boolean().optional(),
});

export const turnParamsSchema = z.looseObject({
    threadId: z.string().optional(),
    turn: z.looseObject({
        error: turnErrorSchema.nullish(),
        id: z.string().min(1),
        status: z.enum(['completed', 'failed', 'inProgress', 'interrupted']).optional(),
    }),
});

export const itemParamsSchema = z.looseObject({
    item: z.looseObject({ id: z.string().optional(), type: z.string() }),
    threadId: z.string().optional(),
    turnId: z.string().optional(),
});
export type CodexItem = z.infer<typeof itemParamsSchema>['item'];

export const deltaParamsSchema = z.looseObject({
    delta: z.string(),
    itemId: z.string().optional(),
    phase: z.string().nullish(),
    threadId: z.string().optional(),
    turnId: z.string().optional(),
});

export const threadStatusParamsSchema = z.looseObject({
    status: z.looseObject({
        activeFlags: z.array(z.string()).optional(),
        error: z.looseObject({ message: z.string().optional() }).optional(),
        message: z.string().optional(),
        type: z.string(),
    }),
    threadId: z.string().optional(),
});

export const mcpStartupParamsSchema = z.looseObject({
    error: z.string().nullish(),
    name: z.string(),
    status: z.enum(['cancelled', 'failed', 'ready', 'starting']),
    threadId: z.string().nullish(),
});

const userMessageStartedSchema = z.looseObject({
    item: z.looseObject({
        content: z.array(z.looseObject({ text: z.string().optional(), type: z.string() })),
        type: z.literal('userMessage'),
    }),
});

/** The text of a `userMessage` item Codex started (a prompt or accepted steer), else null. */
export function userMessageText(message: { method: string; params: unknown }): string | null {
    if (message.method !== 'item/started') {
        return null;
    }
    const parsed = userMessageStartedSchema.safeParse(message.params);
    return parsed.success
        ? parsed.data.item.content
              .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
              .join('')
        : null;
}

/** The thread a notification belongs to, wherever this method keeps it. */
export function notificationThreadId(params: unknown): string | undefined {
    if (typeof params !== 'object' || params === null) {
        return;
    }
    const record = params as { thread?: { id?: unknown }; threadId?: unknown };
    if (typeof record.threadId === 'string' && record.threadId.length > 0) {
        return record.threadId;
    }
    const nested = record.thread?.id;
    return typeof nested === 'string' && nested.length > 0 ? nested : undefined;
}
