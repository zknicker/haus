import type { Chat, ChatSearchResult } from '@haus/api';
import { EmptyState, ListView } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { GridListHeader, GridListSection } from 'react-aria-components';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatRelativeTime, formatTimestamp, truncate } from '../../../lib/format.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import { renderSnippet } from './chat-search-snippet.tsx';
import { messageAuthor } from './message-author.ts';

export function SearchResults({
    chatById,
    filtered,
    matches,
    onClearFilters,
    onOpenResult,
    query,
    searching,
}: {
    chatById: ReadonlyMap<string, Chat>;
    filtered: boolean;
    matches: readonly ChatSearchResult[];
    onClearFilters(): void;
    onOpenResult(result: ChatSearchResult): void;
    query: string;
    searching: boolean;
}) {
    const now = useRelativeNow(60_000);
    if (matches.length === 0) {
        return searching ? null : (
            <SearchEmptyState
                action={
                    filtered ? (
                        <Button onPress={onClearFilters} size="sm" variant="secondary">
                            Clear filters
                        </Button>
                    ) : undefined
                }
                title={`No results for “${truncate(query, 40)}”`}
            />
        );
    }

    return (
        <ListView
            aria-label="Search results"
            className="search-results"
            onAction={(key) => {
                const match = matches.find((candidate) => candidate.id === key);
                if (match) {
                    onOpenResult(match);
                }
            }}
            variant="secondary"
        >
            <GridListSection className="search-results__group" id="messages">
                <GridListHeader className="search-results__group-label">
                    Messages
                    <span className="search-results__group-count">{matches.length}</span>
                </GridListHeader>
                {matches.map((match) => (
                    <SearchResultRow
                        chat={chatById.get(match.chatId)}
                        key={match.id}
                        match={match}
                        now={now}
                        query={query}
                    />
                ))}
            </GridListSection>
        </ListView>
    );
}

function SearchResultRow({
    chat,
    match,
    now,
    query,
}: {
    chat: Chat | undefined;
    match: ChatSearchResult;
    now: number;
    query: string;
}) {
    const author = messageAuthor(match);
    const place = match.taskShortId ? `task:${match.taskShortId}` : chat ? chatPlace(chat) : null;

    return (
        <ListView.Item id={match.id} textValue={`${author.name} ${match.content}`}>
            <ListView.ItemContent>
                <EntityAvatar name={author.name} size={18} src={author.avatarUrl} />
                <span className="search-results__author">{author.name}</span>
                <ListView.Title className="search-results__snippet">
                    {renderSnippet(match.content, query)}
                </ListView.Title>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="search-results__facts">
                    {match.chatArchivedAt ? <span>Archived</span> : null}
                    {place ? <span className="search-results__place">{place}</span> : null}
                    <time
                        className="search-results__age"
                        dateTime={match.createdAt}
                        title={formatTimestamp(match.createdAt)}
                    >
                        {compactAge(match.createdAt, now)}
                    </time>
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}

export function SearchEmptyState({
    action,
    description,
    title,
}: {
    action?: React.ReactNode;
    description?: string;
    title: string;
}) {
    return (
        <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon aria-hidden="true" icon={Search01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    {description ? (
                        <EmptyState.Description>{description}</EmptyState.Description>
                    ) : null}
                </EmptyState.Header>
                {action ? <EmptyState.Content>{action}</EmptyState.Content> : null}
            </EmptyState>
        </div>
    );
}

function compactAge(createdAt: string, now: number) {
    const age = formatRelativeTime(createdAt, now);
    return age === 'just now' ? 'now' : age.replace(/ ago$/u, '');
}
