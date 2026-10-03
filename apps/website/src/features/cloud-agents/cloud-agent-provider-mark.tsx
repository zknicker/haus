import type { CloudAgentProvider } from '@haus/api';
import { CloudIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ModelProviderLogo } from '../../components/badges/model-provider-logo.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { cn } from '../../lib/utils.ts';
import { cloudAgentProviderPresentation } from './cloud-agent-provider-presentation.ts';

/**
 * A 40px identity mark matches the card's two 20px text lines.
 */
export function CloudAgentProviderMark({ provider }: { provider: CloudAgentProvider }) {
    const presentation = cloudAgentProviderPresentation[provider];

    return (
        <ModelProviderLogo
            className="size-10 border border-separator"
            color={presentation.color}
            fallbackIcon={CloudIcon}
            iconClassName="size-5"
            logo={presentation.logo}
            style={{ borderRadius: identityMarkRadius(40) }}
        />
    );
}

/**
 * The same mark inline, at annotation scale: the hoisted status and the
 * Inbox row both lead with it instead of a generic
 * cloud. No box here — inline it is a glyph among words.
 */
export function CloudAgentProviderGlyph({
    className,
    provider,
}: {
    className?: string;
    provider: CloudAgentProvider;
}) {
    const presentation = cloudAgentProviderPresentation[provider];

    return (
        <ModelProviderLogo
            className={cn('size-3.5', className)}
            color={presentation.color}
            fallbackIcon={CloudIcon}
            iconClassName="size-3.5"
            logo={presentation.logo}
            style={{ backgroundColor: 'transparent' }}
        />
    );
}
