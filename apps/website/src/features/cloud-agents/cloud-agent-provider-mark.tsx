import type { CloudAgentProvider } from '@haus/api';
import { CommandLineIcon } from '@hugeicons-pro/core-solid-rounded';
import { CloudIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ModelProviderLogo } from '../../components/badges/model-provider-logo.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
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

/**
 * A Cloud Agent on a raised key, for the Automations list beside Reminder and
 * Trigger keys (the ItemCard icon slot is the key, `automation-mark` in
 * `default-theme.css`). The key prints a terminal in the cloud agent ink, and
 * the provider rides as a small badge in its lower corner, so the kind reads
 * first and whose run it is reads second.
 */
export function CloudAgentKeycapFace({ provider }: { provider: CloudAgentProvider }) {
    const presentation = cloudAgentProviderPresentation[provider];

    return (
        <>
            <span className="grid w-full flex-1 place-items-center pb-[3px] text-cloud-agent-mark">
                <Icon icon={CommandLineIcon} size={20} style={{ height: 20, width: 20 }} />
            </span>
            <ModelProviderLogo
                className="absolute right-0.5 bottom-1 bg-background p-0.5 shadow-(--automation-keycap-shadow)"
                color={presentation.color}
                fallbackIcon={CloudIcon}
                iconClassName="size-full object-contain"
                logo={presentation.logo}
                style={{
                    backgroundColor: undefined,
                    borderRadius: identityMarkRadius(providerBadgeSize),
                    height: providerBadgeSize,
                    width: providerBadgeSize,
                }}
            />
        </>
    );
}

const providerBadgeSize = 14;
