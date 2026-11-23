import { ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { useLocation } from 'react-router-dom';
import {
    useGrantAgentAccess,
    useRevokeAgentAccess,
} from '../../hooks/computer-access/use-agent-access.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { humanDirectory } from '../servers/human-identity.ts';
import { CaptainAccessRows, CaptainAccessUnresolved } from './agent-access-card.tsx';
import { agentAccessView } from './agent-access-model.ts';
import { ComputerUseRows } from './computer-use-access-card.tsx';
import { supportsComputerUse } from './computer-use-model.ts';
import { ComputerUsePermissionNotices } from './computer-use-permissions.tsx';
import { ComputerUseStop } from './computer-use-stop.tsx';
import { ComputerWorkersRow } from './computer-workers-row.tsx';
import { computerLabel } from './presentation.ts';

const accessSectionId = 'access';

export function ComputerAccessSection({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const agents = useAgents(serverId);
    const members = useMembers(serverId).data?.members;
    const grant = useGrantAgentAccess(serverId);
    const revoke = useRevokeAgentAccess(serverId);
    const location = useLocation();
    if (!computer) {
        return null;
    }
    const view = agents.data
        ? agentAccessView({
              agents: agents.data,
              computerId,
              grants: computer.agentAccessGrants,
              personName: humanDirectory(members ?? []).name,
          })
        : null;
    const isPending = grant.isPending || revoke.isPending;
    const computerUse = supportsComputerUse(computer);
    const deviceName = computerLabel(computer);

    return (
        <section
            id={accessSectionId}
            ref={location.hash === `#${accessSectionId}` ? scrollIntoView : undefined}
        >
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Access</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {computerUse ? (
                    <>
                        <ComputerUseStop
                            computerId={computerId}
                            deviceName={deviceName}
                            serverId={serverId}
                        />
                        {computer.computerUseEnabled ? (
                            <ComputerUsePermissionNotices
                                deviceName={deviceName}
                                readiness={computer.reportedInventory?.computerUse}
                            />
                        ) : null}
                    </>
                ) : null}
                <ItemCardGroup>
                    {view ? (
                        <CaptainAccessRows
                            canGrant={computer.canGrantAgentAccess}
                            canRevoke={computer.canRevokeAgentAccess}
                            isPending={isPending}
                            onGrant={(agentId) => {
                                withSaveErrorToast(() =>
                                    grant.mutateAsync({ agentId, computerId, serverId })
                                ).catch(() => undefined);
                            }}
                            onRevoke={(agentId) => {
                                withSaveErrorToast(() =>
                                    revoke.mutateAsync({ agentId, computerId, serverId })
                                ).catch(() => undefined);
                            }}
                            view={view}
                        />
                    ) : (
                        <CaptainAccessUnresolved
                            onRetry={agents.isError ? () => void agents.refetch() : null}
                        />
                    )}
                    <Separator />
                    <ComputerWorkersRow computer={computer} serverId={serverId} />
                    {computerUse ? (
                        <>
                            <Separator />
                            <ComputerUseRows computer={computer} serverId={serverId} />
                        </>
                    ) : null}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

function scrollIntoView(node: HTMLElement | null) {
    node?.scrollIntoView({ block: 'start' });
}
