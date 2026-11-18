import { BubbleChatQuestionIcon } from '@hugeicons-pro/core-stroke-rounded';
import { hasErrorStatus } from '../../sessions/tools/tool-ui.ts';
import { getToolTarget, InlineToolLabel, ToolTimelineStep } from './tool-summary.tsx';
import type { ToolStepRendererProps } from './types.ts';

type ClarificationDisposition = 'answered' | 'skipped' | 'timeout';

export function ClarificationToolStep({
    animateEnter,
    chatId,
    index,
    isLast,
    row,
}: ToolStepRendererProps) {
    const fallbackQuestion = getToolTarget(row);
    const clarification = row.clarification;
    const question = clarification?.question ?? fallbackQuestion;
    const isPending = !(row.completedAt || hasErrorStatus(row.toolCall.status));
    const disposition = clarification?.disposition ?? null;
    const verb = getClarificationVerb({
        completedAt: row.completedAt,
        disposition,
        isPending,
    });

    return (
        <ToolTimelineStep
            animateEnter={animateEnter}
            chatId={chatId}
            icon={BubbleChatQuestionIcon}
            index={index}
            isLast={isLast}
            label={<InlineToolLabel row={row} target={question} verb={verb} />}
            row={row}
        >
            <ClarificationState answer={clarification?.answer ?? null} disposition={disposition} />
        </ToolTimelineStep>
    );
}

function ClarificationState({
    answer,
    disposition,
}: {
    answer: string | null;
    disposition: ClarificationDisposition | null;
}) {
    if (!(disposition || answer)) {
        return null;
    }

    const label =
        disposition === 'skipped'
            ? 'Skipped.'
            : disposition === 'timeout'
              ? 'Timed out.'
              : answer
                ? `Answered: ${answer}`
                : 'Answered.';

    return <p className="text-muted pt-1 pb-1.5 text-sm">{label}</p>;
}

function getClarificationVerb({
    completedAt,
    disposition,
    isPending,
}: {
    completedAt: string | null;
    disposition: ClarificationDisposition | null;
    isPending: boolean;
}) {
    if (isPending) {
        return 'Question';
    }

    if (disposition === 'skipped') {
        return 'Skipped';
    }

    if (disposition === 'timeout') {
        return 'Timed out';
    }

    return completedAt ? 'Answered' : 'Clarification';
}
