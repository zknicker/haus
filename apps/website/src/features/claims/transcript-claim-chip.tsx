import { useTranscriptRenderContextOptional } from '../chats/chat-transcript-render-context.tsx';
import type { TranscriptMessageRow } from '../chats/transcript-contract.ts';
import { type MessageClaimAssigneeProfile, MessageClaimChip } from './message-claim-chip.tsx';

/**
 * The claim chip as a transcript row renders it. The assignee's face and name
 * resolve through the one actor resolver every other row already reads, so an
 * assignee who has since left the Server reads the same here as anywhere.
 */
export function TranscriptClaimChip({ row }: { row: TranscriptMessageRow }) {
    const resolve = useTranscriptRenderContextOptional()?.resolveActorProfile;
    const claim = row.message.claim;

    if (!claim) {
        return null;
    }

    const assignee = claim.assignee;
    const profile: MessageClaimAssigneeProfile | null =
        assignee?.kind && resolve
            ? (resolve({
                  id: assignee.id,
                  kind: assignee.kind === 'agent' ? 'agent' : 'participant',
              }) ?? null)
            : null;

    return <MessageClaimChip assigneeProfile={profile} claim={claim} />;
}
