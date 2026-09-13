import type { CloudAgentWork } from '@haus/api';
import { Button } from '@heroui/react';
import { ChatMessage } from '@heroui-pro/react';
import { BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { TranscriptAskMarker } from '../../asks/transcript-ask-marker.tsx';
import { CloudAgentWorkCard } from '../../cloud-agents/cloud-agent-work-card.tsx';
import {
    CloudAgentWorkDetail,
    CloudAgentWorkHeader,
} from '../../cloud-agents/cloud-agent-work-header.tsx';
import { ThreadCloudAgentRows } from '../../cloud-agents/thread-cloud-agent-rows.tsx';
import {
    TranscriptCloudAgentWorkMenu,
    useHoistedCloudAgentWork,
} from '../../cloud-agents/transcript-cloud-agent-work.tsx';
import { taskVisibleInChat, useShowTasksInChat } from '../../tasks/show-tasks-in-chat.ts';
import { TranscriptTaskChip } from '../../tasks/transcript-task-chip.tsx';
import { ActionTooltip } from '../chat-action-tooltip.tsx';
import {
    getTranscriptMessageThread,
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { MessageContextMenu } from './message-context-menu.tsx';
import { MessageReactionPills } from './message-reactions.tsx';
import { isThreadAnchorRow } from './thread-anchor.ts';
import { ThreadPreviewBlock } from './thread-preview-block.tsx';

/** Message attachments become Thread metadata once replies exist. */
export function ThreadMessageSurface({
    children,
    row,
}: {
    children: React.ReactNode;
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
    const task =
        anchored && (hasReplies || taskVisibleInChat(anchored.origin, showTasks)) ? anchored : null;
    const marks = <ThreadSurfaceMarks row={row} task={task} work={null} />;

    return (
        <MessageContextMenu className={cn(flashing && 'chat-thread-flash')} row={row}>
            {children}
            <div className="flex flex-wrap items-center gap-1.5">
                {canOpenThread ? null : marks}
                <MessageReactionPills row={row} />
            </div>
            {work && !canOpenThread ? <CloudAgentWorkCard work={work} /> : null}
            {canOpenThread ? (
                <ThreadSurfacePreview
                    hasReplies={hasReplies}
                    hoisted={hoisted}
                    row={row}
                    task={task}
                    work={work}
                />
            ) : null}
        </MessageContextMenu>
    );
}

function ThreadSurfacePreview({
    row,
    task,
    work,
    hoisted,
    hasReplies,
}: {
    row: TranscriptMessageRow;
    task: TranscriptMessageRow['message']['task'];
    work: CloudAgentWork | null;
    hoisted: readonly CloudAgentWork[];
    hasReplies: boolean;
}) {
    const context = useTranscriptRenderContextOptional();
    const label = threadSurfaceLabel({
        ask: row.message.ask?.status === 'open',
        hoisted: hoisted.length > 0,
        taskNumber: task?.number,
        workTitle: work?.title,
    });
    const marks = <ThreadSurfaceMarks row={row} task={task} work={work} />;
    const detail = <ThreadSurfaceWorkDetail hoisted={hoisted} work={work} />;
    const menu = work ? <TranscriptCloudAgentWorkMenu row={row} work={work} /> : null;
    if (hasReplies) {
        return (
            <ThreadPreviewBlock
                detail={detail}
                headerLabel={label}
                headerLeading={
                    label ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-2">{marks}</span>
                    ) : undefined
                }
                headerTrailing={menu}
                row={row}
            />
        );
    }
    if (!label) {
        return null;
    }
    return (
        <div className="mt-1.5 flex min-w-0 flex-col items-start gap-1">
            <div className="flex max-w-full items-center gap-1">
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
                {menu}
            </div>
            {detail}
        </div>
    );
}

function ThreadSurfaceWorkDetail({
    work,
    hoisted,
}: {
    work: CloudAgentWork | null;
    hoisted: readonly CloudAgentWork[];
}) {
    return (
        <>
            {work ? <CloudAgentWorkDetail work={work} /> : null}
            {hoisted.length > 0 ? <ThreadCloudAgentRows works={hoisted} /> : null}
        </>
    );
}

function ThreadSurfaceMarks({
    row,
    task,
    work,
}: {
    row: TranscriptMessageRow;
    task: TranscriptMessageRow['message']['task'];
    work: CloudAgentWork | null;
}) {
    return (
        <>
            {task ? <TranscriptTaskChip row={row} /> : null}
            {row.message.ask ? <TranscriptAskMarker ask={row.message.ask} /> : null}
            {work ? <CloudAgentWorkHeader work={work} /> : null}
        </>
    );
}

/**
 * What the surface is, for the button that opens it. The marks are laid out
 * beside that button rather than inside it, so their text never reaches its
 * accessible name; this restates the identity, and nothing else — status and
 * assignee are the header's job, and change under a reader who is not looking.
 */
export function threadSurfaceLabel({
    ask,
    hoisted,
    taskNumber,
    workTitle,
}: {
    ask: boolean;
    hoisted: boolean;
    taskNumber?: number;
    workTitle?: string;
}): string | undefined {
    const parts = [
        taskNumber === undefined ? null : `Task #${taskNumber}`,
        ask ? 'Ask' : null,
        workTitle === undefined ? null : `Cloud Agent work: ${workTitle}`,
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
