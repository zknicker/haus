import { expect, test } from 'bun:test';
import { taskMessagePlaceLabel } from './task-presentation.ts';

const channel = {
    chatId: 'cht_security',
    chatKind: 'channel',
    chatName: 'security',
    threadAnchorMessageId: null,
} as const;
const dm = { ...channel, chatKind: 'dm', chatName: null } as const;

test('a place names its Channel, says DM for a DM, and marks a Thread', () => {
    expect(taskMessagePlaceLabel(channel)).toBe('#security');
    expect(taskMessagePlaceLabel({ ...channel, threadAnchorMessageId: 'msg_anchor' })).toBe(
        '#security · Thread'
    );
    expect(taskMessagePlaceLabel(dm)).toBe('DM');
    expect(taskMessagePlaceLabel({ ...dm, threadAnchorMessageId: 'msg_anchor' })).toBe(
        'DM · Thread'
    );
});
