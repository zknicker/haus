import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/** Who holds a Thread right now (specs/open-threads.md). Not an attention tier: no badge, no notice. */
export const openThreadGroups = ['with-you', 'with-agents', 'recent'] as const;
export type OpenThreadGroup = (typeof openThreadGroups)[number];

export const openThreadGroupByState = {
    approved: 'with-you',
    'changes-requested': 'with-you',
    'checks-failing': 'with-you',
    'checks-running': 'with-agents',
    done: 'recent',
    draft: 'with-agents',
    'job-failed': 'with-you',
    merged: 'recent',
    'needs-input': 'with-agents',
    'pr-closed': 'recent',
    'ready-for-review': 'with-you',
    recent: 'recent',
    unread: 'with-you',
    waiting: 'with-agents',
    working: 'with-agents',
} as const satisfies Record<string, OpenThreadGroup>;

export type OpenThreadState = keyof typeof openThreadGroupByState;

const openThreadStateSchema = z.enum(
    Object.keys(openThreadGroupByState) as [OpenThreadState, ...OpenThreadState[]]
);

export const openThreadSchema = z
    .object({
        /** The author behind an `unread` or `recent` line, or the Agent a `waiting` line names. */
        actorName: z.string().min(1).nullable(),
        anchorMessageId: idSchema,
        /** The moment the status line's `<d>` counts from. */
        at: timestampSchema.nullable(),
        /** Null while the state lasts until its job or pull request changes. */
        expiresAt: timestampSchema.nullable(),
        group: z.enum(openThreadGroups),
        jobCount: z.number().int().nonnegative(),
        lastActivityAt: timestampSchema.nullable(),
        liveJobCount: z.number().int().nonnegative(),
        mentionsViewer: z.boolean(),
        parentChatId: idSchema,
        state: openThreadStateSchema,
        threadChatId: idSchema,
        title: z.string().min(1),
        /** The newest word from a live job; past ten minutes a `working` line says so. */
        updatedAt: timestampSchema.nullable(),
    })
    .strict();

export type OpenThread = z.infer<typeof openThreadSchema>;

export const threadScopeInputSchema = z.object({ serverId: idSchema }).strict();

export const openThreadListSchema = z
    .object({
        /** Threads the viewer closed; the band offers Reopen on these. */
        closedThreadChatIds: z.array(idSchema),
        threads: z.array(openThreadSchema),
    })
    .strict();

/** Not strict: a tRPC infinite query adds its own `direction` to the input. */
export const earlierThreadsInputSchema = z.object({
    cursor: z.number().int().nonnegative().nullish(),
    scope: z.enum(['following', 'all']),
    serverId: idSchema,
});

export const earlierThreadListSchema = z
    .object({
        nextCursor: z.number().int().positive().nullable(),
        threads: z.array(openThreadSchema),
    })
    .strict();

export const threadClosedInputSchema = z
    .object({ closed: z.boolean(), serverId: idSchema, threadChatId: idSchema })
    .strict();

export type EarlierThreadsScope = z.infer<typeof earlierThreadsInputSchema>['scope'];

/** The Thread's title: its oldest work's title, else the anchor's first plain line. */
export function threadTitle(input: {
    anchorContent: string | null;
    oldestWorkTitle: string | null;
}): string {
    if (input.oldestWorkTitle) {
        return input.oldestWorkTitle;
    }
    const line = (input.anchorContent ?? '')
        .replace(/\[([^\]\n]*)\]\([^)\s]*\)/gu, '$1')
        .split('\n')
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0);
    return line ? line.slice(0, 80).trim() : 'Thread';
}
