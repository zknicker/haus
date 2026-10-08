import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Agent, Chat } from '@haus/api';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { chatNavigationName } from './chat-navigation-name.ts';
import { ChatNavigationRow } from './chat-navigation-row.tsx';

export type KeyboardCommand = 'cancel' | 'drop' | 'move-down' | 'move-up' | 'pick-up';

/** Memoized like `ChatNavigationRow`: a navigation re-renders only the two rows it moves between. */
export const SortableChannelRow = React.memo(function SortableChannelRow({
    agent,
    chat,
    isCurrent,
    keyboardActive,
    onKeyboardCommand,
    slug,
}: {
    agent: Agent | null;
    chat: Chat;
    isCurrent: boolean;
    keyboardActive: boolean;
    onKeyboardCommand: (chat: Chat, command: KeyboardCommand) => void;
    slug: string;
}) {
    const shouldReduceMotion = useReducedMotion() === true;
    const name = chatNavigationName(chat, agent);
    const {
        attributes,
        isDragging,
        listeners,
        setActivatorNodeRef,
        setNodeRef,
        transform,
        transition,
    } = useSortable({
        animateLayoutChanges: () => !shouldReduceMotion,
        data: { name },
        id: chat.id,
        transition: shouldReduceMotion
            ? null
            : { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    });
    const rowRef = React.useRef<HTMLDivElement | null>(null);
    const setRowRef = React.useCallback(
        (node: HTMLDivElement | null) => {
            rowRef.current = node;
            setNodeRef(node);
            setActivatorNodeRef(node);
        },
        [setActivatorNodeRef, setNodeRef]
    );

    React.useEffect(() => {
        const row = rowRef.current;
        const activatePointerDrag = listeners?.onPointerDown;
        if (!(row && activatePointerDrag)) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            activatePointerDrag({ nativeEvent: event });
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            const command = keyboardCommand(event.key, keyboardActive);
            if (!command) {
                return;
            }
            event.preventDefault();
            onKeyboardCommand(chat, command);
        };
        row.addEventListener('keydown', handleKeyDown);
        // Capture, so the drag sensor arms before the row's press navigation re-renders it;
        // that render can rebind this listener mid-dispatch and drop the drag.
        row.addEventListener('pointerdown', handlePointerDown, true);
        return () => {
            row.removeEventListener('keydown', handleKeyDown);
            row.removeEventListener('pointerdown', handlePointerDown, true);
        };
    }, [chat, keyboardActive, listeners, onKeyboardCommand]);

    return (
        <ChatNavigationRow
            agent={agent}
            ariaDescribedBy={attributes['aria-describedby']}
            chat={chat}
            className="no-drag sortable-channel-row"
            isCurrent={isCurrent}
            name={name}
            ref={setRowRef}
            slug={slug}
            style={{
                opacity: isDragging ? 0 : undefined,
                transform: isDragging ? undefined : CSS.Transform.toString(transform),
                transition,
            }}
        />
    );
});

export function keyboardCommand(key: string, active: boolean): KeyboardCommand | null {
    if (key === ' ') {
        return active ? 'drop' : 'pick-up';
    }
    if (!active) {
        return null;
    }
    if (key === 'ArrowDown') {
        return 'move-down';
    }
    if (key === 'ArrowUp') {
        return 'move-up';
    }
    return key === 'Escape' ? 'cancel' : null;
}
