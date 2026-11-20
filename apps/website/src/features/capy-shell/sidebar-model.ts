import type { Agent, Chat, ChatUnreadPreview, Task } from '@haus/api';
import type { ServerMember } from '@haus/api/membership';
import { parseHausRichReferences, parseUserReferenceTarget } from '@haus/api/rich-references';
import { humanDisplayName } from '../servers/human-identity.ts';
import { previewTaskWorkers, type Sourced, type TaskWorkers } from './placeholders.ts';

export interface CaptainTile {
    agentId: string;
    avatarUrl: string | null;
    dmChatId: string | null;
    name: string;
    unreadCount: number;
    working: boolean;
}

export interface ProjectRow {
    chatId: string;
    color: Chat['color'];
    icon: Chat['icon'];
    name: string;
    unreadCount: number;
}

export type OpenTaskLine =
    | { kind: 'waiting'; on: string }
    | { assignee: string | null; kind: 'progress'; workers: Sourced<TaskWorkers> };

export interface OpenTaskRow {
    chatId: string | null;
    key: string;
    line: OpenTaskLine;
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

export type CaptainSource = Pick<Agent, 'availability' | 'avatarUrl' | 'displayName' | 'id'>;
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
        unreadCount: dm?.unreadCount ?? 0,
        working: agent.availability === 'working',
    } satisfies CaptainTile;
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
    assignee,
    task,
    unread,
    viewerName,
}: {
    assignee: string | null;
    task: Pick<Task, 'chatId' | 'id' | 'key' | 'state' | 'title'>;
    unread: TaskUnread;
    viewerName: string;
}) {
    const line: OpenTaskLine = unread.mentionsViewer
        ? { kind: 'waiting', on: viewerName }
        : { assignee, kind: 'progress', workers: previewTaskWorkers(task.id) };
    return {
        chatId: task.chatId,
        key: task.key,
        line,
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

export function assigneeName(
    assignee: Task['assignee'],
    agents: readonly CaptainSource[],
    members: readonly MemberSource[]
) {
    if (assignee?.kind === 'agent') {
        return agents.find((agent) => agent.id === assignee.agentId)?.displayName ?? null;
    }
    if (assignee?.kind === 'user') {
        const member = members.find((entry) => entry.userId === assignee.userId);
        return member ? humanDisplayName(member) : null;
    }
    return null;
}

export function viewerName(members: readonly MemberSource[], viewerUserId: string | null) {
    const viewer = members.find((member) => member.userId === viewerUserId);
    return viewer ? humanDisplayName(viewer) : 'you';
}

export function progressLineParts(line: Extract<OpenTaskLine, { kind: 'progress' }>) {
    const { count, places } = line.workers.value;
    return [
        line.assignee,
        count > 0 ? `${count} ${count === 1 ? 'worker' : 'workers'}` : null,
        places.length > 0 ? places.join(', ') : null,
    ].filter((part): part is string => part !== null);
}

function mentionsUser(preview: ChatUnreadPreview, userId: string) {
    return preview.messages.some((message) =>
        parseHausRichReferences(message.content).some(
            (reference) => parseUserReferenceTarget(reference.id) === userId
        )
    );
}
