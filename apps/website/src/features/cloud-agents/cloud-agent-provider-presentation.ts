import type { CloudAgentProvider, CloudAgentWork } from '@haus/api';
import { toast } from '@heroui/react';
import type { ModelProviderLogoSource } from '../../components/badges/model-provider-logo.tsx';
import { getDesktopBridge, type HausDesktopBridge } from '../../lib/desktop-bridge.ts';
import { openExternalLink } from '../../lib/open-external-link.ts';

/**
 * How one Cloud Agent provider presents itself: the name a human reads, the
 * brand ink behind its mark, and the theme-aware logo pair that mark renders.
 */
export interface CloudAgentProviderPresentation {
    color: string;
    /** The provider desktop app's deeplink to one run. Desktop main allowlists each one. */
    desktopAppUrl: (providerAgentId: string) => string;
    logo: ModelProviderLogoSource;
    name: string;
}

/**
 * The one place a Cloud Agent provider is named or drawn. Every surface — the
 * work card's mark, the Inbox row, and every
 * `Open in <name>` control — reads from here, so adding a second provider is a
 * row in this table rather than a sweep through the feature.
 *
 * Logos are the svgl marks the model-provider badges already use, in the same
 * `light` / `dark` pairing: the `_light` file carries dark ink for the light
 * theme, and `_dark` carries light ink for the dark one.
 */
export const cloudAgentProviderPresentation: Record<
    CloudAgentProvider,
    CloudAgentProviderPresentation
> = {
    cursor: {
        color: '#111827',
        desktopAppUrl: (providerAgentId) =>
            `cursor://anysphere.cursor-deeplink/background-agent?bcId=${encodeURIComponent(providerAgentId)}`,
        logo: {
            dark: 'https://svgl.app/library/cursor_dark.svg',
            light: 'https://svgl.app/library/cursor_light.svg',
        },
        name: 'Cursor',
    },
};

export function cloudAgentProviderName(provider: CloudAgentProvider): string {
    return cloudAgentProviderPresentation[provider].name;
}

/** The one wording for the control that leaves Haus for the provider. */
export function openInCloudAgentProviderLabel(provider: CloudAgentProvider): string {
    return `Open in ${cloudAgentProviderName(provider)}`;
}

/** What a run carries that can open it in the provider. */
export type CloudAgentProviderTarget = Pick<
    CloudAgentWork,
    'provider' | 'providerAgentId' | 'providerUrl'
>;

/** The desktop shell can open the provider's app; every client can open its web page. */
export function canOpenCloudAgentProvider(
    target: CloudAgentProviderTarget,
    bridge: HausDesktopBridge | null = getDesktopBridge()
): boolean {
    return Boolean(target.providerUrl || (bridge && target.providerAgentId));
}

/**
 * Leave Haus for the provider, naming it in the failure so a human knows what
 * did not open.
 */
export function openCloudAgentProvider(target: CloudAgentProviderTarget): void {
    openCloudAgentProviderTarget(target, getDesktopBridge(), openExternalLink).catch(() =>
        toast.danger(`Could not open ${cloudAgentProviderName(target.provider)}`)
    );
}

/**
 * The desktop shell asks the system to open the provider's own app; that
 * rejects when the app is not installed (or the shell predates the deeplink
 * allowlist), and the run's web page opens instead. Web clients open the page.
 */
export async function openCloudAgentProviderTarget(
    target: CloudAgentProviderTarget,
    bridge: HausDesktopBridge | null,
    openWebPage: (url: string) => Promise<void>
): Promise<void> {
    const { providerAgentId, providerUrl } = target;
    if (bridge && providerAgentId) {
        const appUrl =
            cloudAgentProviderPresentation[target.provider].desktopAppUrl(providerAgentId);
        try {
            await bridge.openExternal(appUrl);
            return;
        } catch (error) {
            if (!providerUrl) {
                throw error;
            }
        }
    }
    if (!providerUrl) {
        throw new Error('This Cloud Agent run has no provider page to open.');
    }
    await openWebPage(providerUrl);
}
