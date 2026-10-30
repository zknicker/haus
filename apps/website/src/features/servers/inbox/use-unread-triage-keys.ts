import { type RefObject, useEffect, useEffectEvent } from 'react';
import { useViewShown } from '../../../hooks/desktop-tabs/view-shown.ts';

/** What a key does to the Unread list. */
export type UnreadTriageCommand = 'mark-read' | 'next' | 'open' | 'previous' | 'reply';

/** The keys Unread answers, shown beside its heading. */
export const unreadTriageKeyHint = 'J / K move · E mark read · R reply';

/**
 * The Unread list's keys (ADR 0050): J and K move the open row down and up, E
 * marks it read and moves on, R puts the cursor in its composer, and Return
 * opens its conversation.
 *
 * They are single letters, so they answer only while the viewer is on the
 * list or on the page itself — never while typing in the composer or any
 * other field, never inside a dialog, never with a modifier held (those
 * belong to the App's and the browser's own shortcuts), and only while this
 * view is the one on screen (a kept tab stays mounted while hidden). Return
 * on a focused control is that control's own press, so it opens the
 * conversation only from the page or a non-control inside the list. A handled
 * key is consumed, so R does not also type an "r" into the editor it focused.
 */
export function useUnreadTriageKeys(
    listRef: RefObject<HTMLElement | null>,
    run: (command: UnreadTriageCommand) => void
) {
    const viewShown = useViewShown();
    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            !viewShown.isShown()
        ) {
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (!(target && inScope(target, listRef.current))) {
            return;
        }
        const command = unreadTriageCommand(event.key, isControl(target));
        if (command) {
            event.preventDefault();
            run(command);
        }
    });

    useEffect(() => {
        const listener = (event: KeyboardEvent) => onKeyDown(event);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);
}

/** The command a key names, if any; Return is a focused control's own. */
export function unreadTriageCommand(key: string, onControl: boolean): UnreadTriageCommand | null {
    switch (key.toLowerCase()) {
        case 'j':
            return 'next';
        case 'k':
            return 'previous';
        case 'e':
            return 'mark-read';
        case 'r':
            return 'reply';
        case 'enter':
            return onControl ? null : 'open';
        default:
            return null;
    }
}

/** On the page itself, or inside the list — never in a field or a dialog. */
function inScope(target: Element, list: HTMLElement | null) {
    if (target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) {
        return false;
    }
    if (isEditable(target)) {
        return false;
    }
    return target === document.body || (list?.contains(target) ?? false);
}

function isEditable(target: Element) {
    return (
        (target instanceof HTMLElement && target.isContentEditable) ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
    );
}

function isControl(target: Element) {
    return target.closest('button, a[href], [role="button"], [role="link"]') !== null;
}
