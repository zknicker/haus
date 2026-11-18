import { formatShortTime } from '../../../../lib/format.ts';
import type { TranscriptSystemRow } from '../../../chats/transcript-contract.ts';

type AccessEventRow = Extract<TranscriptSystemRow, { systemKind: 'accessEvent' }>;

export function AccessEventLogEntry({ entry }: { entry: AccessEventRow }) {
    return (
        <div className="card-shell border-warning-soft bg-warning-soft border px-3 py-1.5">
            <div className="flex items-center gap-2">
                <span className="text-warning text-xs font-medium tracking-[0.16em] uppercase">
                    Access {entry.accessEvent.status}
                </span>
                <span className="text-muted font-mono text-xs tabular-nums">
                    {formatShortTime(entry.timestamp)}
                </span>
            </div>
            <p className="text-foreground mt-1 text-sm">
                {entry.accessEvent.toolName ?? 'session access'}
                {entry.accessEvent.targetSessionKey
                    ? ` → ${entry.accessEvent.targetSessionKey}`
                    : null}
            </p>
            {entry.accessEvent.errorMessage ? (
                <p className="text-warning mt-0.5 line-clamp-2 text-sm break-words whitespace-pre-wrap">
                    {entry.accessEvent.errorMessage}
                </p>
            ) : null}
        </div>
    );
}
