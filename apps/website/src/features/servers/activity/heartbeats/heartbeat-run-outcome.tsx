import type { Chat, HeartbeatMark } from '@haus/api';
import type * as React from 'react';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';
import { readRunCost, readSummaryLines } from './heartbeat-feed-model.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { readGlyphKind } from './heartbeat-marks-model.ts';
import { OutcomeBubble } from './heartbeat-outcome-bubble.tsx';

/**
 * What a heartbeat or dream run came to, as a bubble from the Agent leading its
 * post: the report with where it was posted, the dream's learnings, or a note
 * for a failed or stopped run. The footer is quiet: where it went, what it
 * changed, what it cost.
 */
export function HeartbeatRunOutcome({ mark, serverId }: { mark: HeartbeatMark; serverId: string }) {
    const chatId = mark.report?.postedChatId ?? null;
    const chat = useListedChat(serverId, chatId ?? '', chatId !== null);
    const glyph = (
        <HeartbeatGlyph isFailed={mark.outcome === 'failed'} kind={readGlyphKind(mark)} size={18} />
    );
    const cost = readRunCost(mark);
    return (
        <div className="max-w-[70ch] text-sm" data-heartbeat-outcome={mark.outcome}>
            <OutcomeBody chat={chat} cost={cost} glyph={glyph} mark={mark} />
        </div>
    );
}

function OutcomeBody({
    chat,
    cost,
    glyph,
    mark,
}: {
    chat: Chat | undefined;
    cost: string;
    glyph: React.ReactNode;
    mark: HeartbeatMark;
}) {
    if (mark.outcome === 'failed') {
        return (
            <OutcomeBubble tone="danger">
                {glyph}
                <div className="grid gap-1">
                    <p className="text-danger">The run failed before it finished</p>
                    <Footer>{cost}</Footer>
                </div>
            </OutcomeBubble>
        );
    }
    if (mark.dream) {
        return <DreamBody cost={cost} dream={mark.dream} glyph={glyph} />;
    }
    if (mark.report) {
        const place = mark.report.postedChatId
            ? `Posted in ${readPlace(chat)}`
            : 'Read, nothing posted';
        return (
            <OutcomeBubble tone="report">
                {glyph}
                <div className="grid gap-1">
                    <p className="whitespace-pre-line">{mark.report.text}</p>
                    <Footer>{[place, cost].filter(Boolean).join(' · ')}</Footer>
                </div>
            </OutcomeBubble>
        );
    }
    return (
        <OutcomeBubble tone="muted">
            {glyph}
            <div className="grid gap-1">
                <p>Stopped for a message to the agent</p>
                <Footer>{cost}</Footer>
            </div>
        </OutcomeBubble>
    );
}

function DreamBody({
    cost,
    dream,
    glyph,
}: {
    cost: string;
    dream: NonNullable<HeartbeatMark['dream']>;
    glyph: React.ReactNode;
}) {
    const lines = readSummaryLines(dream.summary);
    const followUps = readFollowUpCount(dream.followUps);
    return (
        <OutcomeBubble shape="thought" tone="dream">
            {glyph}
            <div className="grid min-w-0 gap-1.5">
                {lines.length > 1 ? (
                    <ul className="grid list-disc gap-1 ps-4 marker:text-muted">
                        {lines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                ) : (
                    <p className={lines.length === 0 ? 'text-muted' : undefined}>
                        {lines[0] ?? 'No learnings recorded'}
                    </p>
                )}
                <Footer>
                    {[`Memory +${dream.added} −${dream.removed}`, followUps, cost]
                        .filter(Boolean)
                        .join(' · ')}
                </Footer>
                {dream.followUpTitles.length > 0 ? (
                    <ul className="grid list-disc gap-0.5 ps-4 text-muted text-xs">
                        {dream.followUpTitles.map((title, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat; the list never reorders
                            <li key={`${index}:${title}`}>{title}</li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </OutcomeBubble>
    );
}

function readFollowUpCount(count: number): string | null {
    if (count === 0) {
        return null;
    }
    return count === 1 ? '1 follow-up' : `${count} follow-ups`;
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
    return children ? <p className="text-muted text-xs">{children}</p> : null;
}
