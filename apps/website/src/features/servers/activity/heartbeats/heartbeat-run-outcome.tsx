import type { Chat, HeartbeatMark } from '@haus/api';
import type * as React from 'react';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';

/**
 * What a heartbeat or dream run came to, as the lead of its log row: the
 * report (and where it was posted), the dream's learnings, or a muted line for
 * a quiet, stopped or failed run. `fallback` is the turn's own summary line.
 */
export function HeartbeatRunOutcome({
    fallback,
    mark,
    serverId,
}: {
    fallback: string;
    mark: HeartbeatMark | undefined;
    serverId: string;
}) {
    if (!mark) {
        return null;
    }
    return (
        <div className="grid max-w-[70ch] gap-0.5 text-sm" data-heartbeat-outcome={mark.outcome}>
            <OutcomeBody fallback={fallback} mark={mark} serverId={serverId} />
        </div>
    );
}

function OutcomeBody({
    fallback,
    mark,
    serverId,
}: {
    fallback: string;
    mark: HeartbeatMark;
    serverId: string;
}) {
    if (mark.dream) {
        const { added, followUps, removed, summaryLine } = mark.dream;
        return (
            <>
                {summaryLine ? <p>{summaryLine}</p> : <Muted>No learnings recorded</Muted>}
                <Muted>
                    {`Memory +${added} −${removed}`}
                    {followUps > 0
                        ? ` · ${followUps === 1 ? '1 follow-up' : `${followUps} follow-ups`}`
                        : ''}
                </Muted>
            </>
        );
    }
    if (mark.report) {
        return (
            <>
                <p className="whitespace-pre-line">{mark.report.text}</p>
                {mark.report.postedChatId ? (
                    <PostedIn chatId={mark.report.postedChatId} serverId={serverId} />
                ) : null}
            </>
        );
    }
    if (mark.outcome === 'failed') {
        return <p className="text-danger">{fallback || 'Failed'}</p>;
    }
    if (mark.outcome === 'yielded') {
        return <Muted>Stopped for a message to the agent</Muted>;
    }
    if (mark.outcome === 'running') {
        return <Muted>Running</Muted>;
    }
    return <Muted>{fallback ? `Nothing to report · ${fallback}` : 'Nothing to report'}</Muted>;
}

function PostedIn({ chatId, serverId }: { chatId: string; serverId: string }) {
    const chat = useListedChat(serverId, chatId);
    return <Muted>{`Posted in ${readPlace(chat)}`}</Muted>;
}

/** DMs read "DM", never the peer's name; a channel reads "#name". */
function readPlace(chat: Chat | undefined): string {
    if (!chat) {
        return 'a chat';
    }
    if (chat.kind === 'dm') {
        return 'a DM';
    }
    return chat.name ? `#${chat.name}` : 'a channel';
}

function Muted({ children }: { children: React.ReactNode }) {
    return <p className="text-muted">{children}</p>;
}
