import type { Agent, Chat } from '@haus/api';

/** The name a chat goes by in navigation: the channel's name, or a DM's Agent. */
export function chatNavigationName(
    chat: Pick<Chat, 'kind' | 'name' | 'peerAgentDisplayName'>,
    agent: Pick<Agent, 'displayName'> | null
): string {
    return chat.kind === 'channel'
        ? (chat.name ?? 'channel')
        : (agent?.displayName ?? chat.peerAgentDisplayName ?? 'DM');
}
