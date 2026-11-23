import type { ComputerRuntimeId } from '@haus/api';
import { Chip } from '@heroui/react';
import { Icon } from '../../components/ui/icon.tsx';
import { ProfileFact, ProfileFacts } from '../../components/ui/profile-facts.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { CloudWorkersSection } from './cloud-agent-capability-card.tsx';
import { ComputerAccessSection } from './computer-access-section.tsx';
import { ComputerUpdates } from './computer-actions.tsx';
import { ComputerAgents } from './computer-agents.tsx';
import { ComputerDiagnostics } from './computer-diagnostics.tsx';
import { ComputerDiskChip, ComputerDiskWarning } from './computer-disk-warning.tsx';
import { ComputerRepoFoldersCard } from './computer-repo-folders-card.tsx';
import { ComputerRuntimeIssues } from './computer-runtime-issues.tsx';
import { ComputerToolsSection } from './computer-tools-section.tsx';
import type { ComputerUpdatePreviewState } from './computer-update-preview.tsx';
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
    onUpdatePreviewChange,
    serverId,
    serverSlug,
    updatePreview,
}: {
    computerId: string;
    onUpdatePreviewChange: (state: ComputerUpdatePreviewState) => void;
    serverId: string;
    serverSlug: string;
    updatePreview: ComputerUpdatePreviewState;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);

    if (!computer) {
        return null;
    }

    const workerRuntimeIds = computerRuntimePresentations(computer.reportedInventory)
        .filter((runtime) => runtime.detected)
        .map((runtime) => runtime.id)
        .filter(isWorkerRuntimeId);
    const online = computer.health !== 'offline';

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader
                aside={
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
                            label={online ? 'Connected' : 'Last connected'}
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
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Chip color={computerHealthColor(computer.health)} size="sm" variant="soft">
                            <Chip.Label>{computerHealthLabel(computer.health)}</Chip.Label>
                        </Chip>
                        <ComputerDiskChip computerId={computerId} serverId={serverId} />
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

            <ComputerDiskWarning computerId={computerId} serverId={serverId} />
            <ComputerRuntimeIssues computerId={computerId} serverId={serverId} />
            <ComputerUpdates
                computerId={computerId}
                previewState={updatePreview}
                serverId={serverId}
            />
            <ComputerAccessSection computerId={computerId} serverId={serverId} />
            <ComputerRepoFoldersCard computerId={computerId} serverId={serverId} />
            <ComputerToolsSection computerId={computerId} serverId={serverId} />
            <CloudWorkersSection computerId={computerId} serverId={serverId} />
            <ComputerAgents computerId={computerId} serverId={serverId} />
            <ComputerDiagnostics
                computerId={computerId}
                key={computerId}
                onUpdatePreviewChange={onUpdatePreviewChange}
                runtimeIds={workerRuntimeIds}
                serverId={serverId}
                serverSlug={serverSlug}
                updatePreview={updatePreview}
            />
        </SettingsPageColumn>
    );
}

/** Workers run Claude Code or Codex; Grok Build is no longer a runtime (ADR 0057). */
function isWorkerRuntimeId(value: string): value is ComputerRuntimeId {
    return value === 'codex' || value === 'claude-code';
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
