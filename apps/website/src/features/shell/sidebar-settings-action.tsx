import { Button, Tooltip } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { ArrowLeft01Icon, Settings01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { shellBandIconSize } from './section-header.tsx';

/**
 * The sidebar's one piece of chrome: Settings, and nothing else. Server
 * identity moved out of the sidebar's navigation entirely, so what is left is a
 * single quiet action with no row to justify.
 *
 * So it takes none, on any surface. It rides the trailing end of the titlebar
 * strip (`sidebar-titlebar-strip.tsx`), opposite the Haus mark — beside the
 * traffic lights on the macOS desktop, in the same corner on the web. The
 * sidebar footer holds live Agent activity and the desktop update status, and
 * stays wired as the gear's other slot. `ShellSidebar` picks it; where the gear
 * lands is the shell's business, not this action's, so this owns the button and
 * none of its placement.
 */
export function SidebarSettingsAction({
    onOpenSettings,
    onPreloadSettings,
}: {
    onOpenSettings: () => void;
    onPreloadSettings: () => void;
}) {
    return (
        // `app-shell-band` is the glyph rank, not a box: the gear shares its
        // line with the 22px Haus mark and is sized against it.
        <div className="app-shell-band flex items-center">
            <Tooltip>
                <Button
                    aria-label="Settings"
                    isIconOnly
                    onHoverStart={onPreloadSettings}
                    onPress={onOpenSettings}
                    size="sm"
                    variant="ghost"
                >
                    <Icon
                        aria-hidden="true"
                        className="text-muted"
                        icon={Settings01Icon}
                        size={shellBandIconSize}
                    />
                </Button>
                <Tooltip.Content>Settings</Tooltip.Content>
            </Tooltip>
        </div>
    );
}

/**
 * Escape hatch for sidebar pages that replace the chat navigation (settings,
 * tasks, members, computers): one quiet row back to the last-open chat.
 *
 * It leads those pages the way Inbox leads the chat navigation, taking the
 * same half-band offset so both land on one line whichever page is mounted.
 * The stock `Sidebar.Group` is what puts it on the same leading edge and width
 * as the settings rows it sits above.
 */
export function SidebarBackToChatRow({ route }: { route: string }) {
    return (
        <Sidebar.Group>
            <Sidebar.Menu aria-label="Back to chat">
                <Sidebar.MenuItem
                    aria-label="Back to chat"
                    href={route}
                    id="back-to-chat"
                    textValue="Back"
                >
                    <Sidebar.MenuIcon>
                        <Icon aria-hidden="true" icon={ArrowLeft01Icon} />
                    </Sidebar.MenuIcon>
                    <Sidebar.MenuItemContent>
                        <Sidebar.MenuLabel>Back</Sidebar.MenuLabel>
                    </Sidebar.MenuItemContent>
                </Sidebar.MenuItem>
            </Sidebar.Menu>
        </Sidebar.Group>
    );
}
