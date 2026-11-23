import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator, Switch, Tooltip } from '@heroui/react';
import { ArrowReloadHorizontalIcon, BrowserIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { BROWSER_DIALOG_FORM_ID, BrowserDialog } from './browser-dialog.tsx';
import { BrowserExistingFields } from './browser-existing-fields.tsx';
import type { BrowserSettingsDraft } from './browser-settings-model.ts';

export function BrowserSettingsDialog({
    canSave,
    draft,
    error,
    isSaving,
    onDraftChange,
    onOpenChange,
    onRefresh,
    onSave,
    open,
    setupError,
    settings,
}: {
    canSave: boolean;
    draft: BrowserSettingsDraft;
    error?: string | null;
    isSaving: boolean;
    onDraftChange: (draft: BrowserSettingsDraft) => void;
    onOpenChange: (open: boolean) => void;
    onRefresh: () => void;
    onSave: () => void;
    open: boolean;
    setupError?: string | null;
    settings: AgentRuntimeBrowserSettings;
}) {
    return (
        <BrowserDialog
            description="Connect Captains to an existing Chrome browser on this device."
            footer={
                <Button
                    form={BROWSER_DIALOG_FORM_ID}
                    isDisabled={!canSave || isSaving}
                    isPending={isSaving}
                    type="submit"
                >
                    {settings.configured ? 'Save' : 'Connect'}
                </Button>
            }
            icon={BrowserIcon}
            onOpenChange={onOpenChange}
            onSubmit={() => {
                if (canSave && !isSaving) {
                    onSave();
                }
            }}
            open={open}
            title="Browser"
        >
            <div className="grid grid-cols-1 gap-6">
                <ItemCardGroup>
                    <ItemCard>
                        <ItemCard.Content>
                            <SettingsRowTitle info="Captains share this browser’s accounts and tabs. Its current owner keeps it running; disconnecting Haus leaves it open.">
                                Allow Captain access
                            </SettingsRowTitle>
                        </ItemCard.Content>
                        <ItemCard.Action className="flex items-center gap-2">
                            <Tooltip delay={0}>
                                <Button
                                    aria-label="Refresh browsers"
                                    isDisabled={isSaving}
                                    isIconOnly
                                    onPress={onRefresh}
                                    size="sm"
                                    variant="ghost"
                                >
                                    <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                                </Button>
                                <Tooltip.Content>Refresh browsers</Tooltip.Content>
                            </Tooltip>
                            <Switch
                                aria-label={`${draft.enabled ? 'Disconnect' : 'Connect'} Browser`}
                                isDisabled={isSaving}
                                isSelected={draft.enabled}
                                onChange={(enabled) => onDraftChange({ ...draft, enabled })}
                            >
                                <Switch.Content>
                                    <Switch.Control>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch.Content>
                            </Switch>
                        </ItemCard.Action>
                    </ItemCard>
                    <Separator />
                    <BrowserExistingFields
                        connection={draft.connection}
                        isSaving={isSaving}
                        onChange={(connection) => onDraftChange({ ...draft, connection })}
                        settings={settings}
                    />
                </ItemCardGroup>
                <SettingsRowError>{setupError ?? error}</SettingsRowError>
            </div>
        </BrowserDialog>
    );
}
