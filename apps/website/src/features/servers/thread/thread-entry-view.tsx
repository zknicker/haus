import type {
    ConversationMessageLayout,
    TranscriptEntry,
} from '../../chats/chat-transcript-model.ts';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import { useEntityTranscriptEntry } from '../../chats/use-entity-transcript-entry.ts';

/** One Thread entry rendered from its message entity (`useEntityTranscriptEntry`). */
export function ThreadEntryView({
    conversationLayout,
    entry,
}: {
    conversationLayout: ConversationMessageLayout;
    entry: TranscriptEntry;
}) {
    const rendered = useEntityTranscriptEntry(entry);
    return rendered ? (
        <TranscriptEntryView
            activeReply={null}
            conversationLayout={conversationLayout}
            entry={rendered}
        />
    ) : null;
}
