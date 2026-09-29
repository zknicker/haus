import type { MessageCause } from '@haus/api';
import { Chip } from '@heroui/react';
import { requestChatComposerMention } from '../../commands/chat-composer-mention.ts';
import { formatShortTime } from '../../lib/format.ts';
import { cn } from '../../lib/utils.ts';
import { MessageCauseMark } from './automation/message-cause-mark.tsx';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { transcriptTurnGeometry } from './chat-transcript-turn-geometry.ts';
import { MessageSessionMark } from './session/message-session-mark.tsx';
import type { SessionMark } from './session/session-mark-model.ts';

/**
 * The author's line: who spoke, when, and — for an Agent — the provenance that
 * explains how the message came to be said. Nothing else. What an Agent is
 * generally for belongs to its hover card and profile, and a task moving on
 * this message states itself on the context line below, where a reader looks
 * for what a message is about rather than who wrote it.
 */
export function TurnHeader({
    cause,
    composerId,
    deleted = false,
    displayName,
    mentionAgentId,
    onClick,
    sessionMark,
    timestamp,
}: {
    cause?: MessageCause | null;
    composerId?: string;
    deleted?: boolean;
    displayName: string;
    mentionAgentId?: string;
    onClick?: () => void;
    sessionMark?: TurnSessionMark | null;
    timestamp: string | null;
}) {
    return (
        <div className={transcriptTurnGeometry.header}>
            <TurnHeaderName
                composerId={composerId}
                deleted={deleted}
                displayName={displayName}
                mentionAgentId={mentionAgentId}
                onClick={onClick}
            />
            {deleted ? (
                <Chip size="sm" variant="secondary">
                    DELETED
                </Chip>
            ) : null}
            {/*
             * Only provenance lives here. Cause first when both apply: why the
             * Agent spoke comes before what it had already forgotten. What the
             * message *is* — a Task, delegated work — states itself
             * below the header, where its lifecycle can be followed.
             */}
            {cause ? <MessageCauseMark cause={cause} /> : null}
            {sessionMark ? (
                <MessageSessionMark
                    agentId={sessionMark.agentId}
                    generation={sessionMark.generation}
                    serverId={sessionMark.serverId}
                />
            ) : null}
            {timestamp ? (
                <time className="shrink-0 text-muted text-xs tabular-nums" dateTime={timestamp}>
                    {formatShortTime(timestamp)}
                </time>
            ) : null}
        </div>
    );
}

/**
 * The author's name, and what pressing it does. Mentioning wins over opening a
 * profile: an Agent whose name is a mention target is a name you are about to
 * type, and a name nothing can be done with is plain text rather than a
 * control that does nothing.
 */
function TurnHeaderName({
    composerId,
    deleted,
    displayName,
    mentionAgentId,
    onClick,
}: {
    composerId?: string;
    deleted: boolean;
    displayName: string;
    mentionAgentId?: string;
    onClick?: () => void;
}) {
    const className = cn(transcriptTurnGeometry.name, deleted ? 'text-muted' : 'text-foreground');
    const press =
        mentionAgentId && composerId
            ? () => requestChatComposerMention({ agentId: mentionAgentId, composerId })
            : onClick;

    if (!press) {
        return <span className={className}>{displayName}</span>;
    }

    return (
        <button
            aria-label={mentionAgentId && composerId ? `Mention ${displayName}` : undefined}
            className={cn(className, 'cursor-(--cursor-interactive) hover:underline')}
            onClick={press}
            type="button"
        >
            {displayName}
        </button>
    );
}

export function resolveMentionAgentId(
    actorId: null | string,
    actorKind: 'agent' | 'participant' | 'profile' | undefined,
    canRequestMention: boolean
) {
    return canRequestMention && actorKind === 'agent' ? (actorId ?? undefined) : undefined;
}

export function getTurnCause(items: TranscriptItem[]): MessageCause | null {
    for (const item of items) {
        if (item.kind === 'row' && item.row.kind === 'message' && item.row.message.cause) {
            return item.row.message.cause;
        }
    }

    return null;
}

export interface TurnSessionMark extends SessionMark {
    serverId: string;
}

/**
 * The turn's own restart, if the transcript-wide rule marked one of its
 * messages. A turn runs inside one session, so the first marked message in it
 * is the turn's — and without a Server to read the rotation against there is
 * nothing to hover, so the mark stays off.
 */
export function getTurnSessionMark(
    items: TranscriptItem[],
    sessionMarks: ReadonlyMap<string, SessionMark> | undefined,
    serverId: string | undefined
): TurnSessionMark | null {
    if (!(sessionMarks && serverId)) {
        return null;
    }

    for (const item of items) {
        if (item.kind !== 'row' || item.row.kind !== 'message') {
            continue;
        }

        const mark = sessionMarks.get(item.row.message.id);

        if (mark) {
            return { ...mark, serverId };
        }
    }

    return null;
}
