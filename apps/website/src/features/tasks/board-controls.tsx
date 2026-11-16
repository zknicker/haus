import { type Board, GENERAL_BOARD_KEY } from '@haus/api';
import { Button, Dropdown, Label, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react';
import {
    Archive01Icon,
    GridViewIcon,
    LabelIcon,
    ListViewIcon,
    MoreHorizontalIcon,
    Settings02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useBoard } from '../../hooks/boards/use-board.ts';
import { useServerContext } from '../servers/server-context.ts';
import { ArchiveBoardDialog } from './archive-board-dialog.tsx';
import { BoardSettingsDialog } from './board-settings-dialog.tsx';
import type { BoardLayout } from './board-view.ts';
import { NewTaskButton } from './new-task-dialog.tsx';
import { TaskLabelsDialog } from './task-labels-dialog.tsx';
import { useBoardView } from './use-board-view.ts';

const boardLayouts: readonly { icon: typeof GridViewIcon; id: BoardLayout; label: string }[] = [
    { icon: GridViewIcon, id: 'board', label: 'Board' },
    { icon: ListViewIcon, id: 'list', label: 'List' },
];

type BoardDialog = 'archive' | 'labels' | 'settings';

/** The band's end for a board: the lens, New task, and the rare actions behind one menu. */
export function BoardControls({ boardKey }: { boardKey: string }) {
    const { server } = useServerContext();
    const board = useBoard(server.id, boardKey);
    if (!board) {
        return null;
    }
    return (
        <>
            <BoardLayoutToggle />
            <NewTaskButton board={board} />
            <BoardOptions board={board} />
        </>
    );
}

function BoardLayoutToggle() {
    const { layout, setLayout } = useBoardView();
    return (
        <ToggleButtonGroup
            aria-label="Board layout"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const next = boardLayouts.find((entry) => keys.has(entry.id));
                if (next) {
                    setLayout(next.id);
                }
            }}
            selectedKeys={[layout]}
            selectionMode="single"
            size="sm"
        >
            {boardLayouts.map((entry, index) => (
                <Tooltip delay={0} key={entry.id}>
                    <ToggleButton aria-label={entry.label} id={entry.id} isIconOnly>
                        {index > 0 ? <ToggleButtonGroup.Separator /> : null}
                        <Icon icon={entry.icon} size={16} />
                    </ToggleButton>
                    <Tooltip.Content>{entry.label}</Tooltip.Content>
                </Tooltip>
            ))}
        </ToggleButtonGroup>
    );
}

function BoardOptions({ board }: { board: Board }) {
    const { server } = useServerContext();
    const [dialog, setDialog] = React.useState<BoardDialog | null>(null);
    const canManageLabels = server.role === 'owner' || server.role === 'admin';
    const close = (open: boolean) => {
        if (!open) {
            setDialog(null);
        }
    };

    return (
        <>
            <Dropdown>
                <Button aria-label="Board options" isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                </Button>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                        aria-label="Board options"
                        onAction={(key) => setDialog(key as BoardDialog)}
                    >
                        <Dropdown.Item id="settings" textValue="Board settings">
                            <Icon aria-hidden="true" icon={Settings02Icon} size={16} />
                            <Label>Board settings</Label>
                        </Dropdown.Item>
                        {canManageLabels ? (
                            <Dropdown.Item id="labels" textValue="Manage labels">
                                <Icon aria-hidden="true" icon={LabelIcon} size={16} />
                                <Label>Manage labels</Label>
                            </Dropdown.Item>
                        ) : null}
                        {board.key === GENERAL_BOARD_KEY ? null : (
                            <Dropdown.Item id="archive" textValue="Archive board" variant="danger">
                                <Icon aria-hidden="true" icon={Archive01Icon} size={16} />
                                <Label>Archive board</Label>
                            </Dropdown.Item>
                        )}
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
            <BoardSettingsDialog board={board} onOpenChange={close} open={dialog === 'settings'} />
            <TaskLabelsDialog
                onOpenChange={close}
                open={dialog === 'labels'}
                serverId={server.id}
            />
            <ArchiveBoardDialog board={board} isOpen={dialog === 'archive'} onOpenChange={close} />
        </>
    );
}
