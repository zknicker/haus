import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
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
                <ItemCard.Title>
                    1Password
                    <Chip
                        className="ms-2 align-middle"
                        color={statusColor(view.status)}
                        size="sm"
                        variant="soft"
                    >
                        {view.statusLabel}
                    </Chip>
                </ItemCard.Title>
                <ItemCard.Description>{view.description}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    {view.canConnect ? (
                        <Button onPress={onConnect} size="sm" variant="secondary">
                            Connect 1Password
                        </Button>
                    ) : null}
                    {view.canDisconnect ? (
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
                    ) : null}
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}

function statusColor(status: SecretsCapabilityView['status']) {
    switch (status) {
        case 'ready':
            return 'success' as const;
        case 'needs-attention':
            return 'warning' as const;
        case 'not-connected':
        case 'unavailable':
            return 'default' as const;
    }
}
