import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { Button, Separator, Switch, Tooltip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { ArrowReloadHorizontalIcon, BrowserIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
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
            description="Connect Agents to an existing Chrome browser on this Computer."
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
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Allow Agent access</ItemCard.Title>
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
                    <Separator />
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description className="whitespace-normal">
                                Agents share this browser’s accounts and tabs. Its current owner
                                keeps it running; disconnecting Haus leaves it open.
                            </ItemCard.Description>
                            {settings.browsers.length ? null : (
                                <ItemCard.Description className="whitespace-normal">
                                    No compatible running browsers found. Start Chrome with browser
                                    automation enabled, then refresh.
                                </ItemCard.Description>
                            )}
                        </ItemCard.Content>
                    </ItemCard>
                </ItemCardGroup>
                <SettingsRowError>{setupError ?? error}</SettingsRowError>
            </div>
        </BrowserDialog>
    );
}
