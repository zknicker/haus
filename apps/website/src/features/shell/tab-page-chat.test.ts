import { expect, test } from 'bun:test';
import { findTabPageChat } from './tab-page-chat.ts';

const chats = [
    { id: 'cht_all', kind: 'channel', peerAgentId: null },
    { id: 'cht_orbit', kind: 'captain', peerAgentId: 'agt_orbit' },
] as const;

test('a Captain tab resolves its Captain chat, so its chat actions have a chat', () => {
    expect(findTabPageChat(chats, { agentId: 'agt_orbit', kind: 'captain' })?.id).toBe('cht_orbit');
    expect(findTabPageChat(chats, { chatId: 'cht_all', kind: 'chat' })?.id).toBe('cht_all');
    expect(findTabPageChat(chats, { agentId: 'agt_gone', kind: 'captain' })).toBeNull();
    expect(findTabPageChat(chats, { kind: 'home' })).toBeNull();
});
