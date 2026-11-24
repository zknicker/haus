import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import type { BrowserCapabilityView } from '../../computers/browser-capability-model.ts';

type BrowserSettings = AgentRuntimeBrowserSettings;

export function BrowserRow({
    isSaving,
    onConfigure,
    onToggle,
    settings,
    view,
}: {
    isSaving: boolean;
    onConfigure: () => void;
    onToggle: (enabled: boolean) => void;
    settings: BrowserSettings;
    view: BrowserCapabilityView;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <BrowserStatusTitle view={view} />
            </ItemCard.Content>
            <ItemCard.Action>
                {settings.configured ? (
                    <BrowserActionsMenu
                        isSaving={isSaving}
                        onConfigure={onConfigure}
                        onToggle={onToggle}
                        view={view}
                    />
                ) : (
                    <Button
                        isDisabled={isSaving || !view.canConfigure}
                        onPress={onConfigure}
                        size="sm"
                        variant="secondary"
                    >
                        Configure
                    </Button>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

function BrowserActionsMenu({
    isSaving,
    onConfigure,
    onToggle,
    view,
}: {
    isSaving: boolean;
    onConfigure: () => void;
    onToggle: (enabled: boolean) => void;
    view: BrowserCapabilityView;
}) {
    return (
        <Dropdown>
            <Button aria-label="Chrome actions" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item
                        id="configure"
                        isDisabled={isSaving}
                        onAction={onConfigure}
                        textValue="Configure Chrome"
                    >
                        <Label>Configure</Label>
                    </Dropdown.Item>
                    {view.canEnable ? (
                        <Dropdown.Item
                            id="enable"
                            isDisabled={isSaving}
                            onAction={() => onToggle(true)}
                            textValue="Connect browser"
                        >
                            <Label>Connect browser</Label>
                        </Dropdown.Item>
                    ) : null}
                    {view.canDisable ? (
                        <Dropdown.Item
                            id="disable"
                            isDisabled={isSaving}
                            onAction={() => onToggle(false)}
                            textValue="Disconnect browser"
                        >
                            <Label>Disconnect browser</Label>
                        </Dropdown.Item>
                    ) : null}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

export function BrowserStatusTitle({ view }: { view: BrowserCapabilityView }) {
    return (
        <>
            <ItemCard.Title>Chrome</ItemCard.Title>
            {view.status === 'ready' ? (
                view.detail ? (
                    <ItemCard.Description>{view.detail}</ItemCard.Description>
                ) : null
            ) : (
                <ItemCard.Description>{view.statusLabel}</ItemCard.Description>
            )}
        </>
    );
}
