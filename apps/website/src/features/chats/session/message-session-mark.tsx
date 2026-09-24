import type { AgentSessionRotation } from '@haus/api';
import { RefreshIcon } from '@hugeicons-pro/core-stroke-rounded';
import { CursorHoverCard } from '../../../components/ui/cursor-hover-card.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentSessionRotation } from '../../../hooks/agents/use-agent-session-rotation.ts';
import { cn } from '../../../lib/utils.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../../mentions/reference-preview-header.tsx';
import { sessionRotationHoverFacts, sessionRotationReasonLabel } from './session-mark-model.ts';

/**
 * The Agent started over before it wrote this.
 *
 * A reset leaves no row in the transcript, so without this the reader sees an
 * Agent that suddenly forgot the last hour and nothing that says why. The mark
 * sits in the same header slot as the automation mark and after it when both
 * apply: why the Agent spoke comes before what it had already forgotten.
 */
export function MessageSessionMark({
    agentId,
    generation,
    serverId,
}: {
    agentId: string;
    generation: number;
    serverId: string;
}) {
    return (
        <CursorHoverCard
            className="w-fit max-w-72"
            content={
                <SessionMarkHoverCard
                    agentId={agentId}
                    generation={generation}
                    serverId={serverId}
                />
            }
            triggerClassName="min-w-0"
        >
            <span
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-session-mark text-xs leading-5"
                data-testid="message-session-mark"
            >
                <SessionGlyph size={13} />
                New session
            </span>
        </CursorHoverCard>
    );
}

/**
 * The read. It runs only here, and the hover card's content mounts only once
 * the card opens, so a transcript full of marks costs nothing until one is
 * pointed at.
 */
function SessionMarkHoverCard({
    agentId,
    generation,
    serverId,
}: {
    agentId: string;
    generation: number;
    serverId: string;
}) {
    const rotation = useAgentSessionRotation({ agentId, enabled: true, generation, serverId });

    return <SessionMarkHoverContent rotation={rotation.data ?? null} />;
}

/**
 * The card itself. `rotation` is null while the read is in flight and when no
 * rotation was recorded for this generation — history older than the record
 * has none — so the card states the heading it is certain of and adds the
 * facts when they arrive, rather than flashing a shell of empty rows. The
 * Agent's Activity tab holds the full history; the preview does not link out.
 */
export function SessionMarkHoverContent({ rotation }: { rotation: AgentSessionRotation | null }) {
    return (
        <ReferencePreviewHeader
            mark={<SessionGlyph className="text-session-mark" size={16} />}
            meta={rotation ? sessionRotationReasonLabel(rotation.reason) : null}
            title="New session"
        >
            {rotation ? (
                <ReferencePreviewText>
                    {sessionRotationHoverFacts(rotation).join(' · ')}
                </ReferencePreviewText>
            ) : null}
        </ReferencePreviewHeader>
    );
}

function SessionGlyph({ className, size }: { className?: string; size: number }) {
    return (
        <Icon
            className={cn('shrink-0', className)}
            icon={RefreshIcon}
            size={size}
            strokeWidth={1.6}
            style={{ height: size, width: size }}
        />
    );
}
