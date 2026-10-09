import type { CloudAgentWork } from '@haus/api';
import { Button } from '@heroui/react';
import { ChatMessage } from '@heroui-pro/react';
import { BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { CloudAgentWorkCard } from '../../cloud-agents/cloud-agent-work-card.tsx';
import { ThreadCloudAgentRows } from '../../cloud-agents/thread-cloud-agent-rows.tsx';
import { useHoistedCloudAgentWork } from '../../cloud-agents/transcript-cloud-agent-work.tsx';
import { taskVisibleInChat, useShowTasksInChat } from '../../tasks/show-tasks-in-chat.ts';
import { TranscriptTaskChip } from '../../tasks/transcript-task-chip.tsx';
import { ActionTooltip } from '../chat-action-tooltip.tsx';
import {
    getTranscriptMessageThread,
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { ReactionPile } from '../reactions/reaction-pile.tsx';
import { MessageContextMenu } from './message-context-menu.tsx';
import { isThreadAnchorRow } from './thread-anchor.ts';
import { ThreadPreviewBlock } from './thread-preview-block.tsx';

/** Message attachments become Thread metadata once replies exist. */
export function ThreadMessageSurface({
    children,
    onMessageHover,
    row,
}: {
    children: React.ReactNode;
    onMessageHover?: () => void;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const showTasks = useShowTasksInChat();
    const canOpenThread = Boolean(context?.threadActionsEnabled && isThreadAnchorRow(row));
    const work = row.message.cloudAgentWork ?? null;
    const works = useHoistedCloudAgentWork(row);
    const hoisted = canOpenThread ? works.filter((item) => item.id !== work?.id) : [];
    const flashing = context?.flashMessageId === row.message.id;
    // A Thread opened on a Task states it in full in the metadata panel above
    // the anchor, so the anchor's own chip would repeat every word of it.
    const anchored =
        context?.taskChipHiddenMessageId === row.message.id ? null : (row.message.task ?? null);
    const hasReplies = (getTranscriptMessageThread(row)?.replyCount ?? 0) > 0;
    const task = anchored && taskVisibleInChat(anchored.origin, showTasks) ? anchored : null;

    return (
        <MessageContextMenu
            className={cn(
                flashing && 'chat-thread-flash',
                context?.replyTargetMessageId === row.message.id && 'chat-reply-target'
            )}
            onMessageHover={onMessageHover}
            row={row}
        >
            {children}
            <ReactionPile row={row} />
            {canOpenThread ? null : (
                <div className="flex flex-wrap items-center gap-1.5">
                    {task ? <TranscriptTaskChip row={row} /> : null}
                </div>
            )}
            {/* One card everywhere: the transcript and the Thread render the
                same work card. The way into the Thread is the Message's hover
                action, or the reply preview below once replies exist. */}
            {work ? <CloudAgentWorkCard agentName={row.message.sender} work={work} /> : null}
            {canOpenThread ? (
                <ThreadSurfacePreview
                    hasReplies={hasReplies}
                    hoisted={hoisted}
                    row={row}
                    task={task}
                />
            ) : null}
        </MessageContextMenu>
    );
}

function ThreadSurfacePreview({
    row,
    task,
    hoisted,
    hasReplies,
}: {
    row: TranscriptMessageRow;
    task: TranscriptMessageRow['message']['task'];
    hoisted: readonly CloudAgentWork[];
    hasReplies: boolean;
}) {
    const context = useTranscriptRenderContextOptional();
    const label = threadSurfaceLabel({ hoisted: hoisted.length > 0, taskNumber: task?.number });
    const marks = task ? <TranscriptTaskChip row={row} /> : null;
    if (hasReplies) {
        return (
            <ThreadPreviewBlock
                detail={hoisted.length > 0 ? <ThreadCloudAgentRows works={hoisted} /> : null}
                headerLabel={label}
                headerLeading={
                    marks ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-2">{marks}</span>
                    ) : undefined
                }
                row={row}
            />
        );
    }
    if (!marks) {
        return null;
    }
    return (
        <div className="mt-1.5 flex min-w-0 flex-col items-start gap-1">
            <Button
                aria-label={`Open thread, ${label}`}
                className="max-w-full"
                onPress={() => context?.onOpenThread(row)}
                size="sm"
                variant="secondary"
            >
                {marks}
                <span aria-hidden>›</span>
            </Button>
        </div>
    );
}

/**
 * What the surface is, for the button that opens it. The marks are laid out
 * beside that button rather than inside it, so their text never reaches its
 * accessible name; this restates the identity, and nothing else — status and
 * assignee are the header's job, and change under a reader who is not looking.
 * A Message's own Cloud Agent work is not part of it: its card sits above the
 * preview and states itself.
 */
export function threadSurfaceLabel({
    hoisted,
    taskNumber,
}: {
    hoisted: boolean;
    taskNumber?: number;
}): string | undefined {
    const parts = [
        taskNumber === undefined ? null : `Task #${taskNumber}`,
        hoisted ? 'Cloud Agent work' : null,
    ].filter((part) => part !== null);

    return parts.length === 0 ? undefined : parts.join(', ');
}

/**
 * The reply-in-thread affordance for one message, rendered as a stock
 * ChatMessage action so it shares the turn's single hover actions bar
 * beside copy and turn details.
 */
export function ThreadMessageActions({
    className,
    row,
}: {
    className?: string;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const canOpenThread = Boolean(context?.threadActionsEnabled && isThreadAnchorRow(row));

    if (!context) {
        return null;
    }

    if (!canOpenThread) {
        return null;
    }

    return (
        <ActionTooltip label="Reply in thread">
            <ChatMessage.Action
                aria-label="Reply in thread"
                className={className}
                onPress={() => context.onOpenThread(row)}
            >
                <Icon icon={BubbleChatIcon} />
            </ChatMessage.Action>
        </ActionTooltip>
    );
}

export { isThreadAnchorRow } from './thread-anchor.ts';
