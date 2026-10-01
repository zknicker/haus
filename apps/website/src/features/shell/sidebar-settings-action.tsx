import { Button, Kbd, Tooltip } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { ArrowLeft01Icon, Settings01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/**
 * The sidebar's one piece of chrome: Settings, and nothing else. Server
 * identity moved out of the sidebar's navigation entirely, so what is left is a
 * single quiet action with no row to justify.
 *
 * Where it lands is the shell's business (`ShellSidebar`'s `settingsSlot`):
 * the leading end of the sidebar footer on the desktop, where the window band
 * stays for tabs and layout controls; the trailing end of the titlebar strip on
 * the web. This owns the button and none of its placement or glyph rank — the
 * strip sizes it against the Haus mark, the footer leaves it at the status
 * marks' size. `shortcut` names the key that opens Settings where one exists.
 */
export function SidebarSettingsAction({
    onOpenSettings,
    onPreloadSettings,
    shortcut,
}: {
    onOpenSettings: () => void;
    onPreloadSettings: () => void;
    shortcut?: string;
}) {
    return (
        <Tooltip>
            <Button
                aria-label="Settings"
                className="sidebar-settings-action"
                isIconOnly
                onHoverStart={onPreloadSettings}
                onPress={onOpenSettings}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" className="text-muted" icon={Settings01Icon} />
            </Button>
            <Tooltip.Content>
                Settings
                {shortcut ? <Kbd>{shortcut}</Kbd> : null}
            </Tooltip.Content>
        </Tooltip>
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
