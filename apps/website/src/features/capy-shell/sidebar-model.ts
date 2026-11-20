import type { Agent, Chat, ChatUnreadPreview, Task } from '@haus/api';
import type { ServerMember } from '@haus/api/membership';
import { parseHausRichReferences, parseUserReferenceTarget } from '@haus/api/rich-references';
import { humanDisplayName } from '../servers/human-identity.ts';

export interface CaptainTile {
    agentId: string;
    avatarUrl: string | null;
    dmChatId: string | null;
    name: string;
    presence: CaptainPresence | null;
    unreadCount: number;
}

export type CaptainPresence = 'error' | 'paused' | 'working';

export interface ProjectRow {
    chatId: string;
    color: Chat['color'];
    icon: Chat['icon'];
    name: string;
    unreadCount: number;
}

export interface OpenTaskRow {
    chatId: string | null;
    key: string;
    waitingOnYou: boolean;
    state: Task['state'];
    taskId: string;
    title: string;
    unreadCount: number;
}

export interface PersonRow {
    avatarUrl: string | null;
    chatId: string;
    name: string;
    unreadCount: number;
}

export type CaptainSource = Pick<Agent, 'availability' | 'avatarUrl' | 'displayName' | 'id'> & {
    wakePause?: Agent['wakePause'];
};
export type MemberSource = Pick<ServerMember, 'avatarUrl' | 'displayName' | 'userId'>;
export interface TaskUnread {
    mentionsViewer: boolean;
    unreadCount: number;
}

export function captainTile(agent: CaptainSource, dm: { id: string; unreadCount: number } | null) {
    return {
        agentId: agent.id,
        avatarUrl: agent.avatarUrl,
        dmChatId: dm?.id ?? null,
        name: agent.displayName,
        presence: captainPresence(agent),
        unreadCount: dm?.unreadCount ?? 0,
    } satisfies CaptainTile;
}

function captainPresence(agent: CaptainSource) {
    if (agent.availability === 'working' || agent.availability === 'error') {
        return agent.availability;
    }
    return agent.wakePause ? ('paused' as const) : null;
}

export function agentDm(chats: readonly Chat[], agentId: string) {
    const dm = chats.find((chat) => chat.kind === 'dm' && chat.peerAgentId === agentId);
    return dm ? { id: dm.id, unreadCount: dm.unreadCount } : null;
}

export function projectRow(chat: Chat) {
    return {
        chatId: chat.id,
        color: chat.color,
        icon: chat.icon,
        name: chat.name ?? 'project',
        unreadCount: chat.unreadCount,
    } satisfies ProjectRow;
}

export function taskUnread(preview: ChatUnreadPreview | undefined, viewerUserId: string | null) {
    return {
        mentionsViewer:
            preview !== undefined && viewerUserId !== null && mentionsUser(preview, viewerUserId),
        unreadCount: preview ? preview.messages.length + preview.earlierUnreadCount : 0,
    } satisfies TaskUnread;
}

export function openTaskRow({
    task,
    unread,
}: {
    task: Pick<Task, 'chatId' | 'id' | 'key' | 'state' | 'title'>;
    unread: TaskUnread;
}) {
    return {
        chatId: task.chatId,
        key: task.key,
        waitingOnYou: unread.mentionsViewer,
        state: task.state,
        taskId: task.id,
        title: task.title,
        unreadCount: unread.unreadCount,
    } satisfies OpenTaskRow;
}

export function personRow(
    chat: Pick<Chat, 'id' | 'peerUserId' | 'unreadCount'>,
    member: MemberSource | undefined
) {
    const peerUserId = chat.peerUserId ?? '';
    return {
        avatarUrl: member?.avatarUrl ?? null,
        chatId: chat.id,
        name: humanDisplayName(member ?? { displayName: null, userId: peerUserId }),
        unreadCount: chat.unreadCount,
    } satisfies PersonRow;
}

function mentionsUser(preview: ChatUnreadPreview, userId: string) {
    return preview.messages.some((message) =>
        parseHausRichReferences(message.content).some(
            (reference) => parseUserReferenceTarget(reference.id) === userId
        )
    );
}
