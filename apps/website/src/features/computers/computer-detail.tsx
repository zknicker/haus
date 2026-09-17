import type { ComputerRuntimeId } from '@haus/api';
import { Chip } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { Icon } from '../../components/ui/icon.tsx';
import { ProfileFact, ProfileFacts } from '../../components/ui/profile-facts.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ComputerUsageCapacity } from '../usage/computer-usage-capacity.tsx';
import { BrowserCapabilityCard } from './browser-capability-card.tsx';
import { CloudAgentCapabilityCard } from './cloud-agent-capability-card.tsx';
import { ComputerActions } from './computer-actions.tsx';
import { ComputerAgents } from './computer-agents.tsx';
import { ComputerInventoryRefresh } from './computer-inventory-refresh.tsx';
import { ComputerRuntimeIssues } from './computer-runtime-issues.tsx';
import { ComputerSystemLog } from './computer-system-log-card.tsx';
import {
    computerHealthColor,
    computerHealthLabel,
    computerLabel,
    computerPlatformIcon,
    computerRuntimePresentations,
    computerSystemLabel,
} from './presentation.ts';

export function ComputerDetail({
    computerId,
    onRemove,
    serverId,
    serverSlug,
}: {
    computerId: string;
    onRemove: () => void;
    serverId: string;
    serverSlug: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);

    if (!computer) {
        return null;
    }

    const runtimes = computerRuntimePresentations(computer.reportedInventory);
    const detectedRuntimeIds = runtimes
        .filter(
            (
                runtime
            ): runtime is typeof runtime & {
                id: ComputerRuntimeId;
            } => runtime.detected && isComputerRuntimeId(runtime.id)
        )
        .map((runtime) => runtime.id);
    const undetectedRuntimeLabels = runtimes
        .filter((runtime) => !runtime.detected)
        .map((runtime) => runtime.label);

    return (
        // The settings nav is one reading column; a Computer is a settings
        // destination inside it, not a dashboard. At `wide` this page alone
        // jumped from 768px to 1280px mid-nav, and its four-column tables spent
        // the extra 512px on gutters.
        <PageColumn>
            <SettingsPageHeader
                aside={
                    // The dated facts are what this Computer has done, so they
                    // are the record's own column at the far end of the title
                    // line — not a third paragraph under a name that already
                    // has two. The header wraps them under the title, still
                    // left-aligned, once the reading column is too narrow.
                    <ProfileFacts>
                        {computer.productVersion ? (
                            <ProfileFact
                                className="tabular-nums"
                                label="Version"
                                value={`v${computer.productVersion}`}
                            />
                        ) : null}
                        <ProfileFact
                            className="tabular-nums"
                            label="Last connected"
                            value={
                                computer.lastConnectedAt
                                    ? formatTimestamp(computer.lastConnectedAt)
                                    : 'Never'
                            }
                        />
                        <ProfileFact
                            className="tabular-nums"
                            label="Added"
                            value={formatDate(computer.createdAt)}
                        />
                    </ProfileFacts>
                }
                meta={
                    // What this Computer is — reachable, and which machine —
                    // reads as one identity line under the title. Both facts
                    // are the same kind of thing, so both are the same `sm`
                    // Chip: the machine used to be a bare `text-sm` paragraph
                    // beside a chip whose label sets its own smaller step, so
                    // the two sat at different sizes and never quite shared a
                    // centerline. Matching chips make that alignment structural
                    // rather than something to nudge.
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Chip color={computerHealthColor(computer.health)} size="sm" variant="soft">
                            <Chip.Label>{computerHealthLabel(computer.health)}</Chip.Label>
                        </Chip>
                        <Chip size="sm" variant="soft">
                            <Icon icon={computerPlatformIcon(computer)} size={12} />
                            <Chip.Label className="min-w-0 truncate">
                                <span className="sr-only">System </span>
                                {computerSystemLabel(computer)}
                            </Chip.Label>
                        </Chip>
                    </div>
                }
                title={computerLabel(computer)}
            />

            <ComputerRuntimeIssues computerId={computerId} serverId={serverId} />
            <section>
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <ItemCardGroup.Title>Runtimes</ItemCardGroup.Title>
                            {undetectedRuntimeLabels.length > 0 ? (
                                // A runtime with nothing installed has no limit
                                // and no reset, so it says so as the section's
                                // description rather than claiming a data row.
                                <ItemCardGroup.Description>
                                    Not detected: {undetectedRuntimeLabels.join(', ')}
                                </ItemCardGroup.Description>
                            ) : null}
                        </div>
                        <ComputerInventoryRefresh computerId={computerId} serverId={serverId} />
                    </ItemCardGroup.Header>
                    <ComputerUsageCapacity
                        computerId={computerId}
                        detectedRuntimeIds={detectedRuntimeIds}
                        serverId={serverId}
                        serverSlug={serverSlug}
                    />
                </ItemCardGroup>
            </section>

            <BrowserCapabilityCard computerId={computerId} serverId={serverId} />
            <CloudAgentCapabilityCard computerId={computerId} serverId={serverId} />
            <ComputerAgents computerId={computerId} serverId={serverId} serverSlug={serverSlug} />
            <ComputerSystemLog computerId={computerId} key={computerId} serverId={serverId} />
            <ComputerActions
                computerId={computerId}
                onRemove={onRemove}
                serverId={serverId}
                serverSlug={serverSlug}
            />
        </PageColumn>
    );
}

function isComputerRuntimeId(value: string): value is ComputerRuntimeId {
    return value === 'codex' || value === 'claude-code' || value === 'grok-build' || value === 'pi';
}

function formatTimestamp(value: Date | string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function formatDate(value: Date | string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}
