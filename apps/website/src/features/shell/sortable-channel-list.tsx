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
import type { Agent, Chat } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { channelListModifiers } from './channel-drag-modifiers.ts';
import { orderChannels, readChannelOrder, writeChannelOrder } from './channel-order.ts';
import { chatNavigationName } from './chat-navigation-name.ts';
import { ChatNavigationRowContent } from './chat-navigation-row.tsx';
import {
    type KeyboardCommand,
    keyboardCommand,
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
interface KeyboardDrag {
    id: string;
    name: string;
    originalIds: string[];
}

export function SortableChannelList({
    agents,
    channels,
    onChangeChannelColor,
    selectedChatId,
    serverId,
    slug,
}: {
    agents: Map<string, Agent>;
    channels: Chat[];
    onChangeChannelColor?: (chat: Chat, color: string) => void;
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
    const orderedChannels = React.useMemo(
        () => orderChannels(channels, storedIds),
        [channels, storedIds]
    );
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
    const shouldReduceMotion = useReducedMotion() === true;
    const activeChannel = activeId
        ? (orderedChannels.find(({ id }) => id === activeId) ?? null)
        : null;
    const activeAgent = activeChannel?.peerAgentId
        ? (agents.get(activeChannel.peerAgentId) ?? null)
        : null;

    const handleDragStart = ({ active }: DragStartEvent) => {
        setActiveId(String(active.id));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveId(null);
        if (!over || active.id === over.id) {
            return;
        }
        const previousIndex = orderedChannels.findIndex(({ id }) => id === active.id);
        const nextIndex = orderedChannels.findIndex(({ id }) => id === over.id);
        if (previousIndex === -1 || nextIndex === -1) {
            return;
        }
        const nextChannels = arrayMove(orderedChannels, previousIndex, nextIndex);
        setStoredIds(nextChannels.map(({ id }) => id));
        if (storage) {
            writeChannelOrder(storage, storageKey, nextChannels);
        }
    };
    const handleKeyboardCommand = React.useCallback(
        (chat: Chat, command: KeyboardCommand) => {
            const name = chatNavigationName(chat, null);
            if (command === 'pick-up') {
                setKeyboardDrag({
                    id: chat.id,
                    name,
                    originalIds: orderedChannels.map(({ id }) => id),
                });
                setKeyboardAnnouncement(`Picked up channel ${name}.`);
                return;
            }
            if (!keyboardDrag || keyboardDrag.id !== chat.id) {
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
                    writeChannelOrder(storage, storageKey, orderedChannels);
                }
                setKeyboardDrag(null);
                setKeyboardAnnouncement(`Dropped channel ${keyboardDrag.name}.`);
                return;
            }

            const currentIndex = orderedChannels.findIndex(({ id }) => id === chat.id);
            const nextIndex = Math.max(
                0,
                Math.min(
                    orderedChannels.length - 1,
                    currentIndex + (command === 'move-down' ? 1 : -1)
                )
            );
            if (currentIndex === nextIndex) {
                return;
            }
            const nextChannels = arrayMove(orderedChannels, currentIndex, nextIndex);
            setStoredIds(nextChannels.map(({ id }) => id));
            setKeyboardAnnouncement(
                `Moved channel ${keyboardDrag.name} to position ${nextIndex + 1} of ${nextChannels.length}.`
            );
        },
        [keyboardDrag, orderedChannels, storage, storageKey]
    );

    React.useEffect(() => {
        if (!keyboardDrag) {
            return;
        }
        const chat = channels.find(({ id }) => id === keyboardDrag.id);
        if (!chat) {
            setStoredIds(keyboardDrag.originalIds);
            setKeyboardDrag(null);
            setKeyboardAnnouncement(`Cancelled reordering channel ${keyboardDrag.name}.`);
            return;
        }
        const handleActiveDragKey = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                handleKeyboardCommand(chat, 'cancel');
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
            handleKeyboardCommand(chat, command);
        };
        const cancelOnPointerDown = () => handleKeyboardCommand(chat, 'cancel');
        window.addEventListener('keydown', handleActiveDragKey, true);
        window.addEventListener('pointerdown', cancelOnPointerDown, true);
        return () => {
            window.removeEventListener('keydown', handleActiveDragKey, true);
            window.removeEventListener('pointerdown', cancelOnPointerDown, true);
        };
    }, [channels, handleKeyboardCommand, keyboardDrag]);

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
            <SortableContext
                items={orderedChannels.map(({ id }) => id)}
                strategy={verticalListSortingStrategy}
            >
                <Sidebar.Menu aria-label="Channels">
                    {orderedChannels.map((chat) => (
                        <SortableChannelRow
                            agent={chat.peerAgentId ? (agents.get(chat.peerAgentId) ?? null) : null}
                            chat={chat}
                            key={chat.id}
                            keyboardActive={keyboardDrag?.id === chat.id}
                            onChangeChannelColor={onChangeChannelColor}
                            onKeyboardCommand={handleKeyboardCommand}
                            selectedChatId={selectedChatId}
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
                {activeChannel ? (
                    <div className="sidebar__menu-item sortable-channel-overlay shadow-surface ring-1 ring-accent-foreground">
                        <div className="sidebar__menu-item-content">
                            <ChatNavigationRowContent
                                agent={activeAgent}
                                chat={activeChannel}
                                name={chatNavigationName(activeChannel, activeAgent)}
                            />
                        </div>
                    </div>
                ) : null}
            </DragOverlay>
            <span aria-live="assertive" className="sr-only">
                {keyboardAnnouncement}
            </span>
        </DndContext>
    );
}

function sortableName(item: { data: { current?: { name?: unknown } }; id: unknown }) {
    const name = item.data.current?.name;
    return typeof name === 'string' ? `channel ${name}` : `channel ${String(item.id)}`;
}
