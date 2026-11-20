import type { Worker } from '@haus/api';
import { Button, Disclosure } from '@heroui/react';
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useServer } from '../../hooks/servers/use-server.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import { workerStepLines } from './log/worker-step-lines.ts';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import {
    canFollowUpWorker,
    isWorkerTurnLive,
    newestWorkerReport,
    workerAge,
    workerRowQuestion,
    workerRowStatus,
    workerStatusDiscStates,
    workerStatusLabels,
} from './worker-card-model.ts';
import { WorkerFollowUpComposer } from './worker-follow-up-composer.tsx';
import { workerPlaceName } from './worker-place.ts';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

const statusTones = {
    done: 'text-success',
    failed: 'text-danger',
    'needs-you': 'text-warning',
    queued: 'text-muted',
    stopped: 'text-muted',
    working: 'text-accent',
} as const;

export function WorkerRows({ label, works }: { label: string; works: readonly Worker[] }) {
    return (
        <ul aria-label={label} className="flex min-w-0 flex-col">
            {works.map((work) => (
                <li key={work.id}>
                    <WorkerRow work={work} />
                </li>
            ))}
        </ul>
    );
}

function WorkerRow({ work }: { work: Worker }) {
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const status = workerRowStatus(work);
    const question = workerRowQuestion(work);
    const [expanded, setExpanded] = React.useState(false);
    return (
        <Disclosure isExpanded={expanded} onExpandedChange={setExpanded}>
            <Disclosure.Heading>
                <Disclosure.Trigger
                    className="hover:bg-default/50 flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left"
                    data-testid="worker-row"
                >
                    <span
                        aria-label={workerStatusLabels[status]}
                        className="mt-0.5"
                        role="img"
                        title={workerStatusLabels[status]}
                    >
                        <WorkerStatusDisc
                            className={statusTones[status]}
                            state={workerStatusDiscStates[status]}
                        />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{work.title}</span>
                        <span className="text-muted truncate text-xs">
                            {`${question ?? workerPlaceName(work)} · ${workerAge(work, now)}`}
                        </span>
                    </span>
                    <Disclosure.Indicator />
                </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body>
                    {expanded ? <WorkerQuickLook work={work} /> : null}
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}

export function WorkerQuickLook({ work }: { work: Worker }) {
    const { slug = '' } = useParams();
    const server = useServer(slug, Boolean(slug)).data;
    const openWorker = useOpenWorkerView();
    const tail = workerTail(work);
    const report = newestWorkerReport(work);
    const question = workerRowQuestion(work);
    return (
        <div
            className="border-separator ms-4 flex min-w-0 flex-col gap-1.5 border-s-2 ps-3 pb-2"
            data-testid="worker-quick-look"
        >
            {tail ? <p className="text-muted truncate font-mono text-xs">{`› ${tail}`}</p> : null}
            {report && report.text.trim() !== '' ? (
                <p className="line-clamp-2 text-xs">{messagePreviewLine(report.text)}</p>
            ) : null}
            {question ? <p className="text-xs font-medium">{question}</p> : null}
            <Button
                className="self-start"
                onPress={() => openWorker(work.id)}
                size="sm"
                variant="ghost"
            >
                Open full log
            </Button>
            {server && canFollowUpWorker(work) ? (
                <WorkerFollowUpComposer compact serverId={server.id} work={work} />
            ) : null}
        </div>
    );
}

function workerTail(work: Pick<Worker, 'activity' | 'turns'>) {
    const lines = workerStepLines(work.turns[0]?.steps ?? []);
    return lines.at(-1)?.text ?? work.activity?.summary ?? null;
}
