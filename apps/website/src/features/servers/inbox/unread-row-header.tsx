import { ItemCard } from '@heroui-pro/react';
import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';

/**
 * The open row's source line: where its waiting messages are from (ADR 0050).
 * It is the collapsed line's own `ItemCard` geometry — the same mark, the
 * same name column — so opening a row changes what follows the name, never
 * where the name sits: the preview gives way to a muted note (`DM`, or the
 * message a Thread hangs off), and the trailing cluster gains Mark read.
 *
 * It is not pressable and paints no fill: the row is already open. The name
 * itself opens the conversation, underlined on hover the way a transcript
 * author's name is. When the row opened from inside the list, focus follows
 * onto the name (`takesFocus`), so the keyboard stays in the queue.
 */
export function UnreadRowHeader({
    actions,
    count,
    label,
    mark,
    note,
    onOpen,
    takesFocus,
    time,
    title,
}: {
    /** Mark read: done to the conversation as a whole. */
    actions: ReactNode;
    /** The right-most fact, which nothing in the line ever moves. */
    count: ReactNode;
    /** The open control's accessible name: the place, as navigation names it. */
    label: string;
    /** The place's sidebar mark: its Channel box or its DM face. */
    mark: ReactNode;
    /** Muted beside the name: "DM", or the message a Thread hangs off. */
    note: ReactNode;
    /** Opens the conversation, which lands on its first unread message. */
    onOpen: () => void;
    takesFocus: boolean;
    time: ReactNode;
    title: string;
}) {
    const nameRef = useRef<HTMLButtonElement>(null);
    useTakeFocus(nameRef, takesFocus);

    return (
        <ItemCard className="item-card--inbox-line" variant="transparent">
            {mark}
            <ItemCard.Content>
                <UnreadRowLineText
                    name={
                        <button
                            aria-label={label}
                            className="max-w-full cursor-(--cursor-interactive) truncate rounded-sm text-left font-medium text-foreground text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
                            onClick={onOpen}
                            ref={nameRef}
                            type="button"
                            {...opensPlace}
                        >
                            {title}
                        </button>
                    }
                    text={note ? <ItemCard.Description>{note}</ItemCard.Description> : null}
                />
            </ItemCard.Content>
            <ItemCard.Action>
                <span className="flex items-center gap-2 text-muted text-xs">
                    {time}
                    {actions}
                    {count}
                </span>
            </ItemCard.Action>
        </ItemCard>
    );
}

/**
 * The one line every Unread row reads as: a fixed column for the place, then
 * whatever follows it (a preview, a note). The column is fixed so a list of
 * rows lines its previews up; a long name truncates inside it.
 */
export function UnreadRowLineText({ name, text }: { name: ReactNode; text: ReactNode }) {
    return (
        <span className="flex min-w-0 items-baseline gap-3">
            <span className="flex w-40 min-w-0 shrink-0">{name}</span>
            {text}
        </span>
    );
}

/** Moves focus onto the element when asked to; a row opened from outside the list never asks. */
function useTakeFocus(ref: RefObject<HTMLElement | null>, on: boolean) {
    useEffect(() => {
        if (on) {
            ref.current?.focus();
        }
    }, [on, ref]);
}
