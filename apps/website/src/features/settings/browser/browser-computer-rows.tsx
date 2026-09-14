import type { AgentRuntimeBrowserSettings, AgentRuntimeBrowserState } from '@haus/api';
import { Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { SettingsFact } from '../layout/settings-text.tsx';

type BrowserSettings = AgentRuntimeBrowserSettings;

/**
 * What this machine reports back. Every row here is a fact — a title on the
 * left, one value on the right — so the group reads as a short table rather
 * than prose. The only description in the whole dialog lives here, and only
 * when something is wrong: Chrome missing, or a status with a reason.
 */
export function BrowserComputerGroup({ settings }: { settings: BrowserSettings }) {
    const { application } = settings;

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>This Computer</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Chrome installation</ItemCard.Title>
                        {application ? null : (
                            <ItemCard.Description className="whitespace-normal">
                                {/* The caveat belongs to the row it constrains:
                                    Haus manages an install, it never produces
                                    one. */}
                                Browser supports Google Chrome on macOS. Haus does not install it.
                            </ItemCard.Description>
                        )}
                    </ItemCard.Content>
                    <ItemCard.Action className="min-w-0 shrink">
                        {application ? (
                            <SettingsFact
                                className="block truncate text-right font-mono"
                                title={application.path}
                            >
                                {application.path}
                            </SettingsFact>
                        ) : (
                            <SettingsFact className="text-warning">Not detected</SettingsFact>
                        )}
                    </ItemCard.Action>
                </ItemCard>
                {application?.version ? (
                    <>
                        <Separator />
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Chrome version</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <SettingsFact className="tabular-nums">
                                    {application.version}
                                </SettingsFact>
                            </ItemCard.Action>
                        </ItemCard>
                    </>
                ) : null}
                <Separator />
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Status</ItemCard.Title>
                        {statusDetail(settings) ? (
                            <ItemCard.Description className="whitespace-normal">
                                {statusDetail(settings)}
                            </ItemCard.Description>
                        ) : null}
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <StatusChip settings={settings} />
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function StatusChip({ settings }: { settings: BrowserSettings }) {
    if (!settings.status) {
        return (
            <Chip color="default" size="sm" variant="soft">
                Not started
            </Chip>
        );
    }

    const { state } = settings.status;
    return (
        <Chip color={stateColor(state)} size="sm" variant="soft">
            {formatBrowserState(state)}
        </Chip>
    );
}

/** Only what the chip cannot already say: a reason the Computer reported. */
function statusDetail(settings: BrowserSettings) {
    return settings.status?.reason;
}

function stateColor(state: AgentRuntimeBrowserState) {
    switch (state) {
        case 'healthy':
            return 'success' as const;
        case 'starting':
        case 'recovering':
            return 'default' as const;
        case 'pressured':
        case 'degraded':
            return 'warning' as const;
        case 'stopped':
        case 'unresponsive':
            return 'danger' as const;
    }
}

function formatBrowserState(state: AgentRuntimeBrowserState) {
    switch (state) {
        case 'degraded':
            return 'Degraded';
        case 'healthy':
            return 'Healthy';
        case 'pressured':
            return 'Under pressure';
        case 'recovering':
            return 'Recovering';
        case 'starting':
            return 'Starting';
        case 'stopped':
            return 'Stopped';
        case 'unresponsive':
            return 'Unresponsive';
    }
}
