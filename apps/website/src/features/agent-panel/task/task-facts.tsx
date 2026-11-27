import type { TaskDetail } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Chip } from '@heroui/react';
import { Activity01Icon, Asterisk02Icon, ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import {
    computerHealthColor,
    computerHealthLabel,
    computerLabel,
} from '../../computers/presentation.ts';
import { TaskActivityChip } from '../../tasks/task-activity.tsx';
import { useModelLabels } from '../../tasks/use-task-facts.ts';
import { CaptainListGroup } from '../captain-list.tsx';

export function TaskFacts({ server, task }: { server: ServerDetail; task: TaskDetail }) {
    const computers = useComputers(server.id).data;
    const models = useModelLabels(server.id);
    const computer = computers?.find((candidate) => candidate.id === task.computerId);
    const facts = [
        {
            icon: Activity01Icon,
            id: 'status',
            label: 'Status',
            trailing: <TaskActivityChip task={task} />,
            value: task.archivedAt ? 'Archived' : null,
        },
        {
            icon: ComputerIcon,
            id: 'machine',
            label: 'Machine',
            trailing:
                computer && computer.health !== 'healthy' ? (
                    <Chip color={computerHealthColor(computer.health)} size="sm" variant="soft">
                        <Chip.Label>{computerHealthLabel(computer.health)}</Chip.Label>
                    </Chip>
                ) : null,
            value: computer ? computerLabel(computer) : computers ? 'No Machine' : null,
        },
        {
            icon: Asterisk02Icon,
            id: 'model',
            label: 'Model',
            trailing: null,
            value: task.model ? (models.get(task.model) ?? task.model) : 'No model',
        },
    ] satisfies TaskFact[];
    return (
        <CaptainListGroup title="Details">
            <ListView
                aria-label="Details"
                className="captain-facts captain-facts--panel"
                variant="secondary"
            >
                {facts.map((fact) => (
                    <ListView.Item id={fact.id} key={fact.id} textValue={fact.label}>
                        <ListView.ItemContent>
                            <span className="captain-list__glyph">
                                <Icon aria-hidden="true" icon={fact.icon} size={14} />
                            </span>
                            <span className="captain-facts__label">{fact.label}</span>
                            <ListView.Title className="captain-facts__value">
                                {fact.value ?? ' '}
                            </ListView.Title>
                        </ListView.ItemContent>
                        <ListView.ItemAction>{fact.trailing}</ListView.ItemAction>
                    </ListView.Item>
                ))}
            </ListView>
        </CaptainListGroup>
    );
}

interface TaskFact {
    icon: React.ComponentProps<typeof Icon>['icon'];
    id: string;
    label: string;
    trailing: React.ReactNode;
    value: string | null;
}
