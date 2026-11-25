import type { Agent, Chat, ServerMember } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Button, Label, ListBox, Toolbar } from '@heroui/react';
import * as React from 'react';
import type { ChatSearchFilters } from '../../../hooks/servers/use-chat-search.ts';
import { cn } from '../../../lib/utils.ts';
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

export function isSearchFiltered(selection: SearchFilterSelection) {
    return selection.from !== 'all' || selection.chatId !== 'all' || selection.time !== 'any';
}

const timeLabels: Record<SearchTimeWindow, string> = {
    any: 'Any',
    day: 'Past day',
    month: 'Past month',
    week: 'Past week',
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

/**
 * The Tasks list's filter bar shape: quiet inline selects that read
 * `From Anyone`, `Chat Any`, `Time Any`, with the unset value muted.
 */
export function ChatSearchFilterRow({
    agents,
    chats,
    members,
    onChange,
    onClear,
    selection,
}: {
    agents: Agent[];
    chats: Chat[];
    members: ServerMember[];
    onChange: (selection: SearchFilterSelection) => void;
    onClear: () => void;
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
        <Toolbar
            aria-label="Search filters"
            className="search-filters flex flex-wrap items-center gap-4"
        >
            <SearchFilterSelect
                isSet={selection.from !== 'all'}
                label="From"
                onChange={(from) => onChange({ ...selection, from })}
                selected={
                    selectedAgent ? (
                        <AgentOptionLabel agent={selectedAgent} />
                    ) : (
                        (selectedMember?.name ?? 'Anyone')
                    )
                }
                value={selection.from}
            >
                <ListBox.Item id="all" textValue="Anyone">
                    <Label>Anyone</Label>
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
            </SearchFilterSelect>
            <SearchFilterSelect
                isSet={selection.chatId !== 'all'}
                label="Chat"
                onChange={(chatId) => onChange({ ...selection, chatId })}
                selected={selectedChat ? searchChatLabel(selectedChat) : 'Any'}
                value={selection.chatId}
            >
                <ListBox.Item id="all" textValue="Any">
                    <Label>Any</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
                {chats.map((chat) => (
                    <ListBox.Item id={chat.id} key={chat.id} textValue={searchChatLabel(chat)}>
                        <Label>{searchChatLabel(chat)}</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </SearchFilterSelect>
            <SearchFilterSelect
                isSet={selection.time !== 'any'}
                label="Time"
                onChange={(time) => onChange({ ...selection, time: time as SearchTimeWindow })}
                selected={timeLabels[selection.time]}
                value={selection.time}
            >
                {timeWindows.map((window) => (
                    <ListBox.Item id={window} key={window} textValue={timeLabels[window]}>
                        <Label>{timeLabels[window]}</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </SearchFilterSelect>
            {isSearchFiltered(selection) ? (
                <Button onPress={onClear} size="sm" variant="ghost">
                    Clear filters
                </Button>
            ) : null}
        </Toolbar>
    );
}

function SearchFilterSelect({
    children,
    isSet,
    label,
    onChange,
    selected,
    value,
}: {
    children: React.ReactNode;
    isSet: boolean;
    label: string;
    onChange: (next: string) => void;
    selected: React.ReactNode;
    value: string;
}) {
    return (
        <InlineSelect
            aria-label={`Filter by ${label.toLowerCase()}`}
            onChange={(next) => {
                if (next !== null) {
                    onChange(String(next));
                }
            }}
            value={value}
        >
            <InlineSelect.Trigger className="gap-1">
                <span className="text-muted text-sm">{label}</span>
                <span className={cn('min-w-0 truncate text-sm', !isSet && 'text-muted')}>
                    {selected}
                </span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ListBox>{children}</ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

/** Where a result sits, as its row names it; null while its Chat is unknown. */
export function searchResultLabel(chat: Chat | undefined): string | null {
    return chat ? searchChatLabel(chat) : null;
}

export function searchChatLabel(chat: Chat): string {
    if (chat.kind === 'channel') {
        return `#${chat.name ?? 'channel'}`;
    }

    return chat.peerAgentDisplayName ?? 'DM';
}
