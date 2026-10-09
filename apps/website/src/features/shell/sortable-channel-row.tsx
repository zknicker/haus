import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { useChatNavigationEntry } from '../../hooks/servers/use-chats.ts';
import { chatNavigationName } from './chat-navigation-name.ts';
import { ChatNavigationRow } from './chat-navigation-row.tsx';

export type KeyboardCommand = 'cancel' | 'drop' | 'move-down' | 'move-up' | 'pick-up';

/** The channel a keyboard command acts on, named for its announcements. */
export interface SortableChannel {
    id: string;
    name: string;
}

/**
 * Memoized like `ChatNavigationRow`, and reads its own list entry: a
 * navigation re-renders only the two rows it moves between, and a chat-list
 * update only the rows whose entry changed (or every row, when the order moves).
 */
export const SortableChannelRow = React.memo(function SortableChannelRow({
    chatId,
    isCurrent,
    keyboardActive,
    onKeyboardCommand,
    serverId,
    slug,
}: {
    chatId: string;
    isCurrent: boolean;
    keyboardActive: boolean;
    onKeyboardCommand: (channel: SortableChannel, command: KeyboardCommand) => void;
    serverId: string;
    slug: string;
}) {
    const chat = useChatNavigationEntry(serverId, chatId);
    const shouldReduceMotion = useReducedMotion() === true;
    const name = chat ? chatNavigationName(chat, null) : '';
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
        id: chatId,
        transition: shouldReduceMotion
            ? null
            : { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    });
    // The row element arrives after this component commits: React Aria renders
    // collection items in a later pass. Holding it in state binds the gestures
    // once it exists; reading a ref in an effect bound nothing until something
    // else re-rendered the row, so the first drag after a load never started.
    const [row, setRow] = React.useState<HTMLDivElement | null>(null);
    const setRowRef = React.useCallback(
        (node: HTMLDivElement | null) => {
            setRow(node);
            setNodeRef(node);
            setActivatorNodeRef(node);
        },
        [setActivatorNodeRef, setNodeRef]
    );
    const gesture = React.useRef({ chatId, keyboardActive, listeners, name, onKeyboardCommand });
    React.useLayoutEffect(() => {
        gesture.current = { chatId, keyboardActive, listeners, name, onKeyboardCommand };
    });

    React.useEffect(() => {
        if (!row) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            gesture.current.listeners?.onPointerDown?.({ nativeEvent: event });
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            const current = gesture.current;
            const command = keyboardCommand(event.key, current.keyboardActive);
            if (!command) {
                return;
            }
            event.preventDefault();
            current.onKeyboardCommand({ id: current.chatId, name: current.name }, command);
        };
        row.addEventListener('keydown', handleKeyDown);
        // Capture, so the drag sensor arms before the row's press navigation re-renders it.
        row.addEventListener('pointerdown', handlePointerDown, true);
        return () => {
            row.removeEventListener('keydown', handleKeyDown);
            row.removeEventListener('pointerdown', handlePointerDown, true);
        };
    }, [row]);

    if (!chat) {
        return null;
    }
    return (
        <ChatNavigationRow
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
