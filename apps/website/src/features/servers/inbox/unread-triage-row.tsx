import type { ReactNode, Ref } from 'react';
import { useFocusWithin } from 'react-aria';
import { UnreadCountChip } from '../../../components/chats/unread-count-chip.tsx';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { UnreadRowComposer, type UnreadRowReply } from './unread-row-composer.tsx';
import { UnreadRowContent } from './unread-row-content.tsx';
import { UnreadRowHeader } from './unread-row-header.tsx';
import { MarkReadAction, UnreadRowTime } from './unread-row-parts.tsx';

/** What one Unread card says, whichever kind of place it is. */
export interface UnreadRowView {
    count: number;
    /** The open control's accessible name: the place, as navigation names it. */
    label: string;
    mark: ReactNode;
    /** Where its waiting messages live, for the card to render them. */
    messages: {
        chatId: string;
        conversationChatId: string;
        fallbackLine: string;
        serverId: string;
    };
    /** Muted beside the name: "DM", or a Thread's anchor. */
    note: ReactNode;
    reply: UnreadRowReply;
    time: null | string;
    /** The place as the card prints it: `#product`, `Tiny`, `Thread in #product`. */
    title: string;
}

/** How the list drives one card: whether it is the selected one, and what its actions do. */
export interface UnreadRowTriage {
    /** Handed to the selected card's composer only, so R types into that one. */
    composerRef: Ref<ChatComposerHandle>;
    isSelected: boolean;
    onMarkRead: () => void;
    /** Opens the conversation, which lands on its first unread message. */
    onOpen: () => void;
    onReplySent: () => void;
    /** Makes this the selected card, as focus moves into it. */
    onSelect: () => void;
    /** Focus follows onto the card's name, because the selection moved from inside the list. */
    takesFocus: boolean;
}

/**
 * One card of the Unread feed (ADR 0050): where its messages are from, its
 * newest waiting message rendered as the conversation renders it, and the
 * conversation's own composer, always there to type into.
 *
 * Every card is open; nothing expands or collapses. Selecting a card — J and
 * K, or focus moving into it — only rings it, so the cards never move
 * under the reader. The selected card is the one E, R, and Return act on.
 *
 * The `article` carries the place's name, so each card is one landmark.
 */
export function UnreadTriageRow({
    triage,
    view,
}: {
    triage: UnreadRowTriage;
    view: UnreadRowView;
}) {
    // Typing into a card's composer, or tabbing to its controls, selects it.
    const { focusWithinProps } = useFocusWithin({ onFocusWithin: triage.onSelect });

    return (
        <article
            aria-label={view.title}
            className={
                triage.isSelected
                    ? 'inbox-unread-row inbox-unread-selected min-w-0'
                    : 'inbox-unread-row min-w-0'
            }
            {...focusWithinProps}
        >
            <UnreadRowHeader
                actions={<MarkReadAction onPress={triage.onMarkRead} title={view.title} />}
                count={<UnreadCountChip count={view.count} />}
                label={view.label}
                mark={view.mark}
                note={view.note}
                onOpen={triage.onOpen}
                takesFocus={triage.takesFocus}
                time={<UnreadRowTime value={view.time} />}
                title={view.title}
            />
            <UnreadRowContent {...view.messages} onOpen={triage.onOpen} />
            <UnreadRowComposer
                onSent={triage.onReplySent}
                ref={triage.isSelected ? triage.composerRef : null}
                reply={view.reply}
            />
        </article>
    );
}
