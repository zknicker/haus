import { CommandLineIcon } from '@hugeicons-pro/core-stroke-rounded';
import { hasErrorStatus } from '../../sessions/tools/tool-ui.ts';
import { getToolFact, getToolTarget, InlineToolLabel, ToolTimelineStep } from './tool-summary.tsx';
import type { ToolStepRendererProps, ToolStepRow } from './types.ts';

export function ShellToolStep({ animateEnter, chatId, index, isLast, row }: ToolStepRendererProps) {
    return (
        <ToolTimelineStep
            animateEnter={animateEnter}
            chatId={chatId}
            icon={CommandLineIcon}
            index={index}
            isLast={isLast}
            label={
                <InlineToolLabel row={row} target={getShellTarget(row)} verb={getShellVerb(row)} />
            }
            row={row}
        />
    );
}

function getShellVerb(row: ToolStepRow) {
    const status = row.toolCall.status;

    const normalizedStatus = status?.toLowerCase() ?? '';

    if (normalizedStatus.includes('timeout') || normalizedStatus.includes('timed out')) {
        return 'Timed out';
    }

    if (hasErrorStatus(status)) {
        return 'Failed';
    }

    return row.completedAt ? 'Used' : 'Using';
}

function getShellTarget(row: ToolStepRow) {
    return getToolFact(row, 'Command') ?? getToolTarget(row);
}
