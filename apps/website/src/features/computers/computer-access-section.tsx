import { ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { useLocation } from 'react-router-dom';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { agentAccessView } from './agent-access-model.ts';
import { supportsComputerUse } from './computer-use-model.ts';
import { ComputerUseStop } from './computer-use-stop.tsx';
import {
    CaptainAccessRow,
    CaptainAccessUnresolved,
    ComputerUseRow,
} from './device-access-rows.tsx';
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
    const location = useLocation();
    if (!computer) {
        return null;
    }
    const computerUse = supportsComputerUse(computer);
    const deviceKind = computerUse ? 'Mac' : 'device';

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
                    <ComputerUseStop
                        computerId={computerId}
                        deviceName={computerLabel(computer)}
                        serverId={serverId}
                    />
                ) : null}
                <ItemCardGroup>
                    {agents.data ? (
                        <CaptainAccessRow
                            computer={computer}
                            deviceKind={deviceKind}
                            serverId={serverId}
                            view={agentAccessView({
                                agents: agents.data,
                                computerId,
                                grants: computer.agentAccessGrants,
                            })}
                        />
                    ) : (
                        <CaptainAccessUnresolved
                            onRetry={agents.isError ? () => void agents.refetch() : null}
                        />
                    )}
                    {computerUse ? (
                        <>
                            <Separator />
                            <ComputerUseRow computer={computer} serverId={serverId} />
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
