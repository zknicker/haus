import type { Chat, HeartbeatMark } from '@haus/api';
import type * as React from 'react';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { readGlyphKind } from './heartbeat-marks-model.ts';
import { OutcomeBubble } from './heartbeat-outcome-bubble.tsx';

/**
 * What a heartbeat or dream run came to, as a bubble from the Agent leading its
 * log row: the report (and where it was posted), the dream's learnings, or a
 * small muted one for a quiet, stopped or failed run. `fallback` is the turn's
 * own summary line.
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
    const glyph = (
        <HeartbeatGlyph isFailed={mark.outcome === 'failed'} kind={readGlyphKind(mark)} size={18} />
    );
    return (
        <div
            className="flex max-w-[70ch] flex-wrap items-center gap-x-2.5 text-sm"
            data-heartbeat-outcome={mark.outcome}
        >
            <OutcomeBody fallback={fallback} glyph={glyph} mark={mark} serverId={serverId} />
        </div>
    );
}

function OutcomeBody({
    fallback,
    glyph,
    mark,
    serverId,
}: {
    fallback: string;
    glyph: React.ReactNode;
    mark: HeartbeatMark;
    serverId: string;
}) {
    if (mark.dream) {
        const { added, followUps, removed, summaryLine } = mark.dream;
        return (
            <OutcomeBubble shape="thought" tone="dream">
                {glyph}
                <div className="grid gap-1">
                    {summaryLine ? (
                        <p>{summaryLine}</p>
                    ) : (
                        <p className="text-muted">No learnings recorded</p>
                    )}
                    <Footer>
                        {`Memory +${added} −${removed}`}
                        {followUps > 0
                            ? ` · ${followUps === 1 ? '1 follow-up' : `${followUps} follow-ups`}`
                            : ''}
                    </Footer>
                </div>
            </OutcomeBubble>
        );
    }
    if (mark.report) {
        return (
            <OutcomeBubble tone="report">
                {glyph}
                <div className="grid gap-1">
                    <p className="whitespace-pre-line">{mark.report.text}</p>
                    {mark.report.postedChatId ? (
                        <PostedIn chatId={mark.report.postedChatId} serverId={serverId} />
                    ) : null}
                </div>
            </OutcomeBubble>
        );
    }
    if (mark.outcome === 'failed') {
        return (
            <OutcomeBubble tone="danger">
                {glyph}
                <p className="text-danger">{fallback || 'Failed'}</p>
            </OutcomeBubble>
        );
    }
    if (mark.outcome === 'yielded') {
        return (
            <OutcomeBubble tone="muted">
                {glyph}
                <p>Stopped for a message to the agent</p>
            </OutcomeBubble>
        );
    }
    if (mark.outcome === 'running') {
        return (
            <OutcomeBubble compact tone="muted">
                {glyph}
                <p>Running</p>
            </OutcomeBubble>
        );
    }
    return (
        <>
            <OutcomeBubble compact tone="muted">
                {glyph}
                <p>Nothing to report</p>
            </OutcomeBubble>
            {fallback ? <span className="mt-2 text-muted text-xs">{fallback}</span> : null}
        </>
    );
}

function PostedIn({ chatId, serverId }: { chatId: string; serverId: string }) {
    const chat = useListedChat(serverId, chatId);
    return <Footer>{`Posted in ${readPlace(chat)}`}</Footer>;
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

function Footer({ children }: { children: React.ReactNode }) {
    return <p className="text-muted text-xs">{children}</p>;
}
