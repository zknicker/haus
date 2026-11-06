import type { Agent, Chat, ChatSearchResult, ServerMember } from '@haus/api';
import { Label, ListBox, Select } from '@heroui/react';
import * as React from 'react';
import type { ChatSearchFilters } from '../../../hooks/servers/use-chat-search.ts';
import { AgentOptionLabel } from '../../agents/agent-option-label.tsx';

export interface SearchFilterSelection {
    chatId: string;
    from: string;
    time: SearchTimeWindow;
}

export type SearchTimeWindow = 'any' | 'day' | 'week' | 'month';

export const defaultSearchFilterSelection: SearchFilterSelection = {
    chatId: 'all',
    from: 'all',
    time: 'any',
};

const timeLabels: Record<SearchTimeWindow, string> = {
    any: 'Any Time',
    day: 'Past Day',
    month: 'Past Month',
    week: 'Past Week',
};

// Render order is chronological, not the record's lint-sorted key order.
const timeWindows: SearchTimeWindow[] = ['any', 'day', 'week', 'month'];

const timeWindowMs: Record<Exclude<SearchTimeWindow, 'any'>, number> = {
    day: 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
};

/** Maps the picker selection to the search API's filter input. */
export function useSearchApiFilters(selection: SearchFilterSelection): ChatSearchFilters {
    // Anchored when the window changes, not per render, so the query input
    // stays stable instead of refetching on every paint.
    const after = React.useMemo(
        () =>
            selection.time === 'any'
                ? undefined
                : new Date(Date.now() - timeWindowMs[selection.time]).toISOString(),
        [selection.time]
    );

    return {
        after,
        authorAgentId: selection.from.startsWith('agent:')
            ? selection.from.slice('agent:'.length)
            : undefined,
        authorUserId: selection.from.startsWith('user:')
            ? selection.from.slice('user:'.length)
            : undefined,
        chatId: selection.chatId === 'all' ? undefined : selection.chatId,
    };
}

export function ChatSearchFilterRow({
    agents,
    chats,
    members,
    onChange,
    selection,
}: {
    agents: Agent[];
    chats: Chat[];
    members: ServerMember[];
    onChange: (selection: SearchFilterSelection) => void;
    selection: SearchFilterSelection;
}) {
    const agentOptions = agents.map((agent) => ({
        avatarUrl: agent.avatarUrl,
        id: `agent:${agent.id}`,
        name: agent.displayName,
    }));
    const memberOptions = members.map((member) => ({
        id: `user:${member.userId}`,
        name: member.displayName ?? member.handle ?? 'Member',
    }));
    const selectedAgent = agentOptions.find((agent) => agent.id === selection.from);
    const selectedMember = memberOptions.find((member) => member.id === selection.from);
    const selectedChat = chats.find((chat) => chat.id === selection.chatId);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                aria-label="Filter by author"
                onChange={(value) => onChange({ ...selection, from: String(value) })}
                value={selection.from}
                variant="secondary"
            >
                <Select.Trigger className={activeTriggerClassName(selection.from !== 'all')}>
                    <Select.Value>
                        {selectedAgent ? (
                            <AgentOptionLabel agent={selectedAgent} />
                        ) : (
                            (selectedMember?.name ?? 'From Anyone')
                        )}
                    </Select.Value>
                    <Select.Indicator
                        className={activeIndicatorClassName(selection.from !== 'all')}
                    />
                </Select.Trigger>
                <Select.Popover className="min-w-44" placement="bottom start">
                    <ListBox>
                        <ListBox.Item id="all" textValue="From Anyone">
                            <Label>From Anyone</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {agentOptions.map((agent) => (
                            <ListBox.Item id={agent.id} key={agent.id} textValue={agent.name}>
                                <Label>
                                    <AgentOptionLabel agent={agent} />
                                </Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                        {memberOptions.map((member) => (
                            <ListBox.Item id={member.id} key={member.id} textValue={member.name}>
                                <Label>{member.name}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
            <Select
                aria-label="Filter by chat"
                onChange={(value) => onChange({ ...selection, chatId: String(value) })}
                value={selection.chatId}
                variant="secondary"
            >
                <Select.Trigger className={activeTriggerClassName(selection.chatId !== 'all')}>
                    <Select.Value>
                        {selectedChat ? searchChatLabel(selectedChat) : 'All Chats'}
                    </Select.Value>
                    <Select.Indicator
                        className={activeIndicatorClassName(selection.chatId !== 'all')}
                    />
                </Select.Trigger>
                <Select.Popover className="min-w-44" placement="bottom start">
                    <ListBox>
                        <ListBox.Item id="all" textValue="All Chats">
                            <Label>All Chats</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {chats.map((chat) => (
                            <ListBox.Item
                                id={chat.id}
                                key={chat.id}
                                textValue={searchChatLabel(chat)}
                            >
                                <Label>{searchChatLabel(chat)}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
            <Select
                aria-label="Filter by time"
                onChange={(value) =>
                    onChange({ ...selection, time: String(value) as SearchTimeWindow })
                }
                value={selection.time}
                variant="secondary"
            >
                <Select.Trigger className={activeTriggerClassName(selection.time !== 'any')}>
                    <Select.Value>{timeLabels[selection.time]}</Select.Value>
                    <Select.Indicator
                        className={activeIndicatorClassName(selection.time !== 'any')}
                    />
                </Select.Trigger>
                <Select.Popover className="min-w-44" placement="bottom start">
                    <ListBox>
                        {timeWindows.map((window) => (
                            <ListBox.Item id={window} key={window} textValue={timeLabels[window]}>
                                <Label>{timeLabels[window]}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
        </div>
    );
}

// An applied filter tints its trigger with the system's selected-state pair
// (solid bg-accent read as far too loud here). The indicator needs its own
// class: stock CSS pins it to text-field-placeholder.
function activeTriggerClassName(active: boolean): string | undefined {
    return active ? 'bg-accent-soft text-accent-soft-foreground' : undefined;
}

function activeIndicatorClassName(active: boolean): string | undefined {
    return active ? 'text-accent-soft-foreground' : undefined;
}

/** The Channel or DM a result belongs to; a Thread Message reads its parent. */
export function searchResultChatId(result: ChatSearchResult): string {
    return result.thread?.parentChatId ?? result.chatId;
}

/** Where a result sits, as its row names it; null while its Chat is unknown. */
export function searchResultLabel(result: ChatSearchResult, chat: Chat | undefined): string | null {
    if (!chat) {
        return null;
    }
    if (!result.thread) {
        return searchChatLabel(chat);
    }
    return chat.kind === 'channel' ? `Thread in ${searchChatLabel(chat)}` : 'Thread in DM';
}

export function searchChatLabel(chat: Chat): string {
    if (chat.kind === 'channel') {
        return `#${chat.name ?? 'channel'}`;
    }

    return chat.peerAgentDisplayName ?? 'DM';
}
