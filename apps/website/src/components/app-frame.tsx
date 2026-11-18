import { Outlet } from 'react-router-dom';
import { useDesktopHistoryNavigation } from '../hooks/desktop/use-desktop-menu-navigation.ts';
import { useDesktopWindowCommands } from '../hooks/desktop/use-desktop-window-commands.ts';

export function AppFrame() {
    useDesktopHistoryNavigation();
    useDesktopWindowCommands();

    return (
        <div className="app-window-shell min-h-screen">
            <Outlet />
        </div>
    );
}
