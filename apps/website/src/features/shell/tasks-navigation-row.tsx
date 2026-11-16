import type { Board } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { Plus } from '@hugeicons/core-free-icons';
import { Icon } from '../../components/ui/icon.tsx';
import { useBoards } from '../../hooks/boards/use-boards.ts';
import { usePreloadBoard } from '../../hooks/boards/use-preload-board.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { boardRoute, tasksRoute } from '../servers/server-routes.ts';
import { RouteTabIcon } from './route-tab-presentation.tsx';

/** The Tree key the sidebar's menu expands while a Tasks page is open. */
export const tasksRowKey = 'tasks';
export const newBoardRowKey = 'new-board';

/**
 * The sidebar's one Tasks row (ADR 0051): it opens the last board, and while a
 * Tasks page is open it expands to every board and New board. The menu derives
 * that from the route and passes no toggle, so the row has no chevron and
 * nothing else can open it.
 *
 * The boards read only under the expanded row, so a sidebar on any other page
 * asks for nothing; hovering the row warms the code and the list.
 */
export function TasksNavigationRow({
    boardKey,
    isExpanded,
    onPreload,
    serverId,
    slug,
}: {
    /** The board in the route, marked current in the submenu. */
    boardKey: null | string;
    isExpanded: boolean;
    onPreload: () => void;
    serverId: string;
    slug: string;
}) {
    const href = tasksRoute(slug);
    const preloadBoards = usePreloadBoard(serverId);
    const preload = () => {
        onPreload();
        preloadBoards();
    };
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);

    return (
        <Sidebar.MenuItem
            href={href}
            id={tasksRowKey}
            isCurrent={isExpanded && boardKey === null}
            onHoverStart={preload}
            ref={pressRef}
            textValue="Tasks"
        >
            <Sidebar.MenuIcon>
                <RouteTabIcon size={16} tab="tasks" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel>Tasks</Sidebar.MenuLabel>
            </Sidebar.MenuItemContent>
            <Sidebar.Submenu>
                {isExpanded ? (
                    <BoardRows boardKey={boardKey} serverId={serverId} slug={slug} />
                ) : null}
            </Sidebar.Submenu>
        </Sidebar.MenuItem>
    );
}

function BoardRows({
    boardKey,
    serverId,
    slug,
}: {
    boardKey: null | string;
    serverId: string;
    slug: string;
}) {
    const boards = useBoards(serverId).data ?? [];

    return (
        <>
            {boards.map((board) => (
                <BoardRow
                    board={board}
                    isCurrent={board.key === boardKey}
                    key={board.id}
                    slug={slug}
                />
            ))}
            <Sidebar.MenuItem id={newBoardRowKey} textValue="New board">
                <Sidebar.MenuIcon>
                    <Icon aria-hidden="true" icon={Plus} size={16} />
                </Sidebar.MenuIcon>
                <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel>New board</Sidebar.MenuLabel>
                </Sidebar.MenuItemContent>
            </Sidebar.MenuItem>
        </>
    );
}

function BoardRow({ board, isCurrent, slug }: { board: Board; isCurrent: boolean; slug: string }) {
    const href = boardRoute(slug, board.key);
    const preload = usePreloadBoard(board.serverId, board.id);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);

    return (
        <Sidebar.MenuItem
            href={href}
            id={`board:${board.id}`}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={pressRef}
            textValue={board.name}
        >
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel>{board.name}</Sidebar.MenuLabel>
                <Sidebar.MenuChip>{board.openTaskCount}</Sidebar.MenuChip>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}
