import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerTimestampSchema } from './worker-time.ts';

export const workerQuestionsMax = 4;

/**
 * One choice a Worker's harness offered. `description` is the harness's own
 * explanation of the choice, or null when it gave none.
 */
export const workerQuestionOptionSchema = z
    .object({
        description: z.string().trim().max(1000).nullable(),
        label: z.string().trim().min(1).max(200),
    })
    .strict();
export type WorkerQuestionOption = z.infer<typeof workerQuestionOptionSchema>;

/**
 * One structured question a Worker's harness asked (Claude Code's
 * `AskUserQuestion`, Codex's `request_user_input`). With no options the
 * question takes only a typed answer.
 */
export const workerQuestionSchema = z
    .object({
        header: z.string().trim().min(1).max(60).nullable(),
        multiSelect: z.boolean(),
        options: z.array(workerQuestionOptionSchema).max(10),
        question: z.string().trim().min(1).max(2000),
    })
    .strict();
export type WorkerQuestion = z.infer<typeof workerQuestionSchema>;

export const workerQuestionsSchema = z.array(workerQuestionSchema).min(1).max(workerQuestionsMax);
export type WorkerQuestions = z.infer<typeof workerQuestionsSchema>;

/**
 * Why an asking turn's questions closed without an answer: a person or the
 * delegating Agent dismissed them, or stopped the Worker while they were open.
 */
export const workerQuestionsClosedSchema = z
    .object({
        at: workerTimestampSchema,
        by: z.object({ id: idSchema, kind: z.enum(['agent', 'user']) }).strict(),
        reason: z.enum(['dismissed', 'stopped']),
    })
    .strict();
export type WorkerQuestionsClosed = z.infer<typeof workerQuestionsClosedSchema>;

/** One question's answer from the card: chosen option labels and an optional typed answer. */
export const workerQuestionAnswerSchema = z
    .object({
        labels: z.array(z.string().trim().min(1).max(200)).max(10),
        text: z.string().trim().min(1).max(4000).nullable(),
    })
    .strict();
export type WorkerQuestionAnswer = z.infer<typeof workerQuestionAnswerSchema>;

/** Computer to Server: the harness asked, the Computer journaled it, and it is ending the turn. */
export const workerTurnQuestionFrameSchema = z
    .object({
        attempt: z.number().int().positive(),
        questions: workerQuestionsSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-question'),
    })
    .strict();
export type WorkerTurnQuestionFrame = z.infer<typeof workerTurnQuestionFrameSchema>;
