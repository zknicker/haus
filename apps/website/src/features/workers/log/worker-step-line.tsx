import type { workerStepLines } from './worker-step-lines.ts';

export function WorkerStepLine({ line }: { line: ReturnType<typeof workerStepLines>[number] }) {
    return (
        <p className="text-muted min-w-0 truncate font-mono text-xs" data-testid="worker-step-line">
            {`› ${line.text}`}
            {line.additions > 0 ? (
                <span className="text-success">{` +${line.additions}`}</span>
            ) : null}
            {line.deletions > 0 ? (
                <span className="text-danger">{` −${line.deletions}`}</span>
            ) : null}
            {line.ok === false ? <span className="text-danger"> failed</span> : null}
        </p>
    );
}
