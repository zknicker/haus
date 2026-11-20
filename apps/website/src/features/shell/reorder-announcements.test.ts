import { expect, test } from 'bun:test';
import { reorderAnnouncements } from './reorder-announcements.ts';

const item = (id: string, name: string) => ({ data: { current: { name } }, id }) as never;

test('the old sidebar announces channels, the Capy shell projects', () => {
    expect(reorderAnnouncements('channel').onDragStart?.({ active: item('a', 'eng') })).toBe(
        'Picked up channel eng.'
    );
    expect(
        reorderAnnouncements('project').onDragEnd?.({
            active: item('a', 'eng'),
            over: item('b', 'sec'),
        } as never)
    ).toBe('Dropped project eng at project sec.');
});
