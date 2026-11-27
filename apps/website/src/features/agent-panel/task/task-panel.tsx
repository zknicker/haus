import { Tabs } from '@heroui/react';
import { DashboardSquare01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { agentPanelBodyClass } from '../agent-panel-layout.ts';
import { AgentPanelToggle } from '../agent-panel-toggle.tsx';
import { TaskOverview } from './task-overview.tsx';

export function TaskPanel({
    panelKey,
    server,
    shortId,
}: {
    panelKey: string;
    server: ServerDetail;
    shortId: string;
}) {
    const task = useTask(server.id, { shortId }).data;
    return (
        <Tabs className="agent-panel__tabs flex min-h-0 flex-1 flex-col" selectedKey="overview">
            <div className="flex items-center gap-1 px-2 pt-2">
                <Tabs.ListContainer className="min-w-0 flex-1">
                    <Tabs.List aria-label="Task panel">
                        <Tabs.Tab id="overview">
                            <Icon aria-hidden="true" icon={DashboardSquare01Icon} size={14} />
                            Overview
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>
                <AgentPanelToggle panelKey={panelKey} />
            </div>
            <Tabs.Panel className={agentPanelBodyClass} id="overview">
                {task ? <TaskOverview server={server} task={task} /> : null}
            </Tabs.Panel>
        </Tabs>
    );
}
