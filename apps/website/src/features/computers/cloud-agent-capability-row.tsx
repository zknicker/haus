import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { CloudAgentCapabilityView } from './cloud-agent-capability-model.ts';

export function CloudAgentCapabilityRow({
    isBusy,
    onConnect,
    onDisconnect,
    onMakeDefault,
    view,
}: {
    /** A disconnect or default change is in flight, so the row menu waits for it. */
    isBusy: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onMakeDefault: () => void;
    view: CloudAgentCapabilityView;
}) {
    const title = `${view.providerName} Cloud Agents`;
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>
                    {title}
                    {view.isDefault ? (
                        <Chip className="ms-2 align-middle" size="sm" variant="soft">
                            Default
                        </Chip>
                    ) : null}
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
                                : view.connectLabel}
                        </Button>
                    )}
                    {view.canDisconnect || view.canMakeDefault ? (
                        <Dropdown>
                            <Button
                                aria-label={`${title} actions`}
                                isIconOnly
                                size="sm"
                                variant="ghost"
                            >
                                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                            </Button>
                            <Dropdown.Popover placement="bottom end">
                                <Dropdown.Menu>
                                    {view.canMakeDefault ? (
                                        <Dropdown.Item
                                            id="make-default"
                                            isDisabled={isBusy}
                                            onAction={onMakeDefault}
                                            textValue="Make default"
                                        >
                                            <Label>Make default</Label>
                                        </Dropdown.Item>
                                    ) : null}
                                    {view.canDisconnect ? (
                                        <Dropdown.Item
                                            id="disconnect"
                                            isDisabled={isBusy}
                                            onAction={onDisconnect}
                                            textValue={`Disconnect ${view.providerName}`}
                                            variant="danger"
                                        >
                                            <Label>Disconnect {view.providerName}</Label>
                                        </Dropdown.Item>
                                    ) : null}
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
