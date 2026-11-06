import type { Chat, ChatSearchResult } from '@haus/api';
import { Command } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useEffect, useMemo, useState } from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useChatSearch } from '../../hooks/servers/use-chat-search.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { formatRelativeTime, truncate } from '../../lib/format.ts';
import { messageAuthor } from '../servers/chat/chat-search.tsx';
import { searchResultChatId, searchResultLabel } from '../servers/chat/chat-search-filters.tsx';
import { useCommandMenu } from './command-menu-provider.tsx';

/** The palette previews the strongest matches; the Search page owns the rest. */
const previewLimit = 5;

/**
 * Message matches for the command palette. This owns its own search read rather
 * than receiving rows, so typing re-renders only this group and the palette's
 * command list stays still.
 */
export function CommandMenuMessageResults({
    onOpenResult,
    onSeeAll,
    serverId,
}: {
    onOpenResult: (result: ChatSearchResult) => void;
    onSeeAll: (query: string) => void;
    serverId: string;
}) {
    const { close, query } = useCommandMenu();
    const settled = useSettledQuery(query);
    const search = useChatSearch(serverId, settled);
    const chats = useChats(serverId);
    const chatById = useMemo(
        () => new Map((chats.data ?? []).map((chat) => [chat.id, chat])),
        [chats.data]
    );
    const matches = (search.data ?? []).slice(0, previewLimit);

    if (settled.length === 0 || matches.length === 0) {
        return null;
    }

    const renderResult = (result: ChatSearchResult) => (
        <MessageResult
            chat={chatById.get(searchResultChatId(result))}
            key={result.id}
            onOpen={() => {
                onOpenResult(result);
                close();
            }}
            query={settled}
            result={result}
        />
    );
    const threadMatches = matches.filter((result) => result.thread);
    const chatMatches = matches.filter((result) => !result.thread);

    return (
        <>
            {threadMatches.length > 0 ? (
                <Command.Group heading="In threads">
                    {threadMatches.map(renderResult)}
                </Command.Group>
            ) : null}
            <Command.Group heading={chatMatches.length > 0 ? 'Messages' : undefined}>
                {chatMatches.map(renderResult)}
                <Command.Item
                    id="message:see-all"
                    {...opensPlace}
                    onAction={() => {
                        onSeeAll(settled);
                        close();
                    }}
                    textValue={`${settled} see all results`}
                >
                    <Icon aria-hidden="true" icon={ArrowRight01Icon} />
                    <span className="flex-1 truncate font-medium">
                        See all results for “{truncate(settled, 40)}”
                    </span>
                </Command.Item>
            </Command.Group>
        </>
    );
}

function MessageResult({
    chat,
    onOpen,
    query,
    result,
}: {
    chat: Chat | undefined;
    onOpen: () => void;
    query: string;
    result: ChatSearchResult;
}) {
    const author = messageAuthor(result);
    const label = searchResultLabel(result, chat);

    return (
        <Command.Item
            id={`message:${result.id}`}
            {...opensPlace}
            // Command.Dialog filters items by textValue against the typed value.
            // These rows already matched on the server, so the query rides along
            // to keep them past that filter.
            onAction={onOpen}
            textValue={`${query} ${author.name} ${result.content}`}
        >
            <EntityAvatar name={author.name} size={20} src={author.avatarUrl} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{truncate(result.content, 80)}</span>
                <span className="truncate text-muted text-sm">
                    {author.name}
                    {label ? ` · ${label}` : ''} · {formatRelativeTime(result.createdAt)}
                </span>
            </span>
        </Command.Item>
    );
}

/** Let keystrokes settle before hitting the server, matching the Search page. */
function useSettledQuery(query: string) {
    const [settled, setSettled] = useState(query.trim());

    useEffect(() => {
        const timer = window.setTimeout(() => setSettled(query.trim()), 200);
        return () => window.clearTimeout(timer);
    }, [query]);

    return settled;
}
