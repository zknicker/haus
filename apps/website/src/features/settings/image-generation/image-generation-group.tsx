import type { ImageGenerationProviderStatus } from '@haus/api';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    useImageGenerationSettings,
    useRemoveImageGenerationKey,
    useSetImageGenerationKey,
} from '../../../hooks/servers/use-image-generation-settings.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';
import { ImageGenerationKeyDialog } from './image-generation-key-dialog.tsx';
import {
    type KeyAction,
    keyActionLabels,
    modelPriceRange,
    providerKeyActions,
    providerNames,
} from './image-generation-settings-model.ts';

/**
 * The Server Owner's image provider keys, one group per provider: whether its
 * key is stored, and the curated models that key unlocks as read-only rows.
 * Renders nothing for anyone else; the Server refuses the read as well.
 */
export function ImageGenerationSettings({
    isOwner,
    serverId,
}: {
    isOwner: boolean;
    serverId: string;
}) {
    if (!isOwner) {
        return null;
    }
    return <OwnerImageGenerationSettings serverId={serverId} />;
}

function OwnerImageGenerationSettings({ serverId }: { serverId: string }) {
    const settings = useImageGenerationSettings(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Image generation</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {settings.data ? (
                <div className="flex flex-col gap-3">
                    {settings.data.providers.map((status) => (
                        <ProviderGroup key={status.provider} serverId={serverId} status={status} />
                    ))}
                </div>
            ) : (
                <SettingsRowError>{settings.error?.message}</SettingsRowError>
            )}
        </ItemCardGroup>
    );
}

function ProviderGroup({
    serverId,
    status,
}: {
    serverId: string;
    status: ImageGenerationProviderStatus;
}) {
    const [dialog, setDialog] = React.useState<'key' | null>(null);
    const setKey = useSetImageGenerationKey(serverId);
    const removeKey = useRemoveImageGenerationKey(serverId);
    const name = providerNames[status.provider];

    const onAction = (action: KeyAction) => {
        if (action === 'remove') {
            removeKey.mutate({ provider: status.provider, serverId });
        } else {
            setDialog('key');
        }
    };

    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <SettingsRowTitle
                        info={`Agents use your ${name} API key to generate images. The key stays on the Server and is never shown again.`}
                    >
                        {name}
                    </SettingsRowTitle>
                    <SettingsRowError>
                        {setKey.error?.message ?? removeKey.error?.message}
                    </SettingsRowError>
                </ItemCard.Content>
                <ItemCard.Action className="flex items-center gap-2">
                    <SettingsFact>{status.connected ? 'Connected' : 'Not connected'}</SettingsFact>
                    <KeyMenu label={`${name} key actions`} onAction={onAction} status={status} />
                </ItemCard.Action>
            </ItemCard>
            {status.models.map((model) => (
                <React.Fragment key={model.id}>
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>{model.displayName}</ItemCard.Title>
                            <ItemCard.Description>{model.strengths}</ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SettingsFact className="tabular-nums">
                                {modelPriceRange(model)}
                            </SettingsFact>
                        </ItemCard.Action>
                    </ItemCard>
                </React.Fragment>
            ))}
            <ImageGenerationKeyDialog
                onOpenChange={(open) => setDialog(open ? 'key' : null)}
                onSave={async (apiKey) => {
                    await setKey.mutateAsync({ apiKey, provider: status.provider, serverId });
                    setDialog(null);
                }}
                open={dialog === 'key'}
                provider={status.provider}
                replacing={status.connected}
            />
        </ItemCardGroup>
    );
}

function KeyMenu({
    label,
    onAction,
    status,
}: {
    label: string;
    onAction: (action: KeyAction) => void;
    status: Pick<ImageGenerationProviderStatus, 'connected'>;
}) {
    return (
        <Dropdown>
            <Button aria-label={label} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {providerKeyActions(status).map((action) => (
                        <Dropdown.Item
                            id={action}
                            key={action}
                            onAction={() => onAction(action)}
                            textValue={keyActionLabels[action]}
                            variant={action === 'remove' ? 'danger' : undefined}
                        >
                            <Label>{keyActionLabels[action]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
