import type { IssueState } from '@haus/api';
import type { ClaimStatus } from '../../claims/claim-presentation.ts';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';
import { issueStateLabels } from './captain-model.ts';

export function IssueStateGlyph({ state }: { state: IssueState }) {
    return (
        <span aria-label={issueStateLabels[state]} className="flex" role="img">
            {state === 'todo' ? (
                <OpenRing />
            ) : (
                <TaskStatusDisc className={issueTints[state]} status={issueDiscs[state]} />
            )}
        </span>
    );
}

function OpenRing() {
    return (
        <svg
            aria-hidden="true"
            className="text-muted size-[15px] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            viewBox="0 0 16 16"
        >
            <circle cx={8} cy={8} r={6.25} />
        </svg>
    );
}

const issueTints: Partial<Record<IssueState, string>> = {
    done: 'text-success',
    in_progress: 'text-warning',
};

const issueDiscs: Record<Exclude<IssueState, 'todo'>, ClaimStatus> = {
    backlog: 'todo',
    canceled: 'closed',
    done: 'done',
    in_progress: 'in_progress',
};
