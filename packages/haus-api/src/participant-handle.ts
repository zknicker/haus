import * as z from 'zod';

export const reservedParticipantHandles = [
    'agent',
    'agents',
    'all',
    'busy',
    'everyone',
    'haus',
    'here',
    'human',
    'humans',
    'idle',
    'system',
] as const;

const reservedParticipantHandleSet = new Set<string>(reservedParticipantHandles);

/** One Server-scoped alias grammar shared by humans and Agents. */
export const participantHandleSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,30}$/u, 'A handle is 2-31 lowercase letters, numbers, or hyphens.')
    .refine(
        (handle) => !reservedParticipantHandleSet.has(handle),
        'That handle is reserved by Haus.'
    );

export type ParticipantHandle = z.infer<typeof participantHandleSchema>;

/** Best-effort profile-derived seed; authoritative claims still happen in PostgreSQL. */
export function suggestParticipantHandle(...sources: Array<null | string | undefined>): string {
    const source =
        sources
            .find((candidate) => candidate?.trim())
            ?.trim()
            .toLowerCase() ?? '';
    const base = source
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 31)
        .replace(/-+$/gu, '');
    const candidate = base.length >= 2 ? base : `${base || 'human'}-member`;

    return participantHandleSchema.safeParse(candidate).success ? candidate : 'human-member';
}
