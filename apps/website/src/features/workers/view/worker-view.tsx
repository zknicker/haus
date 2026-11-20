import type { Worker } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { PanelSection } from '../../tasks/work/panel-section.tsx';
import { PullRequestRows } from '../../tasks/work/pull-request-rows.tsx';
import { WorkerSession } from '../log/worker-session.tsx';

export { WorkerBandMenu } from './worker-band-menu.tsx';

export function WorkerView({ workerId }: { workerId: string }) {
    const { server } = useServerContext();
    const record = useWorkerRecord(server.id, workerId);
    if (record.data) {
        return <WorkerThread work={record.data} />;
    }
    return record.error ? <WorkerUnavailable /> : null;
}

function WorkerThread({ work }: { work: Worker }) {
    if (!work.pullRequest) {
        return (
            <div className="grid min-h-0 flex-1">
                <WorkerSession work={work} />
            </div>
        );
    }
    return (
        <div className="@container flex min-h-0 flex-1">
            <div className="grid min-h-0 flex-1 @4xl:grid-cols-[minmax(0,1fr)_18rem] @4xl:gap-8 @4xl:pe-5">
                <WorkerSession work={work} />
                <aside
                    aria-label="Overview"
                    className="hidden min-h-0 flex-col gap-3 overflow-y-auto pt-4 pb-6 @4xl:flex"
                >
                    <PanelSection count={1} title="Pull requests">
                        <PullRequestRows readings={[work.pullRequest]} />
                    </PanelSection>
                </aside>
            </div>
        </div>
    );
}

function WorkerUnavailable() {
    return (
        <EmptyState className="flex-1">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={Alert02Icon} />
                </EmptyState.Media>
                <EmptyState.Title>Worker not found</EmptyState.Title>
            </EmptyState.Header>
        </EmptyState>
    );
}
