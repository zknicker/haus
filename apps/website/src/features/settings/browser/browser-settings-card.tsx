import type { AgentRuntimeBrowserSettings, AgentRuntimeSaveBrowserSettings } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import * as React from 'react';
import {
    type BrowserCapabilityView,
    browserCapabilityView,
    browserCheckingView,
} from '../../computers/browser-capability-model.ts';
import { SettingsStatusTitle } from '../layout/settings-row-title.tsx';
import { BrowserSettingsDialog } from './browser-settings-dialog.tsx';
import {
    type BrowserSettingsDraft,
    createDraft,
    draftError,
    hasDraftChanges,
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
    isLoading = false,
    isSaving = false,
    onRefresh,
    onSave,
    settings,
}: {
    error?: string | null;
    isLoading?: boolean;
    isSaving?: boolean;
    onRefresh: () => void;
    onSave: (input: AgentRuntimeSaveBrowserSettings) => Promise<unknown> | undefined;
    settings: BrowserSettings | null;
}) {
    if (isLoading || !settings) {
        return (
            <InertBrowserRow
                view={isLoading ? browserCheckingView : browserCapabilityView({ error, settings })}
            />
        );
    }

    const currentSettings = settings;

    return (
        <BrowserSettingsControl
            error={error}
            isSaving={isSaving}
            onRefresh={onRefresh}
            onSave={onSave}
            settings={currentSettings}
        >
            {({ openSettingsDialog, requestSave }) => {
                const view = browserCapabilityView({ error, settings: currentSettings });
                return (
                    <BrowserRow
                        isSaving={isSaving}
                        onConfigure={openSettingsDialog}
                        onToggle={(enabled) => requestSave({ enabled })}
                        settings={currentSettings}
                        view={view}
                    />
                );
            }}
        </BrowserSettingsControl>
    );
}

export function BrowserSettingsControl({
    children,
    error,
    isSaving,
    onSave,
    onRefresh,
    settings,
}: {
    children: BrowserSettingsControlRender;
    onRefresh: () => void;
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
    const normalized = draft;
    const hasChanges = hasDraftChanges(currentSettings, normalized);
    const setupError = draftError(currentSettings, normalized);
    const canSave = !setupError && (hasChanges || !currentSettings.configured);

    function openSettingsDialog(nextDraft?: Partial<BrowserSettingsDraft>) {
        setDraft({ ...createDraft(currentSettings), ...nextDraft });
        onRefresh();
        setSettingsDialogOpen(true);
    }

    function requestSave(input: AgentRuntimeSaveBrowserSettings) {
        void onSave(input)?.then((result) => {
            if (result !== undefined) {
                setSettingsDialogOpen(false);
            }
        });
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
                onRefresh={onRefresh}
                onSave={() => requestSave(toSaveInput(currentSettings, normalized))}
                open={settingsDialogOpen}
                settings={currentSettings}
                setupError={setupError}
            />
        </>
    );
}

function InertBrowserRow({ view }: { view: BrowserCapabilityView }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsStatusTitle status={<BrowserStatusChip view={view} />}>
                    Chrome
                </SettingsStatusTitle>
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
