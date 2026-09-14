import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { Button, FieldError, Input, Separator, TextField, Tooltip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { BrowserIcon, InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { Dispatch, SetStateAction } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { BrowserComputerGroup } from './browser-computer-rows.tsx';
import { BROWSER_DIALOG_FORM_ID, BrowserDialog, BrowserLockSwitch } from './browser-dialog.tsx';
import type { BrowserSettingsDraft } from './browser-settings-model.ts';

type BrowserSettings = AgentRuntimeBrowserSettings;

export function BrowserSettingsDialog({
    canSave,
    draft,
    error,
    isSaving,
    onDraftChange,
    onOpenChange,
    onSave,
    open,
    setupError,
    settings,
}: {
    canSave: boolean;
    draft: BrowserSettingsDraft;
    error?: string | null;
    isSaving: boolean;
    onDraftChange: Dispatch<SetStateAction<BrowserSettingsDraft>>;
    onOpenChange: (open: boolean) => void;
    onSave: () => void;
    open: boolean;
    setupError?: string | null;
    settings: BrowserSettings;
}) {
    return (
        <BrowserDialog
            description="Set up the shared Chrome profile Agents use on this Computer."
            footer={
                <Button
                    form={BROWSER_DIALOG_FORM_ID}
                    isDisabled={!canSave || isSaving}
                    isPending={isSaving}
                    type="submit"
                >
                    {settings.configured ? 'Save' : 'Set up Browser'}
                </Button>
            }
            icon={BrowserIcon}
            onOpenChange={onOpenChange}
            onSubmit={() => {
                if (canSave) {
                    onSave();
                }
            }}
            open={open}
            title="Browser"
            titleSuffix="Tool"
        >
            {/* Two groups: what the operator sets, then what the machine
                reports. Every row is a title and one control or value, so the
                gap between groups and their titles carry the hierarchy. */}
            <div className="grid gap-6">
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>Browser</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup className="overflow-hidden">
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Enable Browser</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <BrowserLockSwitch
                                    aria-label={`${draft.enabled ? 'Disable' : 'Enable'} Browser`}
                                    checked={draft.enabled}
                                    disabled={isSaving}
                                    locked={!(settings.application || draft.enabled)}
                                    lockTooltip="Install Google Chrome on this Computer before enabling Browser."
                                    onCheckedChange={(enabled) =>
                                        onDraftChange((current) => ({ ...current, enabled }))
                                    }
                                />
                            </ItemCard.Action>
                        </ItemCard>
                        <Separator />
                        <ItemCard>
                            {/* Content stacks its children in a column, so the
                                title and its affordance share one row of their
                                own. */}
                            <ItemCard.Content>
                                <div className="flex items-center gap-0.5">
                                    <ItemCard.Title>Profile name</ItemCard.Title>
                                    {/* What a profile is costs three sentences
                                        to explain and is read once. It sits
                                        behind an affordance rather than on the
                                        row, where it would outweigh every other
                                        line in the sheet. */}
                                    <Tooltip delay={0}>
                                        <Button
                                            aria-label="About profile names"
                                            isIconOnly
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <Icon icon={InformationCircleIcon} size={14} />
                                        </Button>
                                        <Tooltip.Content placement="top">
                                            Agents on this Computer share this profile’s cookies and
                                            signed-in accounts. Lowercase letters, digits, and
                                            hyphens. A new name starts a separate profile without
                                            deleting the old one.
                                        </Tooltip.Content>
                                    </Tooltip>
                                </div>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <TextField
                                    aria-label="Browser profile name"
                                    className="w-56 max-w-full"
                                    isDisabled={isSaving}
                                    isInvalid={Boolean(setupError)}
                                    onChange={(profileName) =>
                                        onDraftChange((current) => ({ ...current, profileName }))
                                    }
                                    value={draft.profileName}
                                    variant="secondary"
                                >
                                    <Input
                                        autoComplete="off"
                                        className="font-mono"
                                        placeholder="default"
                                        spellCheck={false}
                                    />
                                    {setupError ? <FieldError>{setupError}</FieldError> : null}
                                </TextField>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                </ItemCardGroup>

                <BrowserComputerGroup settings={settings} />

                {/* The save failure belongs with the button that caused it, so
                    it is one line at the end of the body rather than a boxed
                    alert repeating the word "failed". */}
                <SettingsRowError>{error}</SettingsRowError>
            </div>
        </BrowserDialog>
    );
}
