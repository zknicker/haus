import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { CloudAgentCapabilityView } from './cloud-agent-capability-model.ts';

export function CloudAgentCapabilityRow({
    isDisconnecting,
    onConnect,
    onDisconnect,
    view,
}: {
    isDisconnecting: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    view: CloudAgentCapabilityView;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>
                    Cursor Cloud Agents
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
                    {view.status === 'ready' ? null : (
                        <Button
                            isDisabled={!view.canConnect}
                            isPending={view.status === 'connecting' && !view.canConnect}
                            onPress={onConnect}
                            size="sm"
                            variant="secondary"
                        >
                            {view.status === 'connecting' && view.canConnect
                                ? 'Continue sign-in'
                                : 'Connect'}
                        </Button>
                    )}
                    {view.canDisconnect ? (
                        <Dropdown>
                            <Button
                                aria-label="Cursor Cloud Agents actions"
                                isIconOnly
                                size="sm"
                                variant="ghost"
                            >
                                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                            </Button>
                            <Dropdown.Popover placement="bottom end">
                                <Dropdown.Menu>
                                    <Dropdown.Item
                                        id="disconnect"
                                        isDisabled={isDisconnecting}
                                        onAction={onDisconnect}
                                        textValue="Disconnect Cursor"
                                        variant="danger"
                                    >
                                        <Label>Disconnect Cursor</Label>
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

function statusColor(status: CloudAgentCapabilityView['status']) {
    switch (status) {
        case 'ready':
            return 'success' as const;
        case 'connecting':
            return 'accent' as const;
        case 'not-connected':
            return 'warning' as const;
        case 'unavailable':
            return 'default' as const;
    }
}
