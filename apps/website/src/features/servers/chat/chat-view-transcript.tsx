import type { Chat } from '@haus/api';
import type * as React from 'react';
import { useCrewLifecycleNotes } from '../../tasks/use-crew-lifecycle-notes.ts';
import { ChatTranscript } from './chat-transcript.tsx';

export function ChatViewTranscript({
    chat,
    ...props
}: Omit<React.ComponentProps<typeof ChatTranscript>, 'timelineNotes'> & {
    chat: Pick<Chat, 'kind' | 'peerAgentId' | 'serverId'>;
}) {
    const timelineNotes = useCrewLifecycleNotes(chat);
    return <ChatTranscript {...props} timelineNotes={timelineNotes} />;
}
