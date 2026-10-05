import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    AppWindowIcon,
    ArrowRightDoubleIcon,
    Cancel01Icon,
    CancelSquareIcon,
    Copy01Icon,
    LayoutTwoColumnIcon,
    Link01Icon,
    PlusSignIcon,
    ReloadIcon,
    SquareArrowUpRight02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { WorkspaceTabMenuModel } from './use-workspace-tab-menu.ts';

/**
 * The tab menu's own items: opening and the page itself, (the chat's submenu
 * goes here), where the tab lives, then closing. Render inside a
 * `ContextMenu.Menu` whose `onAction` runs `model.run`.
 */
export function WorkspaceTabPageItems({ model }: { model: WorkspaceTabMenuModel }) {
    return (
        <>
            <TabItem icon={PlusSignIcon} id="new-tab-right" label="New tab to the right" />
            <TabItem icon={Copy01Icon} id="duplicate" label="Duplicate" />
            {model.hasLink ? <TabItem icon={Link01Icon} id="copy-link" label="Copy link" /> : null}
            {model.hasWebPage ? (
                <>
                    <TabItem icon={ReloadIcon} id="reload" label="Reload" />
                    <TabItem
                        icon={SquareArrowUpRight02Icon}
                        id="open-external"
                        label="Open in default browser"
                    />
                </>
            ) : null}
        </>
    );
}

/** Where the tabs live, then closing them. */
export function WorkspaceTabPlaceItems({ model }: { model: WorkspaceTabMenuModel }) {
    const { many, move } = model;
    return (
        <>
            {move ? <TabItem icon={LayoutTwoColumnIcon} id="move" label={move.label} /> : null}
            <TabItem
                disabled={!model.canMoveToNewWindow}
                icon={AppWindowIcon}
                id="new-window"
                label={many ? 'Move tabs to new window' : 'Move to new window'}
            />
            <ContextMenu.Separator />
            <TabItem icon={Cancel01Icon} id="close" label={many ? 'Close tabs' : 'Close tab'} />
            {model.canCloseOthers ? (
                <TabItem icon={CancelSquareIcon} id="close-others" label="Close other tabs" />
            ) : null}
            <TabItem
                disabled={!model.canCloseRight}
                icon={ArrowRightDoubleIcon}
                id="close-right"
                label="Close tabs to the right"
            />
        </>
    );
}

function TabItem({
    disabled = false,
    icon,
    id,
    label,
}: {
    disabled?: boolean;
    icon: React.ComponentProps<typeof Icon>['icon'];
    id: string;
    label: string;
}) {
    return (
        <ContextMenu.Item id={id} isDisabled={disabled} textValue={label}>
            <Icon aria-hidden="true" icon={icon} size={16} />
            <Label>{label}</Label>
        </ContextMenu.Item>
    );
}
