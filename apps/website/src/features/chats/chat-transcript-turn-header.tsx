import { Chip } from '@heroui/react';
import { requestChatComposerMention } from '../../commands/chat-composer-mention.ts';
import { formatShortTime } from '../../lib/format.ts';
import { cn } from '../../lib/utils.ts';
import { transcriptTurnGeometry } from './chat-transcript-turn-geometry.ts';

/**
 * The author's line: who spoke, and when. Nothing else. What an Agent is
 * generally for belongs to its hover card and profile; what a message answers
 * — an automation fire, a reply parent — sits on the context lines above it
 * (`TurnContext`); and a task moving on this message states itself below.
 */
export function TurnHeader({
    composerId,
    deleted = false,
    displayName,
    mentionAgentId,
    onClick,
    timestamp,
}: {
    composerId?: string;
    deleted?: boolean;
    displayName: string;
    mentionAgentId?: string;
    onClick?: () => void;
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
