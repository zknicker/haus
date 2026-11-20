import type { CloudAgentProvider } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { CommandLineIcon } from '@hugeicons-pro/core-solid-rounded';
import { CloudIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ModelProviderLogo } from '../../components/badges/model-provider-logo.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { cloudAgentProviderPresentation } from './cloud-agent-provider-presentation.ts';

/**
 * A Worker's mark everywhere it appears: the raised key Reminders and
 * Triggers use, at the exact box a surface gives it — 40px on the work card,
 * 32px in the Inbox. Exact box, so it derives
 * its radius the way every other fixed identity mark in the app does.
 *
 * `environmentName` is set only for a Claude launch pinned to a cloud
 * environment; when present it rides as a tooltip, since the mark otherwise
 * carries only the provider.
 */
export function WorkerKeycap({
    environmentName,
    provider,
    size,
}: {
    environmentName?: string | null;
    provider: CloudAgentProvider;
    size: number;
}) {
    const key = (
        <span
            aria-hidden="true"
            className="relative flex shrink-0 flex-col overflow-hidden bg-(image:--automation-keycap-face) shadow-(--automation-keycap-shadow)"
            data-worker-keycap={provider}
            style={{ borderRadius: identityMarkRadius(size), height: size, width: size }}
        >
            <WorkerKeycapFace provider={provider} size={size} />
        </span>
    );
    if (!environmentName) {
        return key;
    }
    return (
        <Tooltip>
            <Tooltip.Trigger>{key}</Tooltip.Trigger>
            <Tooltip.Content>{`Pinned to ${environmentName}`}</Tooltip.Content>
        </Tooltip>
    );
}

/**
 * What sits on the key, scaled to its box, for a surface whose own slot is the
 * key (the Automations list's ItemCard icon, `automation-mark` in
 * `default-theme.css`). A terminal in the Worker ink reads first; the
 * provider's logo rides as a badge in the lower corner, so whose run it is
 * reads second. Below `badgeMinKeySize` the badge would be a smudge, so a
 * small key prints the terminal alone and the surface names the run.
 */
export function WorkerKeycapFace({
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
                className="text-worker-mark grid w-full flex-1 place-items-center"
                style={{ paddingBottom: size * 0.09 }}
            >
                <Icon icon={CommandLineIcon} size={glyph} style={{ height: glyph, width: glyph }} />
            </span>
            {size >= badgeMinKeySize ? (
                <ModelProviderLogo
                    className="bg-background absolute shadow-(--automation-keycap-shadow)"
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
