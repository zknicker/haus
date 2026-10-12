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
import { searchChatLabel } from '../servers/chat/chat-search-filters.tsx';
import { useCommandMenu } from './command-menu-provider.tsx';

/** The palette previews the strongest matches; the Search page owns the rest. */
const previewLimit = 5;

/**
 * Message matches for the command palette. This owns its own search read rather
 * than receiving rows, so typing re-renders only this group and the palette's
 * command list stays still.
 */
export function CommandMenuMessageResults({
    onOpenChat,
    onSeeAll,
    serverId,
}: {
    onOpenChat: (chatId: string) => void;
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
    const matches = search.data ?? [];

    if (settled.length === 0 || matches.length === 0) {
        return null;
    }

    return (
        <Command.Group heading="Messages">
            {matches.slice(0, previewLimit).map((message) => {
                const author = messageAuthor(message);
                const chat = chatById.get(message.chatId);
                const label = chat ? searchChatLabel(chat) : null;

                return (
                    <Command.Item
                        id={`message:${message.id}`}
                        key={message.id}
                        {...opensPlace}
                        // Command.Dialog filters items by textValue against the
                        // typed value. These rows already matched on the server,
                        // so the query rides along to keep them past that filter.
                        onAction={() => {
                            onOpenChat(message.chatId);
                            close();
                        }}
                        textValue={`${settled} ${author.name} ${message.content}`}
                    >
                        <EntityAvatar name={author.name} size={20} src={author.avatarUrl} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate font-medium">
                                {truncate(message.content, 80)}
                            </span>
                            <span className="truncate text-muted text-sm">
                                {author.name}
                                {label ? ` · ${label}` : ''} ·{' '}
                                {formatRelativeTime(message.createdAt)}
                            </span>
                        </span>
                    </Command.Item>
                );
            })}
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
