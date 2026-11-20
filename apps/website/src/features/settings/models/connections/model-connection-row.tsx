import { type ModelConnection, providerSearchesWeb } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, Switch } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../../components/ui/icon.tsx';
import { useModelConnectionEdits } from '../../../../hooks/servers/use-model-connections.ts';
import { UsageMeter } from '../../../usage/detected-runtime-usage.tsx';
import { SettingsRowTitle } from '../../layout/settings-row-title.tsx';
import { SettingsFact, SettingsRowError } from '../../layout/settings-text.tsx';
import { ConnectDialog } from './connect-dialog.tsx';
import {
    type ConnectionAction,
    connectionActionLabels,
    connectionActions,
    connectionErrorMessage,
    connectionFact,
    connectionFailure,
} from './model-connection-model.ts';
import { RenameConnectionDialog } from './rename-connection-dialog.tsx';

export function ModelConnectionRow({
    connection,
    isOwner,
    serverId,
    siblingLabels,
}: {
    connection: ModelConnection;
    isOwner: boolean;
    serverId: string;
    siblingLabels: readonly string[];
}) {
    const [dialog, setDialog] = React.useState<'reconnect' | 'rename' | null>(null);
    const edits = useModelConnectionEdits(serverId);
    const target = { connectionId: connection.id, serverId };
    const failedEdit = [edits.makeDefault, edits.remove, edits.setWebSearch].find(
        (mutation) => mutation.error
    )?.error;

    const onAction = (action: ConnectionAction) => {
        if (action === 'make-default') {
            edits.makeDefault.mutate(target);
        } else if (action === 'remove') {
            edits.remove.mutate(target);
        } else {
            setDialog(action);
        }
    };

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={authKindInfo[connection.authKind]}>
                    {connection.label}
                </SettingsRowTitle>
                <ConnectionCapacity connection={connection} />
                <SettingsRowError>{connectionFailure(connection)}</SettingsRowError>
                <SettingsRowError>
                    {failedEdit ? connectionErrorMessage(failedEdit) : null}
                </SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-3">
                <SettingsFact>{connectionFact(connection)}</SettingsFact>
                {providerSearchesWeb(connection.provider) ? (
                    <Switch
                        aria-label={`Web search for ${connection.label}`}
                        isDisabled={!isOwner || edits.setWebSearch.isPending}
                        isSelected={
                            edits.setWebSearch.isPending
                                ? edits.setWebSearch.variables.enabled
                                : connection.webSearch
                        }
                        onChange={(enabled) => edits.setWebSearch.mutate({ ...target, enabled })}
                        size="sm"
                    >
                        <Switch.Content className="text-sm">
                            Web search
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch.Content>
                    </Switch>
                ) : null}
                {isOwner ? (
                    <ConnectionMenu
                        actions={connectionActions(connection)}
                        label={`${connection.label} actions`}
                        onAction={onAction}
                    />
                ) : null}
            </ItemCard.Action>
            {dialog === 'rename' ? (
                <RenameConnectionDialog
                    connection={connection}
                    onClose={() => setDialog(null)}
                    serverId={serverId}
                />
            ) : null}
            {dialog === 'reconnect' ? (
                <ConnectDialog
                    onClose={() => setDialog(null)}
                    provider={connection.provider}
                    replacing={connection}
                    serverId={serverId}
                    takenLabels={siblingLabels}
                />
            ) : null}
        </ItemCard>
    );
}

export function ConnectionCapacity({ connection }: { connection: ModelConnection }) {
    if (!connection.capacity?.length) {
        return null;
    }
    return (
        <div className="mt-2 grid gap-1.5">
            {connection.capacity.map((window) => (
                <div className="flex items-center gap-3" key={window.id}>
                    <span className="text-muted w-24 shrink-0 text-xs">{window.label}</span>
                    <UsageMeter label={`${connection.label} ${window.label}`} window={window} />
                </div>
            ))}
        </div>
    );
}

function ConnectionMenu({
    actions,
    label,
    onAction,
}: {
    actions: readonly ConnectionAction[];
    label: string;
    onAction: (action: ConnectionAction) => void;
}) {
    return (
        <Dropdown>
            <Button aria-label={label} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {actions.map((action) => (
                        <Dropdown.Item
                            id={action}
                            key={action}
                            onAction={() => onAction(action)}
                            textValue={connectionActionLabels[action]}
                            variant={action === 'remove' ? 'danger' : undefined}
                        >
                            <Label>{connectionActionLabels[action]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

const authKindInfo: Record<ModelConnection['authKind'], string> = {
    'api-key': 'A pasted API key. The Server keeps it encrypted and never shows it again.',
    oauth: 'Signed in with a device code. The Server keeps the login encrypted and refreshes it.',
    'setup-token': 'A pasted setup token. The Server keeps it encrypted and never shows it again.',
};
