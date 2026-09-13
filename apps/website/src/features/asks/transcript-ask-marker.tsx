import type { Ask } from '@haus/api';
import { useTranscriptRenderContextOptional } from '../chats/chat-transcript-render-context.tsx';
import { AskAnswerCard } from './ask-answer-card.tsx';
import { MessageAskMarker } from './message-ask-marker.tsx';

/**
 * The Ask marker as a transcript row renders it. Names and faces resolve
 * through the one actor resolver every other row already reads, so an
 * addressee who has since left the Server reads the same here as anywhere.
 */
export function TranscriptAskMarker({ ask }: { ask: Ask }) {
    const context = useTranscriptRenderContextOptional();
    const resolve = context?.resolveActorProfile;
    const addressee = resolve?.({ id: ask.addresseeUserId, kind: 'participant' }) ?? null;
    if (context?.threadAskReply) {
        return <AskAnswerCard addressee={addressee} ask={ask} reply={context.threadAskReply} />;
    }
    return (
        <MessageAskMarker
            addresseeProfile={
                addressee ? { avatarUrl: addressee.avatarUrl, name: addressee.name } : null
            }
            status={ask.status}
        />
    );
}
