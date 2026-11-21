import { workerQuestionsSchema } from '@haus/api';
import * as z from 'zod';

export const codexQuestionMethod = 'item/tool/requestUserInput';

const requestUserInputParamsSchema = z.looseObject({
    questions: z.array(
        z.looseObject({
            header: z.string(),
            options: z
                .array(z.looseObject({ description: z.string(), label: z.string() }))
                .nullish(),
            question: z.string(),
        })
    ),
    turnId: z.string().min(1),
});

export function codexQuestionRequest(params: unknown) {
    const parsed = requestUserInputParamsSchema.safeParse(params);
    if (!parsed.success) {
        return { message: refusal(parsed.error), valid: false } as const;
    }
    const questions = workerQuestionsSchema.safeParse(
        parsed.data.questions.map((question) => ({
            header: blankAsNull(question.header),
            multiSelect: false,
            options: (question.options ?? []).map((option) => ({
                description: blankAsNull(option.description),
                label: option.label,
            })),
            question: question.question,
        }))
    );
    if (!questions.success) {
        return { message: refusal(questions.error), valid: false } as const;
    }
    return { questions: questions.data, turnId: parsed.data.turnId, valid: true } as const;
}

function refusal(error: z.ZodError) {
    const issues = error.issues
        .map(
            (issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`
        )
        .join('; ');
    return `request_user_input was not asked (${issues}). Ask 1 to 4 questions, each with question text, a header of at most 60 characters, and at most 10 options whose labels are at most 200 characters.`;
}

function blankAsNull(text: string) {
    return text.trim().length > 0 ? text : null;
}
