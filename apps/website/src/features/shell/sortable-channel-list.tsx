import {
    type Announcements,
    closestCenter,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Sidebar } from '@heroui-pro/react';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { useChatNavigationEntry } from '../../hooks/servers/use-chats.ts';
import { channelListModifiers } from './channel-drag-modifiers.ts';
import { orderChannelIds, readChannelOrder, writeChannelOrder } from './channel-order.ts';
import { chatNavigationName } from './chat-navigation-name.ts';
import { ChatNavigationRowContent } from './chat-navigation-row.tsx';
import {
    type KeyboardCommand,
    keyboardCommand,
    type SortableChannel,
    SortableChannelRow,
} from './sortable-channel-row.tsx';
import './sortable-channel-list.css';

const screenReaderInstructions = {
    draggable:
        'To reorder a focused channel, press space. Use the arrow keys to move it, then press space to drop. Press escape to cancel.',
};
const announcements: Announcements = {
    onDragCancel: ({ active }) => `Cancelled reordering ${sortableName(active)}.`,
    onDragEnd: ({ active, over }) =>
        over
            ? `Dropped ${sortableName(active)} at ${sortableName(over)}.`
            : `Cancelled reordering ${sortableName(active)}.`,
    onDragOver: ({ active, over }) =>
        over ? `${sortableName(active)} is now at ${sortableName(over)}.` : undefined,
    onDragStart: ({ active }) => `Picked up ${sortableName(active)}.`,
};
// Module-level: dnd-kit memoizes the sensor on this object, and a new one per render
// re-renders every sortable row through its context.
const pointerSensorOptions = { activationConstraint: { distance: 3 } };
interface KeyboardDrag extends SortableChannel {
    originalIds: string[];
}

/**
 * The Channels menu in the user's order. Memoized on the channel ids, which
 * keep their identity until a channel joins, leaves, or moves; rows read their
 * own entries.
 */
