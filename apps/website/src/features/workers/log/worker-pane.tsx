import { Button, Tooltip } from '@heroui/react';
import { ArrowLeft01Icon, Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { WorkerBandMenu } from '../view/worker-band-menu.tsx';
import { WorkerSession } from './worker-session.tsx';

export function WorkerPane({ onClose, workerId }: { onClose: () => void; workerId: string }) {
    const { server } = useServerContext();
    const work = useWorkerRecord(server.id, workerId).data;
    return (
        <section
            aria-label={work?.title ?? 'Worker'}
            className="bg-surface border-separator flex min-h-0 min-w-0 flex-col border-s"
            data-testid="worker-pane"
        >
            <div className="border-separator flex h-11 shrink-0 items-center gap-1 border-b px-2">
                <Tooltip>
                    <Button
                        aria-label="Back to Overview"
                        isIconOnly
                        onPress={onClose}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={ArrowLeft01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>Back to Overview</Tooltip.Content>
                </Tooltip>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {work?.title ?? ''}
                </span>
                {work ? <WorkerBandMenu work={work} /> : null}
                <Tooltip>
                    <Button
                        aria-label="Close Worker"
                        isIconOnly
                        onPress={onClose}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>Close</Tooltip.Content>
                </Tooltip>
            </div>
            {work ? <WorkerSession work={work} /> : null}
        </section>
    );
}
