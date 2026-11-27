import type { Chat } from '@haus/api';
import type { TabPage } from './tab-identity.ts';

export function findTabPageChat<C extends Pick<Chat, 'id' | 'kind' | 'peerAgentId'>>(
    chats: readonly C[],
    page: TabPage | null
) {
    switch (page?.kind) {
        case 'chat':
            return chats.find((chat) => chat.id === page.chatId) ?? null;
        case 'captain':
            return (
                chats.find(
                    (chat) => chat.kind === 'captain' && chat.peerAgentId === page.agentId
                ) ?? null
            );
        default:
            return null;
    }
}
