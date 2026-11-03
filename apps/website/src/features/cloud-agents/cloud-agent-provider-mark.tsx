import type { CloudAgentProvider } from '@haus/api';
import { CommandLineIcon } from '@hugeicons-pro/core-solid-rounded';
import { CloudIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ModelProviderLogo } from '../../components/badges/model-provider-logo.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { cloudAgentProviderPresentation } from './cloud-agent-provider-presentation.ts';

/**
 * A Cloud Agent's mark everywhere it appears: the raised key Reminders and
 * Triggers use, at the exact box a surface gives it — 40px on the work card,
 * 32px in the Inbox, 20px on a Thread's job rows. Exact box, so it derives
 * its radius the way every other fixed identity mark in the app does.
 */
export function CloudAgentKeycap({
    provider,
    size,
}: {
    provider: CloudAgentProvider;
    size: number;
}) {
    return (
        <span
            aria-hidden="true"
            className="bg-(image:--automation-keycap-face) relative flex shrink-0 flex-col overflow-hidden shadow-(--automation-keycap-shadow)"
            data-cloud-agent-keycap={provider}
            style={{ borderRadius: identityMarkRadius(size), height: size, width: size }}
        >
            <CloudAgentKeycapFace provider={provider} size={size} />
        </span>
    );
}

/**
 * What sits on the key, scaled to its box, for a surface whose own slot is the
 * key (the Automations list's ItemCard icon, `automation-mark` in
 * `default-theme.css`). A terminal in the cloud agent ink reads first; the
 * provider's logo rides as a badge in the lower corner, so whose run it is
 * reads second. Below `badgeMinKeySize` the badge would be a smudge, so a
 * small key prints the terminal alone and the surface names the run.
 */
export function CloudAgentKeycapFace({
    provider,
    size,
}: {
    provider: CloudAgentProvider;
    size: number;
}) {
    const presentation = cloudAgentProviderPresentation[provider];
    const glyph = Math.round(size * 0.59);
    const badge = Math.round(size * 0.41);

    return (
        <>
            <span
                className="grid w-full flex-1 place-items-center text-cloud-agent-mark"
                style={{ paddingBottom: size * 0.09 }}
            >
                <Icon icon={CommandLineIcon} size={glyph} style={{ height: glyph, width: glyph }} />
            </span>
            {size >= badgeMinKeySize ? (
                <ModelProviderLogo
                    className="absolute bg-background shadow-(--automation-keycap-shadow)"
                    color={presentation.color}
                    fallbackIcon={CloudIcon}
                    iconClassName="size-full object-contain"
                    logo={presentation.logo}
                    style={{
                        backgroundColor: undefined,
                        borderRadius: identityMarkRadius(badge),
                        bottom: size * 0.11,
                        height: badge,
                        padding: badge * 0.14,
                        right: size * 0.055,
                        width: badge,
                    }}
                />
            ) : null}
        </>
    );
}

const badgeMinKeySize = 28;
