import type { TaskDetail } from '@haus/api';
import { Button, Tabs, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { WorkerPane, WorkerPaneMenu } from '../workers/log/worker-pane.tsx';
import { useKnownWorker } from '../workers/worker-summaries.tsx';
import { TaskDetailsCard } from './details/task-details-card.tsx';
import { TaskWorkPanel } from './work/task-work-panel.tsx';

export const overviewTab = 'overview';

export function TaskSidePane({
    onClose,
    onSelect,
    openWorkerIds,
    selected,
    task,
}: {
    onClose: (workerId: string) => void;
    onSelect: (tab: string) => void;
    openWorkerIds: readonly string[];
    selected: string;
    task: TaskDetail;
}) {
    const selectedWorker = selected === overviewTab ? null : selected;
    return (
        <Tabs
            className="flex min-h-0 min-w-0 flex-col"
            onSelectionChange={(key) => onSelect(String(key))}
            selectedKey={selected}
            variant="secondary"
        >
            <div className="flex min-w-0 items-center gap-1 pt-2">
                <Tabs.ListContainer className="min-w-0 flex-1">
                    <Tabs.List aria-label="Task side pane">
                        <Tabs.Tab id={overviewTab}>
                            Overview
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        {openWorkerIds.map((workerId) => (
                            <Tabs.Tab id={workerId} key={workerId}>
                                <WorkerTabLabel workerId={workerId} />
                                <Tabs.Indicator />
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs.ListContainer>
                {selectedWorker ? (
                    <>
                        <WorkerPaneMenu workerId={selectedWorker} />
                        <Tooltip>
                            <Button
                                aria-label="Close Worker tab"
                                isIconOnly
                                onPress={() => onClose(selectedWorker)}
                                size="sm"
                                variant="ghost"
                            >
                                <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                            </Button>
                            <Tooltip.Content>Close tab</Tooltip.Content>
                        </Tooltip>
                    </>
                ) : null}
            </div>
            <Tabs.Panel
                className="flex min-h-0 flex-col gap-3 overflow-y-auto pt-3 pb-6"
                id={overviewTab}
            >
                <TaskDetailsCard task={task} />
                <TaskWorkPanel task={task} />
            </Tabs.Panel>
            {openWorkerIds.map((workerId) => (
                <Tabs.Panel className="flex min-h-0 flex-1 flex-col" id={workerId} key={workerId}>
                    <WorkerPane workerId={workerId} />
                </Tabs.Panel>
            ))}
        </Tabs>
    );
}

function WorkerTabLabel({ workerId }: { workerId: string }) {
    const known = useKnownWorker(workerId);
    return <span className="max-w-40 truncate">{known?.title ?? 'Worker'}</span>;
}
