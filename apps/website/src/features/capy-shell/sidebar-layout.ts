import type { Chat, ChatUnreadPreview, Task } from '@haus/api';
import { taskUnread } from './sidebar-model.ts';

export interface OpenTaskSlot {
    chatId: string | null;
    key: string;
    taskId: string;
}

export interface CapySidebarLayout {
    agentDmChatIds: Readonly<Record<string, string>>;
    agentIds: readonly string[];
    openTasks: readonly OpenTaskSlot[];
    personChatIds: readonly string[];
    projectIds: readonly string[];
}

export type CapySidebarSection =
    | {
          agentDmChatIds: Readonly<Record<string, string>>;
          agentIds: readonly string[];
          kind: 'captains';
      }
    | { chatIds: readonly string[]; kind: 'projects' }
    | { kind: 'open-tasks'; tasks: readonly OpenTaskSlot[] }
    | { chatIds: readonly string[]; kind: 'people' };

export interface CapySidebarSources {
    agentIds: readonly string[];
    chats: readonly Chat[];
    openTasks: readonly Task[];
    unreadPreviews: readonly ChatUnreadPreview[];
    viewerUserId: string | null;
}

export function buildCapySidebar(sources: CapySidebarSources) {
    return capySidebarSections({
        agentDmChatIds: agentDmChatIds(sources.chats),
        agentIds: sources.agentIds,
        openTasks: openTaskSlots(
            sources.openTasks,
            waitingChatIds(sources.unreadPreviews, sources.viewerUserId)
        ),
        personChatIds: personChatIds(sources.chats),
        projectIds: projectIds(sources.chats),
    });
}

export function capySidebarSections(layout: CapySidebarLayout) {
    const sections: CapySidebarSection[] = [
        { agentDmChatIds: layout.agentDmChatIds, agentIds: layout.agentIds, kind: 'captains' },
        { chatIds: layout.projectIds, kind: 'projects' },
        ...(layout.openTasks.length > 0
            ? [{ kind: 'open-tasks' as const, tasks: layout.openTasks }]
            : []),
        ...(layout.personChatIds.length > 0
            ? [{ chatIds: layout.personChatIds, kind: 'people' as const }]
            : []),
    ];
    return sections;
}

export function projectIds(chats: readonly Chat[]) {
    return chats.filter((chat) => chat.kind === 'channel').map((chat) => chat.id);
}

export function personChatIds(chats: readonly Chat[]) {
    return chats
        .filter((chat) => chat.kind === 'dm' && !chat.peerAgentId && chat.peerUserId)
        .map((chat) => chat.id);
}

export function agentDmChatIds(chats: readonly Chat[]) {
    const byAgent: Record<string, string> = {};
    for (const chat of chats) {
        if (chat.kind === 'dm' && chat.peerAgentId && !(chat.peerAgentId in byAgent)) {
            byAgent[chat.peerAgentId] = chat.id;
        }
    }
    return byAgent;
}

export function waitingChatIds(
    previews: readonly ChatUnreadPreview[],
    viewerUserId: string | null
) {
    return previews
        .filter((preview) => taskUnread(preview, viewerUserId).mentionsViewer)
        .map((preview) => preview.chatId)
        .sort();
}

export function openTaskSlots(tasks: readonly Task[], waiting: readonly string[]) {
    return waitingFirst(sortedOpenTaskSlots(tasks), waiting);
}

export function sortedOpenTaskSlots(tasks: readonly Task[]) {
    return tasks
        .filter((task) => task.state === 'open')
        .sort(
            (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key)
        )
        .map((task) => ({ chatId: task.chatId, key: task.key, taskId: task.id }));
}

export function waitingFirst(slots: readonly OpenTaskSlot[], waiting: readonly string[]) {
    const isWaiting = (slot: OpenTaskSlot) => slot.chatId !== null && waiting.includes(slot.chatId);
    return [...slots.filter(isWaiting), ...slots.filter((slot) => !isWaiting(slot))];
}
