import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { TaskStatusDisc } from '../tasks/task-status-disc.tsx';
import {
    claimStatusLabels,
    formatClaimNumber,
    type MessageClaim,
    messageClaimAssigneeLabel,
} from './claim-presentation.ts';

export interface MessageClaimAssigneeProfile {
    avatarUrl: null | string;
    name: string;
}

/**
 * One Claim as it reads under its Message:
 * the number, a status disc, and the assignee whose work it is. Claim-chip
 * grammar — annotation scale, neutral throughout, with only the disc carrying
 * lifecycle color, the same shape the Worker
 * header takes in that slot.
 *
 * The surface itself is the way into the work, so the chip is inert: it is a
 * label on a button, not a second target inside one.
 */
export function MessageClaimChip({
    assigneeProfile,
    claim,
}: {
    assigneeProfile?: MessageClaimAssigneeProfile | null;
    claim: MessageClaim;
}) {
    const ownerName = assigneeProfile?.name ?? messageClaimAssigneeLabel(claim);

    return (
        <span
            // Annotation scale, matching the author line — without an explicit
            // size it inherits the message container and outgrows the body text.
            className="text-muted inline-flex max-w-full min-w-0 items-center gap-1.5 text-sm font-semibold"
            data-testid="message-claim-chip"
        >
            <span className="shrink-0 tabular-nums">Claim {formatClaimNumber(claim)}</span>
            <TaskStatusDisc className="size-3.5" status={claim.status} />
            <span className="sr-only">{claimStatusLabels[claim.status]}</span>
            {ownerName ? (
                <span className="flex min-w-0 items-center gap-1.5">
                    {assigneeProfile ? (
                        <EntityAvatar
                            name={assigneeProfile.name}
                            size={14}
                            src={assigneeProfile.avatarUrl}
                        />
                    ) : null}
                    <span className="truncate">{ownerName}</span>
                </span>
            ) : null}
        </span>
    );
}
