import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, ListBox, Select } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import type { CloudAgentCapabilityView } from './cloud-agent-capability-model.ts';

export function CloudAgentCapabilityRow({
    isBusy,
    onConnect,
    onDisconnect,
    onSetEnvironment,
    view,
}: {
    /** A disconnect is in flight, so the row menu waits for it. */
    isBusy: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSetEnvironment: (environmentId: string) => void;
    view: CloudAgentCapabilityView;
}) {
    const title = view.providerName;
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsStatusTitle
                    info={view.description}
                    infoLabel={`About ${title}`}
                    status={
                        <SettingsStatusChip color={statusColor(view.status)}>
                            {view.statusLabel}
                        </SettingsStatusChip>
                    }
                >
                    {`${title} Cloud`}
                </SettingsStatusTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    {view.environments === null || view.environments.length === 0 ? null : (
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted text-sm">Environment</span>
                            <Select
                                aria-label={`${title} environment`}
                                className="w-48"
                                onChange={(value) => onSetEnvironment(String(value))}
                                value={view.environmentId ?? undefined}
                                variant="secondary"
                            >
                                <Select.Trigger>
                                    <Select.Value className="min-w-0 truncate" />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {view.environments.map((environment) => (
                                            <ListBox.Item
                                                id={environment.id}
                                                key={environment.id}
                                                textValue={environment.name}
                                            >
                                                <Label>{environment.name}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                        </div>
                    )}
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
                    {view.canDisconnect ? (
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
                                    <Dropdown.Item
                                        id="disconnect"
                                        isDisabled={isBusy}
                                        onAction={onDisconnect}
                                        textValue={`Disconnect ${view.providerName}`}
                                        variant="danger"
                                    >
                                        <Label>Disconnect {view.providerName}</Label>
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
