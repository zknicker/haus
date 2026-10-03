import { Description, Label, ListBox, Select, Separator, Switch } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useSetCloudAgentModel } from '../../../hooks/servers/use-cloud-agent-settings.ts';
import { SettingsFact, SettingsRowError } from '../layout/settings-text.tsx';
import { type CloudAgentModelParamsView, settingWithParam } from './cloud-agent-params.ts';

/**
 * The chosen model's Effort and Fast rows, each only when the model offers
 * it. Each change saves at once, like the model itself. They always follow
 * the Model row, so each brings its own divider.
 */
export function CloudAgentParamRows({
    canManage,
    serverId,
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelParamsView;
}) {
    return (
        <>
            {view.effort ? (
                <>
                    <Separator />
                    <EffortRow canManage={canManage} serverId={serverId} view={view} />
                </>
            ) : null}
            {view.fast ? (
                <>
                    <Separator />
                    <FastRow canManage={canManage} serverId={serverId} view={view} />
                </>
            ) : null}
        </>
    );
}

function EffortRow({
    canManage,
    serverId,
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelParamsView;
}) {
    const setModel = useSetCloudAgentModel(serverId);
    const options = view.effort?.options ?? [];
    const selected = view.effort?.selected ?? null;
    const selectedLabel = options.find((option) => option.value === selected)?.label ?? 'Default';

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Effort</ItemCard.Title>
                <SettingsRowError>{setModel.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                {canManage ? (
                    <Select
                        aria-label="Cloud Agent effort"
                        className="w-60"
                        onChange={(key) => {
                            if (typeof key === 'string' && key !== selected) {
                                setModel.mutate({
                                    model: settingWithParam(view, { effort: key }),
                                    serverId,
                                });
                            }
                        }}
                        placeholder="Default"
                        value={selected}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            {/* The trigger reads the bare level; "Default" is a menu hint. */}
                            <Select.Value>
                                {({ defaultChildren, isPlaceholder, selectedText }) =>
                                    isPlaceholder ? defaultChildren : selectedText
                                }
                            </Select.Value>
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {options.map((option) => (
                                    <ListBox.Item
                                        id={option.value}
                                        key={option.value}
                                        textValue={option.label}
                                    >
                                        {option.isDefault ? (
                                            <div className="flex flex-col">
                                                <Label>{option.label}</Label>
                                                <Description>Default</Description>
                                            </div>
                                        ) : (
                                            <Label>{option.label}</Label>
                                        )}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                ) : (
                    <SettingsFact>{selectedLabel}</SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

function FastRow({
    canManage,
    serverId,
    view,
}: {
    canManage: boolean;
    serverId: string;
    view: CloudAgentModelParamsView;
}) {
    const setModel = useSetCloudAgentModel(serverId);
    const isOn = view.fast?.selected ?? false;

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Fast</ItemCard.Title>
                <SettingsRowError>{setModel.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                {canManage ? (
                    <Switch
                        aria-label="Cloud Agent fast mode"
                        isSelected={isOn}
                        onChange={(fast) =>
                            setModel.mutate({ model: settingWithParam(view, { fast }), serverId })
                        }
                    >
                        <Switch.Content>
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch.Content>
                    </Switch>
                ) : (
                    <SettingsFact>{isOn ? 'On' : 'Off'}</SettingsFact>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}
