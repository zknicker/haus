import type { ComputerRuntimeId } from '@haus/api';
import { Chip } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ComputerUsageCapacity } from '../usage/computer-usage-capacity.tsx';
import { BrowserCapabilityCard } from './browser-capability-card.tsx';
import { CloudAgentCapabilityCard } from './cloud-agent-capability-card.tsx';
import { ComputerActions } from './computer-actions.tsx';
import { ComputerAgents } from './computer-agents.tsx';
import { ComputerInventoryRefresh } from './computer-inventory-refresh.tsx';
import { ComputerSystemLog } from './computer-system-log-card.tsx';
import {
    computerHealthColor,
    computerHealthLabel,
    computerLabel,
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
                meta={
                    <div className="flex flex-wrap items-center gap-3">
                        <Chip color={computerHealthColor(computer.health)} size="sm" variant="soft">
                            {computerHealthLabel(computer.health)}
                        </Chip>
                        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                            <ComputerFact srLabel="System" value={computerSystemLabel(computer)} />
                            {computer.productVersion ? (
                                <ComputerFact
                                    label="Version"
                                    value={`v${computer.productVersion}`}
                                />
                            ) : null}
                            <ComputerFact
                                label="Last connected"
                                value={
                                    computer.lastConnectedAt
                                        ? formatTimestamp(computer.lastConnectedAt)
                                        : 'Never'
                                }
                            />
                            <ComputerFact label="Added" value={formatDate(computer.createdAt)} />
                        </dl>
                    </div>
                }
                title={computerLabel(computer)}
            />

            <section>
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header className="flex items-baseline justify-between gap-3">
                        <ItemCardGroup.Title>Runtimes</ItemCardGroup.Title>
                        {undetectedRuntimeLabels.length > 0 ? (
                            // A runtime with nothing installed has no limit and no
                            // reset, so it rides in the section header rather than
                            // claiming a data row or a line below the table.
                            <p className="min-w-0 truncate text-muted text-sm">
                                Not detected: {undetectedRuntimeLabels.join(', ')}
                            </p>
                        ) : null}
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

function ComputerFact({ label, srLabel, value }: ComputerFactProps) {
    return (
        <div className="flex min-w-0 items-baseline gap-1.5">
            <dt className={label ? 'text-muted' : 'sr-only'}>{label ?? srLabel}</dt>
            <dd className="truncate text-foreground">{value}</dd>
        </div>
    );
}

interface ComputerFactProps {
    label?: string;
    srLabel?: string;
    value: string;
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
