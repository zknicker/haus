import type { Announcements } from '@dnd-kit/core';

export type ReorderNoun = 'channel' | 'project';

export function reorderAnnouncements(noun: ReorderNoun) {
    const named = (item: { data: { current?: { name?: unknown } }; id: unknown }) => {
        const name = item.data.current?.name;
        return `${noun} ${typeof name === 'string' ? name : String(item.id)}`;
    };
    return {
        onDragCancel: ({ active }) => `Cancelled reordering ${named(active)}.`,
        onDragEnd: ({ active, over }) =>
            over
                ? `Dropped ${named(active)} at ${named(over)}.`
                : `Cancelled reordering ${named(active)}.`,
        onDragOver: ({ active, over }) =>
            over ? `${named(active)} is now at ${named(over)}.` : undefined,
        onDragStart: ({ active }) => `Picked up ${named(active)}.`,
    } satisfies Announcements;
}
