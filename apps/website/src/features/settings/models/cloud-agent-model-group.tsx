import { Button, Description, Label, ListBox, Select, Tooltip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    useCloudAgentSettings,
    useSetCloudAgentModel,
} from '../../../hooks/servers/use-cloud-agent-settings.ts';
import { formatRelativeTime } from '../../../lib/format.ts';
import { SettingsFact, SettingsRowError, SettingsRowWarning } from '../layout/settings-text.tsx';
import {
    type CloudAgentModelView,
    cloudAgentModelView,
    modelSettingForKey,
} from './cloud-agent-model.ts';

/**
 * The Server-wide model every Cursor Cloud Agent launch uses. Owners and
 * Admins pick it; everyone else reads it.
 */
export function CloudAgentModelGroup({
    canManage,
    serverId,
}: {
    canManage: boolean;
    serverId: string;
}) {
    const settings = useCloudAgentSettings(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Cloud Agents</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {settings.data ? (
                    <CloudAgentModelRow
                        canManage={canManage}
                        serverId={serverId}
                        view={cloudAgentModelView(settings.data)}
                    />
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Model</ItemCard.Title>
                            <SettingsRowError>{settings.error?.message}</SettingsRowError>
                        </ItemCard.Content>
                    </ItemCard>
                )}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function CloudAgentModelRow({
    canManage,
    serverId,
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelView;
}) {
    const setModel = useSetCloudAgentModel(serverId);

    return (
        <ItemCard>
            <ItemCard.Content>
                <div className="flex items-center gap-0.5">
                    <ItemCard.Title>Model</ItemCard.Title>
                    <ModelInfo view={view} />
                </div>
                <ModelDetail view={view} />
                <SettingsRowError>{setModel.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                {canManage ? (
                    <Select
                        aria-label="Cloud Agent model"
                        className="w-56"
                        disabledKeys={view.options
                            .filter((option) => option.unavailable)
                            .map((option) => option.id)}
                        isDisabled={!view.pickable}
                        onChange={(key) => {
                            const model = modelSettingForKey(key, view);
                            if (model && key !== view.selectedKey) {
                                setModel.mutate({ model, serverId });
                            }
                        }}
                        value={view.selectedKey}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {view.options.map((option) => (
                                    <ListBox.Item
                                        id={option.id}
                                        key={option.id}
                                        textValue={option.label}
                                    >
                                        <Label>{option.label}</Label>
                                        {option.unavailable ? (
                                            <Description>Unavailable</Description>
                                        ) : option.description ? (
                                            <Description>{option.description}</Description>
                                        ) : null}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                ) : (
                    <SettingsFact
                        className={view.state === 'unavailable' ? 'text-warning' : undefined}
                    >
                        {view.selectedLabel}
                    </SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

/** One line under the title: the warning when there is one, else freshness. */
function ModelDetail({ view }: { view: CloudAgentModelView }) {
    if (view.state === 'unavailable') {
        return (
            <SettingsRowWarning>
                Unavailable. Runs use Cursor default until you pick an available model.
            </SettingsRowWarning>
        );
    }
    return view.refreshedAt ? (
        <ItemCard.Description>Updated {formatRelativeTime(view.refreshedAt)}</ItemCard.Description>
    ) : null;
}

function ModelInfo({ view }: { view: CloudAgentModelView }) {
    return (
        <Tooltip delay={0}>
            <Button aria-label="About the Cloud Agent model" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={InformationCircleIcon} size={14} />
            </Button>
            <Tooltip.Content>
                {view.catalogMissing
                    ? 'Models appear once a Computer with Cursor connected reports them.'
                    : "Every Cloud Agent on this Server uses this model. Cursor default uses your Cursor account's default model (Auto unless you've changed it)."}
            </Tooltip.Content>
        </Tooltip>
    );
}
