import type { EarlierThreadsScope, OpenThread, OpenThreadGroup } from '@haus/api';
import { Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useNavigate } from 'react-router-dom';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useOpenThread } from '../../hooks/threads/use-open-thread.ts';
import { useEarlierThreads, useOpenThreads } from '../../hooks/threads/use-open-threads.ts';
import { threadPageRoute } from '../../hooks/threads/use-thread-opener.ts';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { OpenThreadGlyph } from './open-thread-glyph.tsx';
import { openThreadStatusLine } from './open-thread-status.ts';

const groupTitles: Record<OpenThreadGroup, string> = {
    recent: 'Recent',
    'with-agents': 'With agents',
    'with-you': 'With you',
};

/** With you, With agents, Recent, and Earlier, each only when it has rows. */
export function ThreadsPageContent({
    filter,
    scope,
}: {
    filter: string;
    scope: EarlierThreadsScope;
}) {
    const { server } = useServerContext();
    const open = useOpenThreads(server.id);
    const earlier = useEarlierThreads(server.id, scope);
    const label = useParentLabel(server.id);
    const matches = (thread: OpenThread) => threadMatches(thread, label(thread), filter);
    const earlierRows = (earlier.data?.pages ?? []).flatMap((page) => page.threads).filter(matches);
    const groups = (['with-you', 'with-agents', 'recent'] as const).map((group) => ({
        group,
        rows: (open ?? []).filter((thread) => thread.group === group).filter(matches),
    }));

    return (
        <PageColumn className="pt-4">
            {groups.map(({ group, rows }) =>
                rows.length > 0 ? (
                    <ThreadSection
                        key={group}
                        label={label}
                        rows={rows}
                        title={groupTitles[group]}
                    />
                ) : null
            )}
            {earlierRows.length > 0 ? (
                <ThreadSection label={label} rows={earlierRows} title="Earlier" />
            ) : null}
            {earlier.hasNextPage ? (
                <Button
                    isPending={earlier.isFetchingNextPage}
                    onPress={() => earlier.fetchNextPage()}
                    size="sm"
                    variant="ghost"
                >
                    Show more
                </Button>
            ) : null}
        </PageColumn>
    );
}

function ThreadSection({
    label,
    rows,
    title,
}: {
    label: (thread: OpenThread) => string | null;
    rows: OpenThread[];
    title: string;
}) {
    const { server } = useServerContext();
    const desktopOpen = useOpenThread();
    const navigate = useNavigate();
    const openThread = (chatId: string, anchorMessageId: string) => {
        if (desktopOpen) {
            desktopOpen(chatId, anchorMessageId);
        } else {
            navigate(threadPageRoute(server.slug, chatId, anchorMessageId));
        }
    };
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {rows.map((thread) => {
                const context = label(thread);
                return (
                    <ItemCard<'button'>
                        key={thread.threadChatId}
                        render={(cardProps) => (
                            <button
                                {...cardProps}
                                {...opensPlace}
                                onClick={() =>
                                    openThread(thread.parentChatId, thread.anchorMessageId)
                                }
                                type="button"
                            />
                        )}
                        variant="transparent"
                    >
                        <ItemCard.Icon>
                            <OpenThreadGlyph state={thread.state} />
                        </ItemCard.Icon>
                        <ItemCard.Content>
                            <ItemCard.Title>{thread.title}</ItemCard.Title>
                            <ItemCard.Description>
                                {openThreadStatusLine(thread)}
                                {context ? ` · ${context}` : ''}
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                );
            })}
        </ItemCardGroup>
    );
}

function useParentLabel(serverId: string) {
    const chats = useChats(serverId).data ?? [];
    return (thread: OpenThread) => {
        const parent = chats.find((chat) => chat.id === thread.parentChatId);
        if (!parent) {
            return null;
        }
        return parent.kind === 'channel' ? `#${parent.name ?? 'channel'}` : 'DM';
    };
}

function threadMatches(thread: OpenThread, context: string | null, filter: string) {
    const needle = filter.trim().toLowerCase();
    return (
        needle.length === 0 ||
        [thread.title, context ?? '', thread.actorName ?? ''].some((value) =>
            value.toLowerCase().includes(needle)
        )
    );
}
