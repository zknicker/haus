import type { ComputerAddRepoFolderResult } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Link, Modal } from '@heroui/react';
import { GithubIcon } from '@hugeicons-pro/core-solid-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useRepos } from '../../../hooks/repos/use-repos.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { serverComputerRoute } from '../../servers/server-routes.ts';
import { SettingsStatusChip, SettingsStatusTitle } from '../layout/settings-row-title.tsx';
import { SettingsFact, SettingsRowWarning } from '../layout/settings-text.tsx';
import { deviceReachNotice } from './add-repo-devices.ts';
import { RepoAccessActions } from './repo-access-actions.tsx';
import { repoAccessChips } from './repo-access.ts';

export function AddRepoResult({
    added,
    onAddAnother,
    onClose,
    serverId,
    serverSlug,
}: {
    added: ComputerAddRepoFolderResult & { computerId: string };
    onAddAnother: () => void;
    onClose: () => void;
    serverId: string;
    serverSlug: string;
}) {
    const listed = useRepos(serverId).data?.repos.find(
        (repo) => repo.repository === added.repository
    );
    const access = listed?.githubAccess ?? added.githubAccess;
    const chip = repoAccessChips[access.status];

    return (
        <>
            <Modal.Header>
                <Modal.Heading>{added.added ? 'Repository added' : 'Already added'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <div className="flex flex-col gap-3">
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Icon>
                                <Icon aria-hidden="true" icon={GithubIcon} />
                            </ItemCard.Icon>
                            <ItemCard.Content>
                                <SettingsStatusTitle
                                    status={
                                        <SettingsStatusChip color={chip.color}>
                                            {chip.label}
                                        </SettingsStatusChip>
                                    }
                                >
                                    {added.repository}
                                </SettingsStatusTitle>
                                <ItemCard.Description>
                                    <SettingsFact className="font-mono" title={added.path}>
                                        {added.path}
                                    </SettingsFact>
                                </ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <RepoAccessActions
                                    access={access}
                                    serverId={serverId}
                                    serverSlug={serverSlug}
                                />
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                    {access.status === 'app-needs-access' ? (
                        <p>
                            Captains push and open pull requests through the Haus GitHub App, which
                            needs access to {added.repository}.
                        </p>
                    ) : null}
                    <DeviceReach
                        computerId={added.computerId}
                        serverId={serverId}
                        serverSlug={serverSlug}
                    />
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onAddAnother} variant="secondary">
                    Add another
                </Button>
                <Button onPress={onClose}>Done</Button>
            </Modal.Footer>
        </>
    );
}

function DeviceReach({
    computerId,
    serverId,
    serverSlug,
}: {
    computerId: string;
    serverId: string;
    serverSlug: string;
}) {
    const computer = useComputers(serverId).data?.find((candidate) => candidate.id === computerId);
    const agents = useAgents(serverId).data;
    const notice = computer && agents ? deviceReachNotice(computer, agents) : null;
    if (!notice) {
        return null;
    }
    return (
        <SettingsRowWarning>
            {`${notice} `}
            <Link href={`${serverComputerRoute(serverSlug, computerId)}#access`}>Open Access</Link>
        </SettingsRowWarning>
    );
}
