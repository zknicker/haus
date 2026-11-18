import { expect, test } from 'bun:test';

import { taskMessagePlaceLabel } from './task-presentation.ts';

const channel = { chatId: 'cht_security', chatKind: 'channel', chatName: 'security' } as const;
const dm = { ...channel, chatKind: 'dm', chatName: null } as const;

test('a place names its Channel and says DM for a DM', () => {
    expect(taskMessagePlaceLabel(channel)).toBe('#security');
    expect(taskMessagePlaceLabel(dm)).toBe('DM');
});
