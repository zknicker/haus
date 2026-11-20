import type { Chat } from '@haus/api';

export function channelNoun(chat: Pick<Chat, 'isAll'>) {
    return chat.isAll
        ? { label: 'Channel', lower: 'channel', updated: '#all updated' }
        : { label: 'Project', lower: 'project', updated: 'Project updated' };
}
