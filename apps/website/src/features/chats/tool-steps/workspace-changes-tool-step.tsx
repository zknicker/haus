import { FileEditIcon } from '@hugeicons-pro/core-stroke-rounded';
import { getToolTarget, InlineToolLabel, ToolTimelineStep } from './tool-summary.tsx';
import type { ToolStepRendererProps } from './types.ts';

// Turn file-change evidence row ("Changed N files"). The drawer lists the
// files with per-file diffs (workspace-changes-drawer-body.tsx).
export function WorkspaceChangesToolStep({
    animateEnter,
    chatId,
    index,
    isLast,
    row,
}: ToolStepRendererProps) {
    return (
        <ToolTimelineStep
            animateEnter={animateEnter}
            chatId={chatId}
            icon={FileEditIcon}
            index={index}
            isLast={isLast}
            label={<InlineToolLabel row={row} target={getToolTarget(row)} verb="Changed" />}
            row={row}
        />
    );
}
