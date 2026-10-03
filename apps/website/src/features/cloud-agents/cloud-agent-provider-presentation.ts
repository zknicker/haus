import type { CloudAgentProvider } from '@haus/api';
import { toast } from '@heroui/react';
import type { ModelProviderLogoSource } from '../../components/badges/model-provider-logo.tsx';
import { openExternalLink } from '../../lib/open-external-link.ts';

/**
 * How one Cloud Agent provider presents itself: the name a human reads, the
 * brand ink behind its mark, and the theme-aware logo pair that mark renders.
 */
export interface CloudAgentProviderPresentation {
    color: string;
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

/**
 * How a provider URL opens: the App's own external-link path, with the
 * provider named in the failure so a human knows what did not open.
 */
export function openCloudAgentProviderUrl(provider: CloudAgentProvider, url: string): void {
    openExternalLink(url).catch(() =>
        toast.danger(`Could not open ${cloudAgentProviderName(provider)}`)
    );
}
