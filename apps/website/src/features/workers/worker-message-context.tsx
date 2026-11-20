import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useWorkerSummary } from '../../hooks/servers/use-worker.ts';
import { cn } from '../../lib/utils.ts';
import {
    TurnContextLine,
    turnContextLineContentClassName,
    turnContextMarkSize,
} from '../chats/turn-context-line.tsx';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import type { WorkerMessageBody } from './worker-message-body.ts';
import { workerPlaceName } from './worker-place.ts';
import { useKnownWorker } from './worker-summaries.tsx';

export function WorkerMessageContext({
    body,
    serverId,
}: {
    body: WorkerMessageBody;
    serverId: null | string;
}) {
    const known = useKnownWorker(body.workerId);
    const fetched = useWorkerSummary(serverId, body.workerId, known === null);
    const openWorker = useOpenWorkerView();
    const work = known ?? fetched;
    if (!work) {
        return null;
    }
    return (
        <TurnContextLine>
            <button
                aria-label={`Open Worker: ${work.title}`}
                className={cn(
                    turnContextLineContentClassName,
                    'max-w-full cursor-(--cursor-interactive) hover:underline'
                )}
                data-testid="worker-message-context"
                onClick={() => openWorker(work.id)}
                type="button"
                {...opensPlace}
            >
                <WorkerKeycap provider={work.place} size={turnContextMarkSize} />
                <span className="text-muted min-w-0 truncate font-medium">
                    {`To Worker on ${workerPlaceName(work)}`}
                </span>
                <span className="text-context-line-quiet min-w-0 shrink-[4] truncate">
                    {work.title}
                </span>
            </button>
        </TurnContextLine>
    );
}
