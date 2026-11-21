import { workerQuestionsSchema } from '@haus/api';
import * as z from 'zod';

const askUserQuestionInputSchema = z.looseObject({
    questions: z.array(
        z.looseObject({
            header: z.string().nullish(),
            multiSelect: z.boolean().nullish(),
            options: z
                .array(z.looseObject({ description: z.string().nullish(), label: z.string() }))
                .nullish(),
            question: z.string(),
        })
    ),
});

/** Claude Code's `AskUserQuestion` input as Haus's structured questions, or why it is not one. */
export function claudeAskQuestions(input: unknown) {
    const asked = askUserQuestionInputSchema.safeParse(input);
    const questions = workerQuestionsSchema.safeParse(
        asked.data?.questions.map((question) => ({
            header: question.header?.trim() || null,
            multiSelect: question.multiSelect ?? false,
            options: (question.options ?? []).map((option) => ({
                description: option.description?.trim() || null,
                label: option.label,
            })),
            question: question.question,
        }))
    );
    if (questions.success) {
        return { ok: true, questions: questions.data } as const;
    }
    return { error: z.prettifyError(questions.error), ok: false } as const;
}