export const SortableChannelList = React.memo(function SortableChannelList({
    channelIds,
    selectedChatId,
    serverId,
    slug,
}: {
    channelIds: readonly string[];
    selectedChatId: string | undefined;
    serverId: string;
    slug: string;
}) {
    const storageKey = `haus.sidebar.channels.${serverId}`;
    const storage = globalThis.window?.localStorage;
    const [storedIds, setStoredIds] = React.useState(() =>
        storage ? readChannelOrder(storage, storageKey) : []
    );
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [keyboardDrag, setKeyboardDrag] = React.useState<KeyboardDrag | null>(null);
    const [keyboardAnnouncement, setKeyboardAnnouncement] = React.useState('');
    // SortableContext keys its context on this array's identity: a new array
    // re-renders every row.
    const orderedIds = React.useMemo(
        () => orderChannelIds(channelIds, storedIds),
        [channelIds, storedIds]
    );
    const sensors = useSensors(useSensor(PointerSensor, pointerSensorOptions));
    const shouldReduceMotion = useReducedMotion() === true;

    const handleDragStart = ({ active }: DragStartEvent) => {
        setActiveId(String(active.id));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveId(null);
        if (!over || active.id === over.id) {
            return;
        }
        const previousIndex = orderedIds.indexOf(String(active.id));
        const nextIndex = orderedIds.indexOf(String(over.id));
        if (previousIndex === -1 || nextIndex === -1) {
            return;
        }
        const nextIds = arrayMove(orderedIds, previousIndex, nextIndex);
        setStoredIds(nextIds);
        if (storage) {
            writeChannelOrder(storage, storageKey, nextIds);
        }
    };
    const runKeyboardCommand = (channel: SortableChannel, command: KeyboardCommand) => {
        if (command === 'pick-up') {
            setKeyboardDrag({ ...channel, originalIds: orderedIds });
            setKeyboardAnnouncement(`Picked up channel ${channel.name}.`);
            return;
        }
        if (!keyboardDrag || keyboardDrag.id !== channel.id) {
            return;
        }
        if (command === 'cancel') {
            setStoredIds(keyboardDrag.originalIds);
            setKeyboardDrag(null);
            setKeyboardAnnouncement(`Cancelled reordering channel ${keyboardDrag.name}.`);
            return;
        }
        if (command === 'drop') {
            if (storage) {
                writeChannelOrder(storage, storageKey, orderedIds);
            }
            setKeyboardDrag(null);
            setKeyboardAnnouncement(`Dropped channel ${keyboardDrag.name}.`);
            return;
        }

        const currentIndex = orderedIds.indexOf(channel.id);
        const nextIndex = Math.max(
            0,
            Math.min(orderedIds.length - 1, currentIndex + (command === 'move-down' ? 1 : -1))
        );
        if (currentIndex === nextIndex) {
            return;
        }
        const nextIds = arrayMove(orderedIds, currentIndex, nextIndex);
        setStoredIds(nextIds);
        setKeyboardAnnouncement(
            `Moved channel ${keyboardDrag.name} to position ${nextIndex + 1} of ${nextIds.length}.`
        );
    };
    // Rows take one stable command function, so a keyboard drag or a reorder
    // does not re-render every row through its props.
    const latestCommand = React.useRef(runKeyboardCommand);
    React.useLayoutEffect(() => {
        latestCommand.current = runKeyboardCommand;
    });
    const handleKeyboardCommand = React.useCallback(
        (channel: SortableChannel, command: KeyboardCommand) =>
            latestCommand.current(channel, command),
        []
    );

    React.useEffect(() => {
        if (!keyboardDrag) {
            return;
        }
        if (!channelIds.includes(keyboardDrag.id)) {
            setStoredIds(keyboardDrag.originalIds);
            setKeyboardDrag(null);
            setKeyboardAnnouncement(`Cancelled reordering channel ${keyboardDrag.name}.`);
            return;
        }
        const handleActiveDragKey = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                handleKeyboardCommand(keyboardDrag, 'cancel');
                return;
            }
            const command = keyboardCommand(event.key, true);
            if (!command) {
                return;
            }
            // HeroUI's Tree captures arrows for row focus. While its nested
            // handle is picked up, the reorder interaction owns those keys.
            event.preventDefault();
            event.stopImmediatePropagation();
            handleKeyboardCommand(keyboardDrag, command);
        };
        const cancelOnPointerDown = () => handleKeyboardCommand(keyboardDrag, 'cancel');
        window.addEventListener('keydown', handleActiveDragKey, true);
        window.addEventListener('pointerdown', cancelOnPointerDown, true);
        return () => {
            window.removeEventListener('keydown', handleActiveDragKey, true);
            window.removeEventListener('pointerdown', cancelOnPointerDown, true);
        };
    }, [channelIds, handleKeyboardCommand, keyboardDrag]);

    return (
        <DndContext
            accessibility={{ announcements, screenReaderInstructions }}
            collisionDetection={closestCenter}
            modifiers={channelListModifiers}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
        >
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                <Sidebar.Menu aria-label="Channels">
                    {orderedIds.map((chatId) => (
                        <SortableChannelRow
                            chatId={chatId}
                            isCurrent={chatId === selectedChatId}
                            key={chatId}
                            keyboardActive={keyboardDrag?.id === chatId}
                            onKeyboardCommand={handleKeyboardCommand}
                            serverId={serverId}
                            slug={slug}
                        />
                    ))}
                </Sidebar.Menu>
            </SortableContext>
            <DragOverlay
                dropAnimation={
                    shouldReduceMotion
                        ? null
                        : { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
                }
                modifiers={channelListModifiers}
            >
                {activeId ? <DraggedChannel chatId={activeId} serverId={serverId} /> : null}
            </DragOverlay>
            <span aria-live="assertive" className="sr-only">
                {keyboardAnnouncement}
            </span>
        </DndContext>
    );
});

function DraggedChannel({ chatId, serverId }: { chatId: string; serverId: string }) {
    const chat = useChatNavigationEntry(serverId, chatId);
    if (!chat) {
        return null;
    }
    return (
        <div className="sidebar__menu-item sortable-channel-overlay shadow-surface ring-1 ring-accent-foreground">
            <div className="sidebar__menu-item-content">
                <ChatNavigationRowContent chat={chat} name={chatNavigationName(chat, null)} />
            </div>
        </div>
    );
}

function sortableName(item: { data: { current?: { name?: unknown } }; id: unknown }) {
    const name = item.data.current?.name;
    return typeof name === 'string' ? `channel ${name}` : `channel ${String(item.id)}`;
}
