import type { Chat, ChatSearchResult } from '@haus/api';
import { Button, Chip, SearchField } from '@heroui/react';
import { EmptyState, ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatSearch } from '../../../hooks/servers/use-chat-search.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import { formatRelativeTime, truncate } from '../../../lib/format.ts';
import { PageBand } from '../../shell/page-band.tsx';
import {
    ChatSearchFilterRow,
    defaultSearchFilterSelection,
    searchResultChatId,
    searchResultLabel,
    useSearchApiFilters,
} from './chat-search-filters.tsx';
import { renderSnippet } from './chat-search-snippet.tsx';

export function ChatSearch({
    initialQuery = '',
    onOpenResult,
    serverId,
}: {
    initialQuery?: string;
    onOpenResult(result: ChatSearchResult): void;
    serverId: string;
}) {
    const [draft, setDraft] = React.useState(initialQuery);
    const [query, setQuery] = React.useState(initialQuery);
    const [filterSelection, setFilterSelection] = React.useState(defaultSearchFilterSelection);
    const apiFilters = useSearchApiFilters(filterSelection);
    const search = useChatSearch(serverId, query, apiFilters);
    const chats = useChats(serverId);
    const agents = useAgents(serverId);
    const members = useMembers(serverId);
    const matches = search.data ?? [];
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const chatById = React.useMemo(
        () => new Map((chats.data ?? []).map((chat) => [chat.id, chat])),
        [chats.data]
    );

    // Live search: let keystrokes settle briefly before hitting the server.
    React.useEffect(() => {
        const timer = window.setTimeout(() => setQuery(draft.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [draft]);

    // ⌘F while Search is already open refocuses the field for a new query.
    React.useEffect(
        () =>
            getDesktopBridge()?.onOpenSearch?.(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }),
        []
    );

    return (
        <section aria-label="Search" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Search" />
                <PageBand.Center>
                    <SearchField
                        aria-label="Search messages"
                        autoFocus
                        className="w-full max-w-96"
                        onChange={setDraft}
                        onClear={() => setQuery('')}
                        onSubmit={(value) => setQuery(value.trim())}
                        value={draft}
                    >
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search messages..." ref={inputRef} />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </PageBand.Center>
            </PageBand>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex min-h-full w-full flex-col px-6 py-6">
                    <div className="mb-4">
                        <ChatSearchFilterRow
                            agents={agents.data ?? []}
                            chats={chats.data ?? []}
                            members={members.data?.members ?? []}
                            onChange={setFilterSelection}
                            selection={filterSelection}
                        />
                    </div>
                    {query.length > 0 ? (
                        <SearchResults
                            chatById={chatById}
                            filtersActive={
                                filterSelection.from !== 'all' ||
                                filterSelection.chatId !== 'all' ||
                                filterSelection.time !== 'any'
                            }
                            matches={matches}
                            onClearFilters={() => setFilterSelection(defaultSearchFilterSelection)}
                            onOpenResult={onOpenResult}
                            query={query}
                            searching={search.isFetching}
                        />
                    ) : (
                        <SearchEmptyState
                            description="Type to find messages in channels, threads, and DMs."
                            title="Search this Server"
                        />
                    )}
                </div>
            </div>
        </section>
    );
}

function SearchResults({
    chatById,
    filtersActive,
    matches,
    onClearFilters,
    onOpenResult,
    query,
    searching,
}: {
    chatById: Map<string, Chat>;
    filtersActive: boolean;
    matches: ChatSearchResult[];
    onClearFilters(): void;
    onOpenResult(result: ChatSearchResult): void;
    query: string;
    searching: boolean;
}) {
    if (matches.length === 0) {
        return searching ? null : (
            <SearchEmptyState
                action={
                    filtersActive ? (
                        <Button onPress={onClearFilters} size="sm" variant="outline">
                            Clear Filters
                        </Button>
                    ) : undefined
                }
                description={
                    filtersActive
                        ? 'Try different keywords, or broaden the filters.'
                        : 'Try different keywords or check the spelling.'
                }
                title={`No results for “${truncate(query, 40)}”`}
            />
        );
    }

    return (
        <>
            <p className="mb-3 font-medium text-muted text-xs tabular-nums">
                {matches.length === 1 ? '1 result' : `${matches.length} results`}
            </p>
            <ul className="flex flex-col gap-2">
                {matches.map((message) => (
                    <li key={message.id}>
                        <SearchResultRow
                            chat={chatById.get(searchResultChatId(message))}
                            message={message}
                            onOpen={() => onOpenResult(message)}
                            query={query}
                        />
                    </li>
                ))}
            </ul>
        </>
    );
}

function SearchResultRow({
    chat,
    message,
    onOpen,
    query,
}: {
    chat: Chat | undefined;
    message: ChatSearchResult;
    onOpen(): void;
    query: string;
}) {
    const author = messageAuthor(message);
    // A DM's agent is already the author; repeating it as the label stutters.
    const rawLabel = searchResultLabel(message, chat);
    const label = rawLabel === author.name ? null : rawLabel;

    // Stock ItemCard rendered as a button per its Pressable pattern. Its
    // Title/Description slots are single-line truncating spans, so the
    // wrapping highlighted snippet is custom content inside ItemCard.Content.
    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            render={(props) => <button onClick={onOpen} type="button" {...props} {...opensPlace} />}
            variant="default"
        >
            <PressableFeedback.Highlight />
            <ItemCard.Content>
                <span className="flex min-w-0 items-center gap-2">
                    {label ? <span className="shrink-0 text-muted text-sm">{label}</span> : null}
                    <EntityAvatar name={author.name} size={18} src={author.avatarUrl} />
                    <span className="min-w-0 truncate font-medium text-sm">{author.name}</span>
                    <span className="shrink-0 text-muted text-xs">
                        {formatRelativeTime(message.createdAt)}
                    </span>
                    {message.chatArchivedAt ? (
                        <Chip className="ml-auto shrink-0" size="sm">
                            Archived
                        </Chip>
                    ) : null}
                </span>
                <span className="mt-1 block text-base text-foreground/90 leading-6">
                    {renderSnippet(message.content, query)}
                </span>
            </ItemCard.Content>
        </ItemCard>
    );
}

function SearchEmptyState({
    action,
    description,
    title,
}: {
    action?: React.ReactNode;
    description: string;
    title: string;
}) {
    return (
        <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon className="size-5" icon={Search01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    <EmptyState.Description className="max-w-xs text-pretty">
                        {description}
                    </EmptyState.Description>
                </EmptyState.Header>
                {action ? <EmptyState.Content>{action}</EmptyState.Content> : null}
            </EmptyState>
        </div>
    );
}

export function messageAuthor(message: ChatSearchResult): {
    avatarUrl: string | null;
    name: string;
} {
    const author = message.author;

    return {
        avatarUrl: author.profile?.avatarUrl ?? null,
        name: author.profile?.displayName ?? (author.kind === 'agent' ? 'Agent' : 'Member'),
    };
}
