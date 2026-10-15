import type { GithubInstallation, GithubInstallCandidate } from '@haus/api';
import { Button, Chip, Dropdown, Label, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, useState } from 'react';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useGithubBindInstallation } from '../../../../../hooks/github/use-github-bind-installation.ts';
import { useGithubInstallCandidates } from '../../../../../hooks/github/use-github-install-candidates.ts';
import { useGithubInstallations } from '../../../../../hooks/github/use-github-installations.ts';
import { useGithubStartInstall } from '../../../../../hooks/github/use-github-start-install.ts';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
import { ConnectionAddRow } from '../../../mcp/mcp-connection-account.tsx';
import type { BuiltInConnectionSectionProps } from '../built-in-connection-definition.ts';
import {
    githubCandidateDescription,
    githubInstallationSettingsUrl,
    githubInstallationStatus,
    githubRepositoryScopeLabel,
} from './github-installation-model.ts';
import { GithubInstallationRemoveDialog } from './github-installation-remove-dialog.tsx';
import { GithubSetupNotice } from './github-setup-notice.tsx';

/**
 * The GitHub accounts this connection reaches through the Haus App, one row
 * each. Installing and adding need the connection's signed-in GitHub user, so
 * those actions appear only while it is connected; existing rows stay listed
 * either way, because disconnecting keeps installations.
 */
export function GithubInstallationsSection({
    connection,
    serverId,
}: BuiltInConnectionSectionProps) {
    const installations = useGithubInstallations(serverId, connection.id);
    const candidates = useGithubInstallCandidates(serverId, connection.id, connection.connected);
    const [removing, setRemoving] = useState<GithubInstallation | null>(null);
    const rows = installations.data;

    // GitHub's setup redirect lands here, so its outcome sits above the list it changed.
    const notice = <GithubSetupNotice />;
    if (!rows || (rows.length === 0 && !connection.connected)) {
        return notice;
    }

    return (
        <>
            {notice}
            <ConnectionSection count={rows.length} title="Installations">
                <ItemCardGroup variant="outline">
                    {rows.map((installation, index) => (
                        <Fragment key={installation.id}>
                            {index > 0 ? <Separator /> : null}
                            <InstallationRow
                                installation={installation}
                                onRemove={() => setRemoving(installation)}
                            />
                        </Fragment>
                    ))}
                    {connection.connected ? (
                        <InstallRows
                            candidates={candidates.data ?? []}
                            connectionId={connection.id}
                            leadingSeparator={rows.length > 0}
                            serverId={serverId}
                        />
                    ) : null}
                </ItemCardGroup>
                <GithubInstallationRemoveDialog
                    connectionId={connection.id}
                    installation={removing}
                    onClose={() => setRemoving(null)}
                    serverId={serverId}
                />
            </ConnectionSection>
        </>
    );
}

function InstallationRow({
    installation,
    onRemove,
}: {
    installation: GithubInstallation;
    onRemove: () => void;
}) {
    const status = githubInstallationStatus(installation);
    const { login } = installation.account;

    return (
        <ItemCard>
            <EntityAvatar name={login} size="sm" />
            <ItemCard.Content>
                <ItemCard.Title>{login}</ItemCard.Title>
                <ItemCard.Description className="tabular-nums">
                    {githubRepositoryScopeLabel(installation)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-2">
                {status ? (
                    <Chip
                        color={installation.status === 'active' ? 'warning' : 'danger'}
                        size="sm"
                        variant="soft"
                    >
                        <Chip.Label>{status}</Chip.Label>
                    </Chip>
                ) : null}
                <Dropdown>
                    <Button
                        aria-label={`Actions for ${login}`}
                        isIconOnly
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu>
                            <Dropdown.Item
                                id="configure"
                                onAction={() =>
                                    window.open(
                                        githubInstallationSettingsUrl(installation),
                                        '_blank',
                                        'noopener,noreferrer'
                                    )
                                }
                                textValue="Configure on GitHub"
                            >
                                <Label>Configure on GitHub</Label>
                            </Dropdown.Item>
                            {installation.status === 'removed' ? null : (
                                <Dropdown.Item
                                    id="remove"
                                    onAction={onRemove}
                                    textValue="Remove from Haus"
                                    variant="danger"
                                >
                                    <Label>Remove from Haus</Label>
                                </Dropdown.Item>
                            )}
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </ItemCard.Action>
        </ItemCard>
    );
}

/**
 * The card's add rows, in the shape of "Add another account" above them.
 * Install on GitHub leads, and is the whole card while nothing is installed.
 * Each existing installation GitHub reports the signed-in user owns, and Haus
 * has not bound, is one press away as its own row.
 */
function InstallRows({
    candidates,
    connectionId,
    leadingSeparator,
    serverId,
}: {
    candidates: readonly GithubInstallCandidate[];
    connectionId: string;
    leadingSeparator: boolean;
    serverId: string;
}) {
    const startInstall = useGithubStartInstall(serverId, connectionId);
    const bind = useGithubBindInstallation(serverId, connectionId);

    return (
        <>
            {leadingSeparator ? <Separator /> : null}
            <ConnectionAddRow
                isPending={startInstall.isPending}
                onPress={() => void startInstall.start()}
                title="Install on GitHub"
            />
            {candidates.map((candidate) => (
                <Fragment key={candidate.githubInstallationId}>
                    <Separator />
                    <ConnectionAddRow
                        description={githubCandidateDescription(candidate)}
                        isPending={
                            bind.isPending &&
                            bind.variables?.githubInstallationId === candidate.githubInstallationId
                        }
                        onPress={() => bind.bind(candidate.githubInstallationId)}
                        title={`Add existing installation on ${candidate.account.login}`}
                    />
                </Fragment>
            ))}
        </>
    );
}
