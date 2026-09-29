import type { GeneratedAvatar } from '@haus/api/avatar-generation';

/**
 * One Agent's avatar generation session: the concept being drafted, every
 * variant generated so far, which one is staged, and the latest run.
 *
 * The session outlives the dialog. Closing never throws work away — an
 * in-flight run keeps going and lands as a new page, and unsaved variants stay
 * until a successful save or until the generator remounts for another Agent.
 * Only a save in flight blocks dismissal.
 */
export interface AvatarGenerationSession {
    concept: string;
    /** The newest run, or null before the first one and after a save. */
    run: AvatarGenerationRun | null;
    /**
     * Set by a successful save. The session keeps rendering its variants while
     * the dialog animates out, and resets the next time the dialog opens.
     */
    saved: boolean;
    /** Failure of the last save; tied to the staged variant, not to generation. */
    saveError: string | null;
    saving: boolean;
    /** A variant id, or `latestRunSlot` for the pending or failed run. */
    staged: string | null;
    variants: readonly AvatarVariant[];
}

export type AvatarGenerationRun =
    | { id: number; status: 'generating' }
    | { error: string; id: number; status: 'failed' };

export interface AvatarVariant {
    avatar: GeneratedAvatar;
    id: string;
}

/** Stage page for the latest run while it is generating or after it failed. */
export const latestRunSlot = 'latest-run';

export type AvatarGenerationAction =
    | { concept: string; type: 'conceptChanged' }
    | { runId: number; type: 'generationStarted' }
    | { avatar: GeneratedAvatar; runId: number; type: 'generationSucceeded' }
    | { error: string; runId: number; type: 'generationFailed' }
    | { slot: string; type: 'staged' }
    | { type: 'saveStarted' }
    | { error: string; type: 'saveFailed' }
    | { type: 'saved' }
    | { type: 'opened' };

export const initialAvatarGenerationSession: AvatarGenerationSession = {
    concept: '',
    run: null,
    saved: false,
    saveError: null,
    saving: false,
    staged: null,
    variants: [],
};

export function avatarGenerationSessionReducer(
    session: AvatarGenerationSession,
    action: AvatarGenerationAction
): AvatarGenerationSession {
    switch (action.type) {
        case 'conceptChanged':
            return { ...session, concept: action.concept };
        case 'generationStarted':
            return {
                ...session,
                run: { id: action.runId, status: 'generating' },
                saveError: null,
                staged: latestRunSlot,
            };
        case 'generationSucceeded': {
            if (!isCurrentRun(session, action.runId)) {
                return session;
            }
            const variant = { avatar: action.avatar, id: `variant-${action.runId}` };
            return {
                ...session,
                run: null,
                // Follow the new variant only if the reader was waiting on it;
                // someone comparing earlier variants keeps their place.
                staged: session.staged === latestRunSlot ? variant.id : session.staged,
                variants: [...session.variants, variant],
            };
        }
        case 'generationFailed':
            if (!isCurrentRun(session, action.runId)) {
                return session;
            }
            return { ...session, run: { error: action.error, id: action.runId, status: 'failed' } };
        case 'staged':
            return session.staged === action.slot
                ? session
                : { ...session, saveError: null, staged: action.slot };
        case 'saveStarted':
            return { ...session, saveError: null, saving: true };
        case 'saveFailed':
            return { ...session, saveError: action.error, saving: false };
        case 'saved':
            // Dropping the run is what keeps a result still in flight from
            // landing in a session whose avatar was already chosen.
            return { ...session, run: null, saved: true, saving: false };
        case 'opened':
            return session.saved ? initialAvatarGenerationSession : session;
        default:
            return session;
    }
}

export function stagedVariant(session: AvatarGenerationSession): AvatarVariant | null {
    return session.variants.find((variant) => variant.id === session.staged) ?? null;
}

/** Pages in order: every variant, then the latest run while it draws or after it fails. */
export function sessionSlots(session: AvatarGenerationSession): string[] {
    const slots = session.variants.map((variant) => variant.id);
    return session.run ? [...slots, latestRunSlot] : slots;
}

/** The slot `delta` pages from the staged one, wrapping at both ends. */
export function adjacentSlot(session: AvatarGenerationSession, delta: number): string | null {
    const slots = sessionSlots(session);
    if (slots.length < 2) {
        return null;
    }
    const index = Math.max(0, slots.indexOf(session.staged ?? ''));
    return slots[(index + delta + slots.length) % slots.length] ?? null;
}

export function isGenerating(session: AvatarGenerationSession): boolean {
    return session.run?.status === 'generating';
}

/** A stale result — from a run superseded by a save or a newer run — never lands. */
function isCurrentRun(session: AvatarGenerationSession, runId: number): boolean {
    return session.run?.status === 'generating' && session.run.id === runId;
}
