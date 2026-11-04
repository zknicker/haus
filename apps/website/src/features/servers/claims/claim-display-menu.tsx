import { Button, Popover } from '@heroui/react';
import { Segment } from '@heroui-pro/react';
import { PreferenceHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useClaimView } from './claim-view.ts';

/**
 * How the list is drawn, as opposed to what it contains. Today that is just
 * the lens — list or board — but it is the home every later display option
 * (grouping, ordering, visible properties) belongs in, rather than growing
 * more permanent buttons across the topbar.
 */
export function ClaimDisplayMenu() {
    const { layout, setLayout } = useClaimView();

    return (
        <Popover>
            <Button aria-label="Display options" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={PreferenceHorizontalIcon} size={16} />
            </Button>
            <Popover.Content className="w-64 p-3" placement="bottom end">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-muted text-sm">Lens</span>
                    <Segment
                        aria-label="Task layout"
                        onSelectionChange={(key) => {
                            if (key === 'board' || key === 'list') {
                                setLayout(key);
                            }
                        }}
                        selectedKey={layout}
                        size="sm"
                    >
                        <Segment.Item id="list">List</Segment.Item>
                        <Segment.Item id="board">Board</Segment.Item>
                    </Segment>
                </div>
            </Popover.Content>
        </Popover>
    );
}
