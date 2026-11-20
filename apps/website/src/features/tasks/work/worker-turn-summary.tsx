import type { Worker } from '@haus/api';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import { workerTurnStatusLabels, newestWorkerTurn } from '../../workers/worker-presentation.ts';

export function WorkerTurnSummary({ work }: { work: Worker }) {
    const run = newestWorkerTurn(work);
    if (!run) {
        return null;
    }
    return (
        <div className="flex min-w-0 flex-col gap-1 text-sm" data-testid="worker-turn-summary">
            <span className="text-muted text-xs">
                {`Latest run · ${workerTurnStatusLabels[run.status]}`}
            </span>
            {run.summary ? (
                <div className="min-w-0 break-words">
                    <ChatMarkdownText content={run.summary} />
                </div>
            ) : null}
        </div>
    );
}
