import type { Agent, Chat, ChatUnreadPreview, Task } from '@haus/api';
import type { ServerMember } from '@haus/api/membership';
import { parseHausRichReferences, parseUserReferenceTarget } from '@haus/api/rich-references';
import { humanDisplayName } from '../servers/human-identity.ts';
import { orderChannelIds } from '../shell/channel-order.ts';
import { live, previewTaskWorkers, type Sourced, type TaskWorkers } from './placeholders.ts';

export interface CaptainTile {
    agentId: string;
    avatarUrl: string | null;
    dmChatId: string | null;
    name: string;
    unreadCount: number;
    working: boolean;
}

export interface ProjectRow {
    captainIds: Sourced<readonly string[]>;
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

export type CapySidebarSection =
    | { kind: 'captains'; tiles: readonly CaptainTile[] }
    | { kind: 'projects'; rows: readonly ProjectRow[] }
    | { kind: 'open-tasks'; rows: readonly OpenTaskRow[] }
    | { kind: 'people'; rows: readonly PersonRow[] };

export interface CapySidebarSources {
    agents: readonly Pick<Agent, 'availability' | 'avatarUrl' | 'displayName' | 'id'>[];
    chats: readonly Chat[];
    channelOrder: readonly string[];
    members: readonly Pick<ServerMember, 'avatarUrl' | 'displayName' | 'userId'>[];
    openTasks: readonly Task[];
    unreadPreviews: readonly ChatUnreadPreview[];
    viewerUserId: string | null;
}

export function buildCapySidebar(sources: CapySidebarSources) {
    const openTasks = openTaskRows(sources);
    const people = personRows(sources);
    const sections: CapySidebarSection[] = [
        { kind: 'captains', tiles: captainTiles(sources) },
        { kind: 'projects', rows: projectRows(sources) },
        ...(openTasks.length > 0 ? [{ kind: 'open-tasks' as const, rows: openTasks }] : []),
        ...(people.length > 0 ? [{ kind: 'people' as const, rows: people }] : []),
    ];
    return sections;
}

export function captainTiles({ agents, chats }: CapySidebarSources) {
    return agents.map((agent) => {
        const dm = chats.find((chat) => chat.kind === 'dm' && chat.peerAgentId === agent.id);
        return {
            agentId: agent.id,
            avatarUrl: agent.avatarUrl,
            dmChatId: dm?.id ?? null,
            name: agent.displayName,
            unreadCount: dm?.unreadCount ?? 0,
            working: agent.availability === 'working',
        } satisfies CaptainTile;
    });
}

export function projectRows({ channelOrder, chats }: CapySidebarSources) {
    const channels = new Map(
        chats.filter((chat) => chat.kind === 'channel').map((chat) => [chat.id, chat])
    );
    return orderChannelIds([...channels.keys()], channelOrder).flatMap((chatId) => {
        const chat = channels.get(chatId);
        return chat
            ? [
                  {
                      captainIds: live<readonly string[]>(chat.participantAgentIds),
                      chatId,
                      color: chat.color,
                      icon: chat.icon,
                      name: chat.name ?? 'project',
                      unreadCount: chat.unreadCount,
                  } satisfies ProjectRow,
              ]
            : [];
    });
}

export function openTaskRows(sources: CapySidebarSources) {
    const viewerName = viewerDisplayName(sources);
    const rows = sources.openTasks
        .filter((task) => task.state === 'open')
        .sort(
            (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key)
        )
        .map((task) => {
            const preview = task.chatId
                ? sources.unreadPreviews.find((entry) => entry.chatId === task.chatId)
                : undefined;
            const waiting =
                preview !== undefined &&
                sources.viewerUserId !== null &&
                mentionsUser(preview, sources.viewerUserId);
            return {
                chatId: task.chatId,
                key: task.key,
                line: waiting
                    ? { kind: 'waiting' as const, on: viewerName }
                    : {
                          assignee: assigneeName(task, sources),
                          kind: 'progress' as const,
                          workers: previewTaskWorkers(task.id),
                      },
                state: task.state,
                taskId: task.id,
                title: task.title,
                unreadCount: preview ? preview.messages.length + preview.earlierUnreadCount : 0,
            } satisfies OpenTaskRow;
        });
    return [
        ...rows.filter((row) => row.line.kind === 'waiting'),
        ...rows.filter((row) => row.line.kind !== 'waiting'),
    ];
}

export function personRows({ chats, members }: CapySidebarSources) {
    return chats.flatMap((chat) => {
        const peerUserId = chat.kind === 'dm' && !chat.peerAgentId ? chat.peerUserId : null;
        if (!peerUserId) {
            return [];
        }
        const member = members.find((entry) => entry.userId === peerUserId);
        return [
            {
                avatarUrl: member?.avatarUrl ?? null,
                chatId: chat.id,
                name: humanDisplayName(member ?? { displayName: null, userId: peerUserId }),
                unreadCount: chat.unreadCount,
            } satisfies PersonRow,
        ];
    });
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

function assigneeName(task: Task, { agents, members }: CapySidebarSources) {
    const { assignee } = task;
    if (assignee?.kind === 'agent') {
        return agents.find((agent) => agent.id === assignee.agentId)?.displayName ?? null;
    }
    if (assignee?.kind === 'user') {
        const member = members.find((entry) => entry.userId === assignee.userId);
        return member ? humanDisplayName(member) : null;
    }
    return null;
}

function viewerDisplayName({ members, viewerUserId }: CapySidebarSources) {
    const viewer = members.find((member) => member.userId === viewerUserId);
    return viewer ? humanDisplayName(viewer) : 'you';
}
