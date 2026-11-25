import type { ChatSearchResult } from '@haus/api';
import { SearchField } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatSearch } from '../../../hooks/servers/use-chat-search.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import { PageBand } from '../../shell/page-band.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import {
    ChatSearchFilterRow,
    defaultSearchFilterSelection,
    isSearchFiltered,
    useSearchApiFilters,
} from './chat-search-filters.tsx';
import { SearchEmptyState, SearchResults } from './chat-search-results.tsx';

export { messageAuthor } from './message-author.ts';

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
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const filtered = isSearchFiltered(filterSelection);
    const clearFilters = () => setFilterSelection(defaultSearchFilterSelection);
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
                        className="search-band-field w-full max-w-96"
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
                <PageColumn className="@container min-h-full max-w-none gap-2 px-3 pt-1">
                    {query.length > 0 || filtered ? (
                        <ChatSearchFilterRow
                            agents={agents.data ?? []}
                            chats={chats.data ?? []}
                            members={members.data?.members ?? []}
                            onChange={setFilterSelection}
                            onClear={clearFilters}
                            selection={filterSelection}
                        />
                    ) : null}
                    {query.length > 0 ? (
                        <SearchResults
                            chatById={chatById}
                            filtered={filtered}
                            matches={search.data ?? []}
                            onClearFilters={clearFilters}
                            onOpenResult={onOpenResult}
                            query={query}
                            searching={search.isFetching}
                        />
                    ) : (
                        <SearchEmptyState
                            description="Messages in Projects, Tasks, and DMs."
                            title="Search this Server"
                        />
                    )}
                </PageColumn>
            </div>
        </section>
    );
}
