import { ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import {
    useGrantAgentAccess,
    useRevokeAgentAccess,
} from '../../hooks/computer-access/use-agent-access.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { humanDirectory } from '../servers/human-identity.ts';
import { AgentAccessRows, CaptainPicker } from './agent-access-card.tsx';
import { agentAccessView } from './agent-access-model.ts';
import { ComputerUseRows } from './computer-use-access-card.tsx';
import { supportsComputerUse } from './computer-use-model.ts';
import { ComputerUseStop } from './computer-use-stop.tsx';
import { computerLabel } from './presentation.ts';

/** Who may act on this device: Captain access, then computer use on a Mac, in one card. */
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
    if (!(computer && agents.data)) {
        return null;
    }
    const view = agentAccessView({
        agents: agents.data,
        computerId,
        grants: computer.agentAccessGrants,
        personName: humanDirectory(members ?? []).name,
    });
    const isPending = grant.isPending || revoke.isPending;
    const computerUse = supportsComputerUse(computer);

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-start justify-between gap-3">
                    <ItemCardGroup.Title>Access</ItemCardGroup.Title>
                    {computer.canGrantAgentAccess ? (
                        <CaptainPicker
                            candidates={view.candidates}
                            isDisabled={isPending}
                            onPick={(agentId) => {
                                withSaveErrorToast(() =>
                                    grant.mutateAsync({ agentId, computerId, serverId })
                                ).catch(() => undefined);
                            }}
                        />
                    ) : null}
                </ItemCardGroup.Header>
                {computerUse ? (
                    <ComputerUseStop
                        computerId={computerId}
                        deviceName={computerLabel(computer)}
                        serverId={serverId}
                    />
                ) : null}
                <ItemCardGroup className="overflow-hidden">
                    <AgentAccessRows
                        canRevoke={computer.canRevokeAgentAccess}
                        isPending={isPending}
                        onRevoke={(agentId) => {
                            withSaveErrorToast(() =>
                                revoke.mutateAsync({ agentId, computerId, serverId })
                            ).catch(() => undefined);
                        }}
                        view={view}
                    />
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
