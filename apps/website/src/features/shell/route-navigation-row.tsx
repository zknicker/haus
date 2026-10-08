import { Sidebar } from '@heroui-pro/react';
import { usePressNavigation } from '../../hooks/shell/use-press-navigation.ts';
import { RouteTabIcon } from './route-tab-presentation.tsx';

/**
 * A Server section in the sidebar's lead menu (Tasks, Activity): the route's
 * glyph and name, opened on a plain mouse press like the Chat rows.
 */
export function RouteNavigationRow({
    href,
    isCurrent,
    label,
    onPreload,
    tab,
}: {
    href: string;
    isCurrent: boolean;
    label: string;
    onPreload: () => void;
    tab: 'activity' | 'tasks';
}) {
    const pressRef = usePressNavigation(href, onPreload);

    return (
        <Sidebar.MenuItem
            href={href}
            id={tab}
            isCurrent={isCurrent}
            onHoverStart={onPreload}
            ref={pressRef}
            textValue={label}
        >
            <Sidebar.MenuIcon>
                <RouteTabIcon size={16} tab={tab} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel>{label}</Sidebar.MenuLabel>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}
