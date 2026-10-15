import { Toolbar } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { usePaneHistory } from '../../hooks/desktop-tabs/use-pane-history.ts';
import { useWebHistory } from '../../hooks/shell/use-web-history.ts';
import { PageToolbarButton } from './page-toolbar.tsx';

interface History {
    back: () => void;
    canGoBack: boolean;
    canGoForward: boolean;
    forward: () => void;
}

/**
 * The web's Back and Forward, leading the shell band on every surface. They
 * step the browser tab's own history, as its toolbar buttons would.
 */
export function WebHistoryButtons() {
    return <HistoryButtons history={useWebHistory()} />;
}

/**
 * One desktop pane's Back and Forward, leading that pane's tab row. They step
 * the pane's shown tab and follow it across tab switches, so they sit in the
 * same place over a chat (which has no band) and every other page.
 */
export function PaneHistoryButtons({ pane }: { pane: PaneSide }) {
    return <HistoryButtons history={usePaneHistory(pane)} />;
}

function HistoryButtons({ history }: { history: History }) {
    const mac = isMac();
    return (
        <Toolbar aria-label="History" className="shrink-0">
            <PageToolbarButton
                icon={<Icon icon={ArrowLeft01Icon} size={16} />}
                isDisabled={!history.canGoBack}
                label="Back"
                onPress={history.back}
                shortcut={mac ? '⌘[' : undefined}
            />
            <PageToolbarButton
                icon={<Icon icon={ArrowRight01Icon} size={16} />}
                isDisabled={!history.canGoForward}
                label="Forward"
                onPress={history.forward}
                shortcut={mac ? '⌘]' : undefined}
            />
        </Toolbar>
    );
}

function isMac() {
    return typeof navigator !== 'undefined' && /Mac/u.test(navigator.platform);
}
