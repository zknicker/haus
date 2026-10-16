/**
 * The Inbox's opening line: what day it is, and who is reading. It is the one
 * place the page addresses the person rather than the work, so it stays to a
 * header line and a greeting — no stat tiles, no poster type. The greeting
 * itself lives in `inbox-greeting.ts`.
 */
export function todayLabel(now: number): string {
    return new Date(now).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
    });
}
