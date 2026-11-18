import type { CloudAgentWork } from '@haus/api';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import {
    cloudAgentRunStatusLabels,
    newestCloudAgentRun,
} from '../../cloud-agents/cloud-agent-presentation.ts';

export function CloudAgentRunSummary({ work }: { work: CloudAgentWork }) {
    const run = newestCloudAgentRun(work);
    if (!run) {
        return null;
    }
    return (
        <div className="flex min-w-0 flex-col gap-1 text-sm" data-testid="cloud-agent-run-summary">
            <span className="text-muted text-xs">
                {`Latest run · ${cloudAgentRunStatusLabels[run.status]}`}
            </span>
            {run.summary ? (
                <div className="min-w-0 break-words">
                    <ChatMarkdownText content={run.summary} />
                </div>
            ) : null}
        </div>
    );
}
