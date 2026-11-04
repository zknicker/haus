import { expect, test } from 'bun:test';
import {
    claimVisibleInChat,
    readShowClaimsInChat,
    showClaimsInChatStorageKey,
} from './show-claims-in-chat.ts';

test('showing claims in chat is off until a reader asks for it', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(readShowClaimsInChat(storage)).toBe(false);

    values.set(showClaimsInChatStorageKey, 'off');
    expect(readShowClaimsInChat(storage)).toBe(false);

    values.set(showClaimsInChatStorageKey, 'on');
    expect(readShowClaimsInChat(storage)).toBe(true);
});

test('chat hides an Agent claim by default and never hides a claim a human made', () => {
    expect(claimVisibleInChat('claimed', false)).toBe(false);
    expect(claimVisibleInChat('claimed', true)).toBe(true);

    for (const showClaims of [false, true]) {
        expect(claimVisibleInChat('composed', showClaims)).toBe(true);
        expect(claimVisibleInChat('converted', showClaims)).toBe(true);
    }
});
