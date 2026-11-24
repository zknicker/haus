import { cloudAgentProviders, workerRuntimeReadinessSchema } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { ProgressBar, Separator } from '@heroui/react';
import { Fragment } from 'react';
import { ProviderMark } from '../../components/provider-mark.tsx';
import { useSetComputerWorkers } from '../../hooks/computer-workers/use-set-computer-workers.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useUsage } from '../../hooks/servers/use-usage.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { percentLeft, usageColor } from '../usage/runtime-plan-windows.ts';
import { CloudAgentProviderCapability } from './cloud-agent-provider-capability.tsx';
import { supportsComputerUse } from './computer-use-model.ts';
import {
    type WorkerRuntimeView,
    planLeftLine,
    runtimeAttention,
    workerLimitChoices,
    workerRuntimeTitles,
    workerRuntimeViews,
    workersOffKey,
} from './computer-workers-model.ts';
import { SettingSelect } from './device-access-rows.tsx';
import { computerLabel, computerRuntimePresentations } from './presentation.ts';
import { RuntimeFixPopover } from './runtime-fix-popover.tsx';

export function ComputerWorkersSection({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const usage = useUsage(serverId);
    if (!computer) {
        return null;
    }
    const inventory = computer.reportedInventory;
    const runtimes = workerRuntimeViews({
        detected: new Set(
            computerRuntimePresentations(inventory)
                .filter((runtime) => runtime.detected)
                .map((runtime) => runtime.id)
        ),
        failedSignIns: new Set((inventory?.runtimeIssues ?? []).map((issue) => issue.runtimeId)),
        now: Date.now(),
        readiness: (inventory?.workerRuntimes ?? []).flatMap((reported) => {
            const parsed = workerRuntimeReadinessSchema.safeParse(reported);
            return parsed.success ? [parsed.data] : [];
        }),
        usage:
            usage.data?.computers.find((entry) => entry.computerId === computerId)?.usage ?? null,
    });
    const deviceKind = supportsComputerUse(computer) ? 'Mac' : 'device';

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Workers</ItemCardGroup.Title>
                    <ItemCardGroup.Description>
                        Coding sessions using this {deviceKind}’s logins.
                    </ItemCardGroup.Description>
                </ItemCardGroup.Header>
                <ItemCardGroup>
                    <RunWorkersRow computer={computer} serverId={serverId} />
                    {runtimes.map((runtime) => (
                        <Fragment key={runtime.id}>
                            <Separator />
                            <WorkerRuntimeRow
                                computerName={computerLabel(computer)}
                                runtime={runtime}
                            />
                        </Fragment>
                    ))}
                    {cloudAgentProviders.map((provider) => (
                        <Fragment key={provider}>
                            <Separator />
                            <CloudAgentProviderCapability
                                computerId={computerId}
                                provider={provider}
                                serverId={serverId}
                            />
                        </Fragment>
                    ))}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}

function RunWorkersRow({
    computer,
    serverId,
}: {
    computer: Parameters<typeof workerLimitChoices>[0] & { id: string };
    serverId: string;
}) {
    const setWorkers = useSetComputerWorkers(serverId);
    const choices = workerLimitChoices(computer);
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Run Workers here</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    How many Workers can run here at once.
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <SettingSelect
                    disabledKeys={choices.disabled}
                    isDisabled={choices.isDisabled || setWorkers.isPending}
                    label="Run Workers here"
                    onChange={(key) => {
                        const enabled = key !== workersOffKey;
                        withSaveErrorToast(() =>
                            setWorkers.mutateAsync({
                                computerId: computer.id,
                                enabled,
                                limit: enabled ? Number(key) : undefined,
                                serverId,
                            })
                        ).catch(() => undefined);
                    }}
                    options={choices.options}
                    value={choices.value}
                />
            </ItemCard.Action>
        </ItemCard>
    );
}

function WorkerRuntimeRow({
    computerName,
    runtime,
}: {
    computerName: string;
    runtime: WorkerRuntimeView;
}) {
    const title = workerRuntimeTitles[runtime.id];
    const attention = runtimeAttention(runtime.status);
    return (
        <ItemCard>
            <ProviderMark className="text-muted size-5 shrink-0" provider={runtime.id} />
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                {attention ? (
                    <ItemCard.Description>{attention}</ItemCard.Description>
                ) : runtime.week ? (
                    <ItemCard.Description>
                        <span className="flex items-center gap-2">
                            <ProgressBar
                                aria-label={`${title} weekly plan left`}
                                className="w-16 shrink-0"
                                color={usageColor(runtime.week.usedPercent)}
                                size="sm"
                                value={percentLeft(runtime.week)}
                            >
                                <ProgressBar.Track>
                                    <ProgressBar.Fill />
                                </ProgressBar.Track>
                            </ProgressBar>
                            {planLeftLine({ stale: runtime.stale, week: runtime.week })}
                        </span>
                    </ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            {runtime.status === 'signed-out' || runtime.status === 'not-ready' ? (
                <ItemCard.Action>
                    <RuntimeFixPopover
                        computerName={computerName}
                        detail={runtime.detail}
                        runtimeId={runtime.id}
                        status={runtime.status}
                        title={title}
                    />
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}
