import type { GithubInstallation, GithubInstallCandidate } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Description, Dropdown, Label, Separator } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, useState } from 'react';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useGithubBindInstallation } from '../../../../../hooks/github/use-github-bind-installation.ts';
import { useGithubInstallCandidates } from '../../../../../hooks/github/use-github-install-candidates.ts';
import { useGithubInstallations } from '../../../../../hooks/github/use-github-installations.ts';
import { useGithubStartInstall } from '../../../../../hooks/github/use-github-start-install.ts';
import { SettingsEmptyRow } from '../../../layout/settings-empty.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../../../layout/settings-row-title.tsx';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
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
 * the header's add control appears only while it is connected; existing rows
 * stay listed either way, because disconnecting keeps installations.
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
            <ConnectionSection
                action={
                    connection.connected ? (
                        <InstallAction
                            candidates={candidates.data ?? []}
                            connectionId={connection.id}
                            serverId={serverId}
                        />
                    ) : null
                }
                count={rows.length > 0 ? rows.length : undefined}
                title="Installations"
            >
                <ItemCardGroup>
                    {rows.length > 0 ? (
                        rows.map((installation, index) => (
                            <Fragment key={installation.id}>
                                {index > 0 ? <Separator /> : null}
                                <InstallationRow
                                    installation={installation}
                                    onRemove={() => setRemoving(installation)}
                                />
                            </Fragment>
                        ))
                    ) : (
                        <SettingsEmptyRow>No installations yet.</SettingsEmptyRow>
                    )}
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
                <SettingsStatusTitle
                    status={
                        status ? (
                            <SettingsStatusChip
                                color={installation.status === 'active' ? 'warning' : 'danger'}
                            >
                                {status}
                            </SettingsStatusChip>
                        ) : null
                    }
                >
                    {login}
                </SettingsStatusTitle>
                <ItemCard.Description className="tabular-nums">
                    {githubRepositoryScopeLabel(installation)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
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
 * The section's add control. Install on GitHub is the whole control until
 * GitHub reports installations the signed-in user owns and Haus has not
 * bound; then one Add menu offers both, each existing installation one
 * press away.
 */
function InstallAction({
    candidates,
    connectionId,
    serverId,
}: {
    candidates: readonly GithubInstallCandidate[];
    connectionId: string;
    serverId: string;
}) {
    const startInstall = useGithubStartInstall(serverId, connectionId);
    const bind = useGithubBindInstallation(serverId, connectionId);

    if (candidates.length === 0) {
        return (
            <Button
                isPending={startInstall.isPending}
                onPress={() => void startInstall.start()}
                size="sm"
                variant="secondary"
            >
                Install on GitHub
            </Button>
        );
    }

    return (
        <Dropdown>
            <Button
                isPending={startInstall.isPending || bind.isPending}
                size="sm"
                variant="secondary"
            >
                Add installation
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item
                        id="install"
                        onAction={() => void startInstall.start()}
                        textValue="Install on GitHub"
                    >
                        <Label>Install on GitHub</Label>
                    </Dropdown.Item>
                    {candidates.map((candidate) => (
                        <Dropdown.Item
                            id={`candidate-${candidate.githubInstallationId}`}
                            key={candidate.githubInstallationId}
                            onAction={() => bind.bind(candidate.githubInstallationId)}
                            textValue={`Add existing installation on ${candidate.account.login}`}
                        >
                            <Label>Add existing installation on {candidate.account.login}</Label>
                            <Description>{githubCandidateDescription(candidate)}</Description>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
