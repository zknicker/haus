import type { AgentRuntimeBrowserSettings, AgentRuntimeSaveBrowserSettings } from '@haus/api';
import { Button } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import * as React from 'react';
import { browserCapabilityView } from '../../computers/browser-capability-model.ts';
import { BrowserSettingsDialog } from './browser-settings-dialog.tsx';
import {
    type BrowserSettingsDraft,
    createDraft,
    hasDraftChanges,
    normalizeDraft,
    toSaveInput,
} from './browser-settings-model.ts';
import { BrowserRow, BrowserStatusChip } from './browser-settings-row.tsx';

type BrowserSettings = AgentRuntimeBrowserSettings;
type BrowserSettingsControlRender = (control: {
    openSettingsDialog: (nextDraft?: Partial<BrowserSettingsDraft>) => void;
    requestSave: (input: AgentRuntimeSaveBrowserSettings) => void;
}) => React.ReactNode;

export function BrowserSettingsCard({
    error,
    isActionPending = false,
    isLoading = false,
    isSaving = false,
    onOpenBrowser,
    onRestartBrowser,
    onSave,
    settings,
}: {
    error?: string | null;
    isActionPending?: boolean;
    isLoading?: boolean;
    isSaving?: boolean;
    onOpenBrowser: () => Promise<unknown> | undefined;
    onRestartBrowser: () => Promise<unknown> | undefined;
    onSave: (input: AgentRuntimeSaveBrowserSettings) => Promise<unknown> | undefined;
    settings: BrowserSettings | null;
}) {
    if (isLoading) {
        return <BrowserSkeleton />;
    }

    if (!settings) {
        const view = browserCapabilityView({ error, settings: null });
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>
                        Chrome
                        <BrowserStatusChip view={view} />
                    </ItemCard.Title>
                    <ItemCard.Description>{view.description}</ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Button isDisabled size="sm" variant="secondary">
                        Configure
                    </Button>
                </ItemCard.Action>
            </ItemCard>
        );
    }

    const currentSettings = settings;

    return (
        <BrowserSettingsControl
            error={error}
            isSaving={isSaving}
            onSave={onSave}
            settings={currentSettings}
        >
            {({ openSettingsDialog, requestSave }) => {
                const view = browserCapabilityView({ error, settings: currentSettings });
                return (
                    <BrowserRow
                        isActionPending={isActionPending}
                        isSaving={isSaving}
                        onConfigure={openSettingsDialog}
                        onOpenBrowser={onOpenBrowser}
                        onRestartBrowser={onRestartBrowser}
                        onToggle={(enabled) => requestSave({ enabled })}
                        settings={currentSettings}
                        view={view}
                    />
                );
            }}
        </BrowserSettingsControl>
    );
}

/**
 * Owns the draft and the settings dialog. Opening and restarting Chrome are
 * the Computer page row's actions, not this control's — they reach `BrowserRow`
 * straight from the card.
 */
export function BrowserSettingsControl({
    children,
    error,
    isSaving,
    onSave,
    settings,
}: {
    children: BrowserSettingsControlRender;
    error?: string | null;
    isSaving: boolean;
    onSave: (input: AgentRuntimeSaveBrowserSettings) => Promise<unknown> | undefined;
    settings: BrowserSettings;
}) {
    const [draft, setDraft] = React.useState<BrowserSettingsDraft>(() => createDraft(settings));
    const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);

    React.useEffect(() => {
        if (!settingsDialogOpen) {
            setDraft(createDraft(settings));
        }
    }, [settings, settingsDialogOpen]);

    const currentSettings = settings;
    const normalized = normalizeDraft(draft);
    const hasChanges = hasDraftChanges(currentSettings, normalized);
    const missingProfileName = normalized.profileName.length === 0;
    const canSave = !missingProfileName && (hasChanges || !currentSettings.configured);
    const setupError = missingProfileName ? 'Set a profile name before saving.' : null;

    function openSettingsDialog(nextDraft?: Partial<BrowserSettingsDraft>) {
        setDraft({ ...createDraft(currentSettings), ...nextDraft });
        setSettingsDialogOpen(true);
    }

    function requestSave(input: AgentRuntimeSaveBrowserSettings) {
        void onSave(input);
    }

    return (
        <>
            {children({ openSettingsDialog, requestSave })}

            <BrowserSettingsDialog
                canSave={canSave}
                draft={draft}
                error={error}
                isSaving={isSaving}
                onDraftChange={setDraft}
                onOpenChange={setSettingsDialogOpen}
                onSave={() => requestSave(toSaveInput(currentSettings, normalized))}
                open={settingsDialogOpen}
                settings={currentSettings}
                setupError={setupError}
            />
        </>
    );
}

/** Blank while loading — the app shows no skeletons on synced surfaces. */
function BrowserSkeleton() {
    return (
        <div aria-busy="true" className="min-h-14">
            <span className="sr-only">Loading Browser settings</span>
        </div>
    );
}
