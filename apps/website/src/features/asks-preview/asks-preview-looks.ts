import type { QuestionSummaryLook } from '../asks/question-summary.tsx';

export const reviewLooks = [
    { look: 'list', short: 'A rows', title: 'A · Rows with a status mark' },
    { look: 'compact', short: 'B compact', title: 'B · Compact, short labels' },
    { look: 'grid', short: 'C tiles', title: 'C · Tiles' },
    { look: 'plain', short: 'D plain', title: 'D · Plain, as in Capy' },
] as const satisfies readonly { look: QuestionSummaryLook; short: string; title: string }[];

export function findReviewLook(value: string) {
    return reviewLooks.find((entry) => entry.look === value) ?? null;
}
