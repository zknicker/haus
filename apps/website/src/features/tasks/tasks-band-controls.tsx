import { Button, Dropdown, Label } from '@heroui/react';
import { LabelIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { TaskLabelsDialog } from './details/task-labels-dialog.tsx';

/**
 * The Tasks page band's end: the rare actions behind one menu. Today that is
 * the Server's label catalog, which only an owner or admin manages; nobody
 * else gets a menu at all.
 */
export function TasksBandControls() {
    const { server } = useServerContext();
    const [labelsOpen, setLabelsOpen] = React.useState(false);
    if (server.role !== 'owner' && server.role !== 'admin') {
        return null;
    }
    return (
        <>
            <Dropdown>
                <Button aria-label="Tasks options" isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                </Button>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu aria-label="Tasks options" onAction={() => setLabelsOpen(true)}>
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
