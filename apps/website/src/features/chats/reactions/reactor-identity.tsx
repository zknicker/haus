import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useTranscriptRenderContextOptional } from '../chat-transcript-render-context.tsx';
import type { ReactionActor } from './reaction-pile-model.ts';

export interface Reactor {
    avatarUrl: string | null;
    id: string;
    name: string;
}

/** Tooltip avatar size: small enough to sit on one line with a name. */
const faceSize = 18;

/**
 * Names and faces for reactors through the transcript's one actor resolver,
 * so a reactor reads the same here as on their own messages.
 */
export function useReactors() {
    const context = useTranscriptRenderContextOptional();
    const resolve = context?.resolveActorProfile;
    const viewerUserId = context?.viewerUserId;

    return (actor: ReactionActor): Reactor => {
        const profile =
            resolve?.({ id: actor.id, kind: actor.kind === 'agent' ? 'agent' : 'participant' }) ??
            null;
        const self = actor.id === viewerUserId || profile?.isSelf === true;

        return {
            avatarUrl: profile?.avatarUrl ?? null,
            id: actor.id,
            name: self ? 'You' : (profile?.name ?? actor.handle ?? 'Someone'),
        };
    };
}

export function ReactorFace({ reactor }: { reactor: Reactor }) {
    return <EntityAvatar name={reactor.name} size={faceSize} src={reactor.avatarUrl} />;
}
