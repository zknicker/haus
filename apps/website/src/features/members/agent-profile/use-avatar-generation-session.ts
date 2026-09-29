import * as React from 'react';
import { useAgentAvatar } from '../../../hooks/members/use-agent-avatar.ts';
import { useAgentAvatarGeneration } from '../../../hooks/members/use-agent-avatar-generation.ts';
import {
    avatarGenerationSessionReducer,
    initialAvatarGenerationSession,
    isGenerating,
    stagedVariant,
} from './avatar-generation-session.ts';

/**
 * Drives one Agent's generation session: generate appends variants, save sends
 * the staged one through ordinary `avatar.set`. The state lives with the
 * always-mounted generator, not the dialog, so closing keeps it.
 */
export function useAvatarGenerationSession({
    agentId,
    serverId,
}: {
    agentId: string;
    serverId: string;
}) {
    const { generate } = useAgentAvatarGeneration(serverId, agentId);
    const { mutateAsync: setAvatar } = useAgentAvatar(serverId, agentId);
    const [session, dispatch] = React.useReducer(
        avatarGenerationSessionReducer,
        initialAvatarGenerationSession
    );
    // Run ids never repeat, so a result from before a save or a newer run is
    // recognizably stale even after the session resets.
    const lastRunId = React.useRef(0);

    const startGeneration = React.useCallback(async () => {
        const concept = session.concept.trim();
        if (!concept || isGenerating(session)) {
            return;
        }
        lastRunId.current += 1;
        const runId = lastRunId.current;
        dispatch({ runId, type: 'generationStarted' });
        try {
            const result = await generate(concept);
            dispatch({ avatar: result.avatar, runId, type: 'generationSucceeded' });
        } catch (cause) {
            dispatch({
                error: avatarGenerationErrorMessage(cause),
                runId,
                type: 'generationFailed',
            });
        }
    }, [generate, session]);

    const save = React.useCallback(async (): Promise<boolean> => {
        const variant = stagedVariant(session);
        if (!variant || session.saving) {
            return false;
        }
        dispatch({ type: 'saveStarted' });
        try {
            await setAvatar({
                bytesBase64: variant.avatar.bytesBase64,
                mediaType: variant.avatar.mediaType,
                serverId,
                target: { agentId, kind: 'agent' },
            });
            dispatch({ type: 'saved' });
            return true;
        } catch (cause) {
            dispatch({
                error: errorMessage(cause, 'The avatar could not be saved.'),
                type: 'saveFailed',
            });
            return false;
        }
    }, [agentId, serverId, session, setAvatar]);

    return {
        changeConcept: (concept: string) => dispatch({ concept, type: 'conceptChanged' }),
        open: () => dispatch({ type: 'opened' }),
        save,
        session,
        stage: (slot: string) => dispatch({ slot, type: 'staged' }),
        startGeneration,
    };
}

/** The Server admits one generation per Agent and two per Server. */
export function avatarGenerationErrorMessage(cause: unknown): string {
    if (trpcErrorCode(cause) === 'TOO_MANY_REQUESTS') {
        return 'Another avatar is still being drawn. Try again in a moment.';
    }
    return errorMessage(cause, 'The avatar could not be generated.');
}

function trpcErrorCode(cause: unknown): string | null {
    if (typeof cause !== 'object' || cause === null || !('data' in cause)) {
        return null;
    }
    const { data } = cause as { data?: { code?: unknown } | null };
    return typeof data?.code === 'string' ? data.code : null;
}

function errorMessage(cause: unknown, fallback: string): string {
    return cause instanceof Error && cause.message ? cause.message : fallback;
}
