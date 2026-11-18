import type { CloudAgentWork } from '@haus/api';
import type * as React from 'react';

import { cn } from '../../../lib/utils.ts';
import { claimVisibleInChat, useShowClaimsInChat } from '../../claims/show-claims-in-chat.ts';
import { TranscriptClaimChip } from '../../claims/transcript-claim-chip.tsx';
import { MessageCloudAgentWork } from '../../cloud-agents/docked-cloud-agent-work.tsx';
import { TaskOriginPreviews } from '../../tasks/preview/task-origin-previews.tsx';
import {
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { ReactionPile } from '../reactions/reaction-pile.tsx';
import { MessageContextMenu } from './message-context-menu.tsx';

const noWork: readonly CloudAgentWork[] = [];

export function MessageSurface({
    children,
    onMessageHover,
    row,
}: {
    children: React.ReactNode;
    onMessageHover?: () => void;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const showClaims = useShowClaimsInChat();
    const linked = row.message.cloudAgentWork ?? noWork;
    const flashing = context?.flashMessageId === row.message.id;
    const claim = row.message.claim ?? null;

    return (
        <MessageContextMenu
            className={cn(
                flashing && 'chat-message-flash',
                context?.replyTargetMessageId === row.message.id && 'chat-reply-target'
            )}
            onMessageHover={onMessageHover}
            row={row}
        >
            {children}
            <ReactionPile row={row} />
            {claim && claimVisibleInChat(claim.origin, showClaims) ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <TranscriptClaimChip row={row} />
                </div>
            ) : null}
            {linked.map((work) => (
                <MessageCloudAgentWork key={work.id} work={work} />
            ))}
            {row.taskPreviews && context?.turnDetails?.serverId ? (
                <TaskOriginPreviews
                    previews={row.taskPreviews}
                    serverId={context.turnDetails.serverId}
                />
            ) : null}
        </MessageContextMenu>
    );
}
