import * as z from 'zod';

const identity = z.string().min(1).max(200);
export const cloudAgentInputQuestionSchema = z
    .object({
        header: z.string().max(100),
        multiSelect: z.boolean(),
        options: z
            .array(
                z
                    .object({
                        description: z.string().max(1000),
                        label: z.string().min(1).max(200),
                    })
                    .strict()
            )
            .min(2)
            .max(4),
        question: z.string().min(1).max(2000),
    })
    .strict();
export const cloudAgentInputQuestionsSchema = z
    .array(cloudAgentInputQuestionSchema)
    .min(1)
    .max(4)
    .refine(
        (questions) =>
            new Set(questions.map((question) => question.question)).size === questions.length,
        'Question text must be unique.'
    );
export const cloudAgentInputAnswersSchema = z.record(z.string(), z.string().min(1).max(4000));
export const cloudAgentInputRequestSchema = z
    .object({
        id: identity,
        workId: identity,
        runId: identity,
        sessionId: z.uuid(),
        promptId: identity,
        toolUseId: identity,
        questions: cloudAgentInputQuestionsSchema,
        answer: cloudAgentInputAnswersSchema.nullable(),
        state: z.enum(['pending', 'answered', 'resolved', 'cancelled']),
        createdAt: z.iso.datetime({ offset: true }),
        resumedPromptId: identity.nullable(),
        resumedToolUseId: identity.nullable(),
    })
    .strict();
export const cloudAgentInputAnswerSchema = z
    .object({ id: identity, answer: cloudAgentInputAnswersSchema })
    .strict();
export const cloudAgentCallbackCredentialSchema = z
    .object({
        workId: identity,
        runId: identity,
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Use 32 random bytes encoded as base64url.'),
    })
    .strict();
const native = { sessionId: z.uuid(), promptId: identity };
export const cloudAgentCallbackSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('prompt'), ...native, requestId: identity.optional() }).strict(),
    z
        .object({
            kind: z.literal('question'),
            ...native,
            toolUseId: identity,
            questions: cloudAgentInputQuestionsSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('consume'),
            ...native,
            toolUseId: identity,
            id: identity,
            answer: cloudAgentInputAnswersSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('stop'),
            ...native,
            backgroundTasks: z.number().int().nonnegative(),
            sessionCrons: z.number().int().nonnegative().optional(),
            lastAssistantMessage: z.string().max(2000),
        })
        .strict(),
    z
        .object({ kind: z.literal('failure'), ...native, message: z.string().min(1).max(2000) })
        .strict(),
]);
export const cloudAgentInputAttentionSchema = z
    .object({
        request: cloudAgentInputRequestSchema,
        title: z.string().min(1).max(120),
        repository: z.string().min(1).max(200),
        providerUrl: z.url().max(2000).nullable(),
    })
    .strict();
export type CloudAgentInputRequest = z.infer<typeof cloudAgentInputRequestSchema>;
export type CloudAgentInputAnswers = z.infer<typeof cloudAgentInputAnswersSchema>;
export type CloudAgentCallback = z.infer<typeof cloudAgentCallbackSchema>;
export type CloudAgentInputAttention = z.infer<typeof cloudAgentInputAttentionSchema>;
export const cloudAgentStopEvidenceSchema = z
    .object({
        promptId: identity,
        backgroundTasks: z.number().int().nonnegative(),
        sessionCrons: z.number().int().nonnegative().nullable(),
        observedAt: z.iso.datetime({ offset: true }),
    })
    .strict();
export type CloudAgentStopEvidence = z.infer<typeof cloudAgentStopEvidenceSchema>;
