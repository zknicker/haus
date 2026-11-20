import { useParams } from 'react-router-dom';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useWorker } from '../../hooks/servers/use-worker.ts';
import { cn } from '../../lib/utils.ts';
import {
    TurnContextLine,
    turnContextLineContentClassName,
    turnContextMarkSize,
} from '../chats/turn-context-line.tsx';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useDockedWorker } from './docked-worker.tsx';
import type { WorkerMessageBody } from './worker-message-body.ts';
import { workerPlaceName } from './worker-place.tsx';

export function WorkerMessageContext({ body }: { body: WorkerMessageBody }) {
    const { slug = '' } = useParams();
    const server = useServer(slug, Boolean(slug)).data;
    const docked = useDockedWorker();
    const work = useWorker(server?.id ?? '', body.workerId, { enabled: server !== undefined }).data;
    if (!work) {
        return null;
    }
    const lead = `${body.kind === 'worker-follow-up' ? 'To Worker' : 'Worker'} on ${workerPlaceName(work)}`;
    const content = (
        <>
            <WorkerKeycap provider={work.place} size={turnContextMarkSize} />
            <span className="text-muted min-w-0 truncate font-medium">{lead}</span>
            <span className="text-context-line-quiet min-w-0 shrink-[4] truncate">
                {work.title}
            </span>
        </>
    );
    const className = cn(turnContextLineContentClassName, 'max-w-full');
    return (
        <TurnContextLine>
            {docked?.isDocked(work.id) ? (
                <button
                    aria-label={`Show Worker: ${work.title}`}
                    className={cn(className, 'cursor-(--cursor-interactive) hover:underline')}
                    data-testid="worker-message-context"
                    onClick={() => docked.reveal(work.id)}
                    type="button"
                >
                    {content}
                </button>
            ) : (
                <span className={className} data-testid="worker-message-context">
                    {content}
                </span>
            )}
        </TurnContextLine>
    );
}
