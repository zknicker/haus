import type { CloudAgentEnvironment } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, ListBox, Select } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { CloudAgentCapabilityView } from './cloud-agent-capability-model.ts';

export function CloudAgentCapabilityRow({
    isBusy,
    onConnect,
    onDisconnect,
    onSetEnvironment,
    view,
}: {
    isBusy: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSetEnvironment: (environmentId: string) => void;
    view: CloudAgentCapabilityView;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{`${view.providerName} Cloud`}</ItemCard.Title>
                {view.status === 'ready' ? (
                    view.detail ? (
                        <ItemCard.Description>{view.detail}</ItemCard.Description>
                    ) : null
                ) : (
                    <ItemCard.Description>{view.statusLabel}</ItemCard.Description>
                )}
            </ItemCard.Content>
            <RowControl
                isBusy={isBusy}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onSetEnvironment={onSetEnvironment}
                view={view}
            />
        </ItemCard>
    );
}

function RowControl({
    isBusy,
    onConnect,
    onDisconnect,
    onSetEnvironment,
    view,
}: {
    isBusy: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSetEnvironment: (environmentId: string) => void;
    view: CloudAgentCapabilityView;
}) {
    if (view.canDisconnect) {
        return (
            <ItemCard.Action>
                <RowMenu
                    isBusy={isBusy}
                    onConnect={view.canConnect ? onConnect : null}
                    onDisconnect={onDisconnect}
                    providerName={view.providerName}
                />
            </ItemCard.Action>
        );
    }
    if (view.status === 'ready') {
        return view.environments && view.environments.length > 0 ? (
            <ItemCard.Action>
                <EnvironmentSelect
                    environmentId={view.environmentId}
                    environments={view.environments}
                    onChange={onSetEnvironment}
                    providerName={view.providerName}
                />
            </ItemCard.Action>
        ) : null;
    }
    if (!view.canConnect && view.status !== 'connecting') {
        return null;
    }
    return (
        <ItemCard.Action>
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
        </ItemCard.Action>
    );
}

function RowMenu({
    isBusy,
    onConnect,
    onDisconnect,
    providerName,
}: {
    isBusy: boolean;
    onConnect: (() => void) | null;
    onDisconnect: () => void;
    providerName: string;
}) {
    return (
        <Dropdown>
            <Button aria-label={`${providerName} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {onConnect ? (
                        <Dropdown.Item
                            id="connect"
                            isDisabled={isBusy}
                            onAction={onConnect}
                            textValue={`Connect ${providerName} again`}
                        >
                            <Label>Connect again</Label>
                        </Dropdown.Item>
                    ) : null}
                    <Dropdown.Item
                        id="disconnect"
                        isDisabled={isBusy}
                        onAction={onDisconnect}
                        textValue={`Disconnect ${providerName}`}
                        variant="danger"
                    >
                        <Label>Disconnect {providerName}</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function EnvironmentSelect({
    environmentId,
    environments,
    onChange,
    providerName,
}: {
    environmentId: string | null;
    environments: CloudAgentEnvironment[];
    onChange: (environmentId: string) => void;
    providerName: string;
}) {
    return (
        <Select
            aria-label={`${providerName} environment`}
            className="w-48"
            onChange={(value) => onChange(String(value))}
            value={environmentId ?? undefined}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value className="min-w-0 truncate" />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {environments.map((environment) => (
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
    );
}
