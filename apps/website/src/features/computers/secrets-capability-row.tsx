import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { SecretsCapabilityView } from './secrets-capability-model.ts';

export function SecretsCapabilityRow({
    isBusy,
    onConnect,
    onDisconnect,
    onRefresh,
    view,
}: {
    isBusy: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onRefresh: () => void;
    view: SecretsCapabilityView;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>1Password</ItemCard.Title>
                {view.status === 'ready' ? (
                    <ItemCard.Description>{view.detail}</ItemCard.Description>
                ) : (
                    <ItemCard.Description>
                        {view.detail ? `${view.statusLabel} · ${view.detail}` : view.statusLabel}
                    </ItemCard.Description>
                )}
            </ItemCard.Content>
            {view.canConnect ? (
                <ItemCard.Action>
                    <Button onPress={onConnect} size="sm" variant="secondary">
                        Connect
                    </Button>
                </ItemCard.Action>
            ) : null}
            {view.canDisconnect ? (
                <ItemCard.Action>
                    <Dropdown>
                        <Button
                            aria-label="1Password actions"
                            isIconOnly
                            isPending={isBusy}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                                onAction={(key) => {
                                    if (key === 'refresh') {
                                        onRefresh();
                                    } else if (key === 'disconnect') {
                                        onDisconnect();
                                    }
                                }}
                            >
                                {view.canRefresh ? (
                                    <Dropdown.Item
                                        id="refresh"
                                        isDisabled={isBusy}
                                        textValue="Refresh items"
                                    >
                                        <Label>Refresh items</Label>
                                    </Dropdown.Item>
                                ) : null}
                                <Dropdown.Item
                                    id="disconnect"
                                    isDisabled={isBusy}
                                    textValue="Disconnect 1Password"
                                    variant="danger"
                                >
                                    <Label>Disconnect 1Password</Label>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}
