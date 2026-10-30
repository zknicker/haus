import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode, Ref } from 'react';
import { UnreadCountChip } from '../../../components/chats/unread-count-chip.tsx';
import { springs } from '../../../lib/springs.ts';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { UnreadRowComposer, type UnreadRowReply } from './unread-row-composer.tsx';
import { UnreadRowContent } from './unread-row-content.tsx';
import { UnreadRowHeader, UnreadRowLineText } from './unread-row-header.tsx';
import { MarkReadAction, UnreadRowTime } from './unread-row-parts.tsx';

/** What one Unread row says, whichever kind of place it is. */
export interface UnreadRowView {
    count: number;
    /** The open control's accessible name: the place, as navigation names it. */
    label: string;
    mark: ReactNode;
    /** Where its waiting messages live, for the open row to render them. */
    messages: {
        chatId: string;
        conversationChatId: string;
        fallbackLine: string;
        serverId: string;
    };
    /** Muted beside the name once the row is open: "DM", or a Thread's anchor. */
    note: ReactNode;
    /** The collapsed line's quote of the newest waiting message. */
    preview: ReactNode;
    reply: UnreadRowReply;
    time: null | string;
    /** The place as the row prints it: `#product`, `Tiny`, `Thread in #product`. */
    title: string;
}

/** How the list drives one row: whether it is the open one, and what its actions do. */
export interface UnreadRowTriage {
    composerRef: Ref<ChatComposerHandle>;
    isOpen: boolean;
    onMarkRead: () => void;
    /** Opens the conversation, which lands on its first unread message. */
    onOpen: () => void;
    onReplySent: () => void;
    /** Opens this row in place. */
    onSelect: () => void;
    /** Focus follows into the row as it opens, because it opened from inside the list. */
    takesFocus: boolean;
}

/**
 * One row of the Unread triage list (ADR 0050). Collapsed, it is one line —
 * mark, place, the newest waiting message, time, count — and pressing it opens
 * it in place. Open, it is the one row on the raised ground: its source line,
 * the newest waiting message rendered as the conversation renders it, and the
 * conversation's own composer.
 *
 * The `article` carries the place's name either way, so each row is one
 * landmark whose contents change with it.
 *
 * Switching rows is a reveal, not a jump. The line swaps at once — the open
 * header sits on the collapsed line's geometry — while the body below it (the
 * message and the composer) grows open on the app's `drawer` spring, and the
 * row that closes folds its body away on the same spring. The two run
 * together, so the rows between them glide rather than snap, and J/K stays
 * quick. The raised ground eases in with them (`inbox-unread-row`). The first
 * open row on load is simply there, and reduced motion swaps instantly.
 */
export function UnreadTriageRow({
    triage,
    view,
}: {
    triage: UnreadRowTriage;
    view: UnreadRowView;
}) {
    const shouldReduceMotion = useReducedMotion() === true;

    return (
        <article
            aria-label={view.title}
            className={
                triage.isOpen
                    ? 'inbox-unread-row inbox-unread-open min-w-0'
                    : 'inbox-unread-row min-w-0'
            }
        >
            {triage.isOpen ? (
                <OpenRowLine triage={triage} view={view} />
            ) : (
                <CollapsedRow onSelect={triage.onSelect} view={view} />
            )}
            <AnimatePresence initial={false}>
                {triage.isOpen ? (
                    <motion.div
                        animate={{ height: 'auto', opacity: 1 }}
                        className="overflow-hidden"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        key="body"
                        transition={shouldReduceMotion ? { duration: 0 } : springs.drawer}
                    >
                        <UnreadRowContent {...view.messages} onOpen={triage.onOpen} />
                        <UnreadRowComposer
                            onSent={triage.onReplySent}
                            ref={triage.composerRef}
                            reply={view.reply}
                        />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </article>
    );
}

/**
 * A collapsed row: a stock `ItemCard` rendered as the button that opens it in
 * place — `ItemCard`'s documented Pressable composition, as the rail's rows
 * are. Unlike a rail row it opens nothing elsewhere, so it carries no tab-open
 * gesture; the place's name in the open row does that.
 */
function CollapsedRow({ onSelect, view }: { onSelect: () => void; view: UnreadRowView }) {
    return (
        <ItemCard<'button'>
            aria-expanded={false}
            className="item-card--inbox-line relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
            onClick={onSelect}
            render={(props) => <button type="button" {...props} />}
            variant="transparent"
        >
            <PressableFeedback.Highlight />
            {view.mark}
            <ItemCard.Content>
                <UnreadRowLineText
                    name={<ItemCard.Title>{view.title}</ItemCard.Title>}
                    text={<ItemCard.Description>{view.preview}</ItemCard.Description>}
                />
            </ItemCard.Content>
            <ItemCard.Action>
                <span className="flex items-center gap-2 text-muted text-xs">
                    <UnreadRowTime value={view.time} />
                    <UnreadCountChip count={view.count} />
                </span>
            </ItemCard.Action>
        </ItemCard>
    );
}

/** The open row's line: its source line, on the collapsed line's geometry. */
function OpenRowLine({ triage, view }: { triage: UnreadRowTriage; view: UnreadRowView }) {
    return (
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
    );
}
