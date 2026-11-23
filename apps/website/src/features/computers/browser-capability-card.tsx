import { browserSaveInput, useBrowserSave } from '../../hooks/servers/use-browser-save.ts';
import { useBrowserSettings } from '../../hooks/servers/use-browser-settings.ts';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { BrowserSettingsCard } from '../settings/browser/browser-settings-card.tsx';

/** Chrome in the Tools box. Browser is a device capability: every operation keeps its target. */
export function BrowserCapabilityRow({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const target = { computerId, serverId };
    const settings = useBrowserSettings(target);
    const save = useBrowserSave(target);

    return (
        <BrowserSettingsCard
            error={settings.error?.message ?? save.error?.message ?? null}
            isLoading={settings.isPending}
            isSaving={save.isPending}
            onRefresh={() => {
                void settings.refetch();
            }}
            onSave={(input) =>
                withSavingToast(() => save.mutateAsync(browserSaveInput(target, input))).catch(
                    () => undefined
                )
            }
            settings={settings.data ?? null}
        />
    );
}
