import type { DriveCitation, WorkerReport as WorkerReportRecord } from '@haus/api';
import * as React from 'react';
import { useChatMessage } from '../../hooks/servers/use-chat-message.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { ChatMarkdownText } from '../chats/chat-markdown-text.tsx';
import { SharedArtifactChip } from '../chats/shared-artifact-chip.tsx';
import { appOrigins } from '../chats/shared-artifact-link.ts';

export function WorkerReport({
    chatId,
    report,
    server,
}: {
    chatId: null | string;
    report: WorkerReportRecord;
    server: { id: string; slug: string };
}) {
    const humans = useHumanDirectory(server.id);
    return (
        <div className="flex min-w-0 flex-col gap-1.5 text-sm" data-testid="worker-report">
            {report.text.trim() === '' ? null : (
                <div className="min-w-0 break-words">
                    <ChatMarkdownText content={report.text} />
                </div>
            )}
            {report.ask ? (
                <p className="text-foreground min-w-0 break-words" data-testid="worker-report-ask">
                    {report.personId ? (
                        <span className="text-accent font-medium">{`@${humans.name(report.personId)} `}</span>
                    ) : null}
                    {report.ask}
                </p>
            ) : null}
            {chatId && report.messageId ? (
                <WorkerReportCitations
                    chatId={chatId}
                    messageId={report.messageId}
                    server={server}
                />
            ) : null}
        </div>
    );
}

function WorkerReportCitations({
    chatId,
    messageId,
    server,
}: {
    chatId: string;
    messageId: string;
    server: { id: string; slug: string };
}) {
    const entry = useChatMessage(server.id, chatId, messageId);
    const scope = React.useMemo(
        () => ({ origins: appOrigins(), serverId: server.id, slug: server.slug }),
        [server.id, server.slug]
    );
    const citations = entry?.message.driveCitations ?? noCitations;
    if (citations.length === 0) {
        return null;
    }
    return (
        <ul aria-label="Cited files" className="flex min-w-0 flex-wrap gap-1">
            {citations.map((citation) => (
                <li className="min-w-0" key={citation.path}>
                    {citation.artifactId ? (
                        <SharedArtifactChip
                            scope={scope}
                            target={{
                                artifactId: citation.artifactId,
                                ...(citation.revisionId ? { revisionId: citation.revisionId } : {}),
                            }}
                        >
                            {fileName(citation)}
                        </SharedArtifactChip>
                    ) : (
                        <span className="text-muted">{fileName(citation)}</span>
                    )}
                </li>
            ))}
        </ul>
    );
}

const noCitations: readonly DriveCitation[] = [];

function fileName(citation: DriveCitation) {
    return citation.path.split('/').filter(Boolean).at(-1) ?? citation.path;
}
