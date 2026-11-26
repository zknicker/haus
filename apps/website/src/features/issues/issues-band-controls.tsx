import { Segment } from '@heroui-pro/react';
import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    Add01Icon,
    KanbanIcon,
    LabelIcon,
    ListViewIcon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { TaskLabelsDialog } from '../tasks/details/task-labels-dialog.tsx';
import { useSetSearchParam } from './issue-filter-select.tsx';
import { readIssuesPageFilters } from './issues-page-model.ts';
import { NewIssueDialog } from './new-issue-dialog.tsx';
import { useOpenIssue } from './use-open-issue.ts';

const layouts = [
    { icon: ListViewIcon, id: 'list', label: 'List' },
    { icon: KanbanIcon, id: 'board', label: 'Board' },
] as const;

export function IssuesBandControls() {
    const { server } = useServerContext();
    const [params] = useSearchParams();
    const filters = readIssuesPageFilters(params);
    const setParam = useSetSearchParam();
    const openIssue = useOpenIssue();
    const [creating, setCreating] = React.useState(false);
    return (
        <>
            <Segment
                aria-label="Layout"
                onSelectionChange={(key) => setParam('layout', key === 'board' ? 'board' : null)}
                selectedKey={filters.layout}
                size="sm"
            >
                {layouts.map((entry) => (
                    <Tooltip delay={0} key={entry.id}>
                        <Segment.Item aria-label={entry.label} id={entry.id}>
                            <Icon icon={entry.icon} size={16} />
                        </Segment.Item>
                        <Tooltip.Content>{entry.label}</Tooltip.Content>
                    </Tooltip>
                ))}
            </Segment>
            <Button onPress={() => setCreating(true)} size="sm" variant="secondary">
                <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                New issue
            </Button>
            {server.role === 'owner' || server.role === 'admin' ? <IssuesOptions /> : null}
            <NewIssueDialog
                initialProjectId={filters.project}
                onClose={() => setCreating(false)}
                onCreated={(code) => {
                    setCreating(false);
                    openIssue({ code });
                }}
                open={creating}
                serverId={server.id}
            />
        </>
    );
}

function IssuesOptions() {
    const { server } = useServerContext();
    const [labelsOpen, setLabelsOpen] = React.useState(false);
    return (
        <>
            <Dropdown>
                <Button aria-label="Issues options" isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                </Button>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu aria-label="Issues options" onAction={() => setLabelsOpen(true)}>
                        <Dropdown.Item id="labels" textValue="Manage labels">
                            <Icon aria-hidden="true" icon={LabelIcon} size={16} />
                            <Label>Manage labels</Label>
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
            <TaskLabelsDialog onOpenChange={setLabelsOpen} open={labelsOpen} serverId={server.id} />
        </>
    );
}
