import type { CloudAgentWork } from '@haus/api';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { cn } from '../../lib/utils.ts';
import { isEndedCloudAgentJob } from './cloud-agent-presentation.ts';
import { CloudAgentProviderGlyph } from './cloud-agent-provider-mark.tsx';
import { CloudAgentStatusDisc } from './cloud-agent-status-disc.tsx';
import { type ThreadCloudAgentRow, threadCloudAgentRows } from './thread-cloud-agent-row-model.ts';

/**
 * The Cloud Agent jobs inside a Thread, one informational row each, in the
 * order they were started. The Thread surface's single button owns every click.
 */
export function ThreadCloudAgentRows({ works }: { works: readonly CloudAgentWork[] }) {
    const now = useRelativeNow(30_000);
    return (
        <div
            className="pointer-events-none relative flex min-w-0 flex-col gap-1"
            data-testid="thread-cloud-agent-rows"
        >
            {threadCloudAgentRows(works, now).map((row) => (
                <ThreadCloudAgentJobRow key={row.work.id} row={row} />
            ))}
        </div>
    );
}

/** A cancelled or expired job is dimmed: it ended, so it no longer asks for attention. */
function ThreadCloudAgentJobRow({ row }: { row: ThreadCloudAgentRow }) {
    const ended = isEndedCloudAgentJob(row.state);
    return (
        <span
            className="flex min-w-0 items-center gap-1.5 text-sm leading-tight"
            data-job-state={row.state}
            data-testid="thread-cloud-agent-row"
        >
            <span
                className="flex shrink-0 items-center justify-center bg-default dark:inset-ring-[length:var(--hairline-width)] dark:inset-ring-foreground/80 dark:bg-background"
                style={{ borderRadius: identityMarkRadius(20), height: 20, width: 20 }}
            >
                <CloudAgentProviderGlyph className="scale-110" provider={row.work.provider} />
            </span>
            <span
                className={cn(
                    'min-w-0 flex-1 truncate',
                    ended ? 'text-muted' : 'font-medium text-foreground'
                )}
            >
                {row.work.title}
            </span>
            {row.pullRequestNumber === null ? null : (
                <span className="shrink-0 text-muted">{`#${row.pullRequestNumber}`}</span>
            )}
            <span
                className={cn(
                    'flex shrink-0 items-center gap-1',
                    row.tone === 'warning' ? 'text-warning' : 'text-muted'
                )}
            >
                <CloudAgentStatusDisc className="size-3.5" state={row.state} />
                {row.statusText}
            </span>
        </span>
    );
}
