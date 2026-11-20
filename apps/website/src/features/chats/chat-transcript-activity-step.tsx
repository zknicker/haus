import { PuzzleIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { ActivityItem } from './chat-transcript-activity-utils.ts';
import type { TranscriptRow } from './chat-transcript-model.ts';
import { SystemStep } from './chat-transcript-system-step.tsx';
import { ToolStep } from './chat-transcript-tool-step.tsx';
import { subagentKindConfig } from './subagent-kind-config.ts';
import { ThinkingStep } from './thinking-steps.tsx';

export function ActivityStep({
    animateEnter = false,
    chatId,
    currentSessionKey,
    index,
    isLast,
    item,
}: {
    animateEnter?: boolean;
    chatId?: string;
    currentSessionKey?: string | null;
    index: number;
    isLast: boolean;
    item: ActivityItem;
}) {
    switch (item.row.kind) {
        case 'tool':
            return (
                <ToolStep
                    animateEnter={animateEnter}
                    chatId={chatId}
                    index={index}
                    isLast={isLast}
                    row={item.row}
                />
            );
        case 'subagent':
            return (
                <WorkerStep
                    animateEnter={animateEnter}
                    index={index}
                    isLast={isLast}
                    row={item.row}
                />
            );
        case 'system':
            return (
                <SystemStep
                    animateEnter={animateEnter}
                    currentSessionKey={currentSessionKey}
                    index={index}
                    isLast={isLast}
                    row={item.row}
                />
            );
        default:
            return null;
    }
}

function WorkerStep({
    animateEnter,
    index,
    isLast,
    row,
}: {
    animateEnter?: boolean;
    index: number;
    isLast: boolean;
    row: Extract<TranscriptRow, { kind: 'subagent' }>;
}) {
    const config = subagentKindConfig[row.subagent.kind];
    const status = subagentStepStatus(row.subagent.status);

    return (
        <ThinkingStep
            animateEnter={animateEnter}
            description={row.subagent.detail}
            icon={PuzzleIcon}
            index={index}
            isLast={isLast}
            label={
                <span className="inline-flex max-w-full min-w-0 items-baseline gap-1.5 text-left">
                    <span className="shrink-0">{config.label}</span>
                    <span className="text-muted truncate">{row.subagent.title}</span>
                </span>
            }
            status={status}
        />
    );
}

function subagentStepStatus(
    status: Extract<TranscriptRow, { kind: 'subagent' }>['subagent']['status']
) {
    if (status === 'failed' || status === 'timed_out') {
        return 'failed' as const;
    }

    if (status === 'queued' || status === 'running' || status === 'waiting') {
        return 'active' as const;
    }

    return 'complete' as const;
}
