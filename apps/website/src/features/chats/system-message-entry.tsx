import { RelativeTime } from '../../components/time/relative-time.tsx';
import { WorkerReportNotice } from '../workers/worker-report-notice.tsx';
import type { TranscriptMessageRow } from './chat-transcript-render-context.tsx';
import { MessageSurface } from './message/message-surface.tsx';

export function SystemMessageEntry({ row }: { row: TranscriptMessageRow }) {
    const body = row.message.workerBody;
    return (
        <MessageSurface row={row}>
            {body?.kind === 'worker-report' ? (
                <WorkerReportNotice
                    outcome={body.outcome}
                    serverId={row.entity?.serverId ?? null}
                    timestamp={row.message.timestamp}
                    workerId={body.workerId}
                />
            ) : (
                <p className="text-muted flex items-baseline gap-2 py-2 pr-5 pl-11.5 text-sm">
                    <span className="min-w-0 truncate" title={row.message.content}>
                        {row.message.content}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 text-xs">
                        <RelativeTime value={row.message.timestamp} />
                    </span>
                </p>
            )}
        </MessageSurface>
    );
}
