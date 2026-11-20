import type { Agent, WorkerAutomation } from '@haus/api';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Button, Chip, Separator, Tooltip } from '@heroui/react';
import { HistoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentCloudAutomations } from '../../../hooks/members/use-agent-cloud-automations.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { WorkerKeycapFace } from '../../workers/cloud-agent-provider-mark.tsx';
import { useOpenWorker } from '../../workers/use-open-worker.ts';
import { AgentLoading } from './agent-loading.tsx';
import { cloudAutomationPresentation } from './cloud-automation-model.ts';
import { ProfileListSection } from './profile-list-section.tsx';

export function AgentCloudAutomations({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const [history, setHistory] = React.useState(false);
    const query = useAgentCloudAutomations(server.id, agent.id, history);
    const now = useRelativeNow();
    return (
        <div className="space-y-2">
            <ProfileListSection
                action={
                    <Tooltip delay={0}>
                        <Button
                            aria-label={history ? 'View current Workers' : 'View Worker history'}
                            aria-pressed={history}
                            isIconOnly
                            onPress={() => setHistory(!history)}
                            size="sm"
                            variant="secondary"
                        >
                            <Icon aria-hidden="true" icon={HistoryIcon} size={16} />
                        </Button>
                        <Tooltip.Content>
                            {history ? 'View current Workers' : 'View Worker history'}
                        </Tooltip.Content>
                    </Tooltip>
                }
                count={query.data?.length}
                title={history ? 'Workers · History' : 'Workers'}
            >
                {query.isPending ? (
                    <AgentLoading label="Loading Workers" />
                ) : query.error && !query.data ? (
                    <ProfileListSection.Empty>Unable to load Workers.</ProfileListSection.Empty>
                ) : query.data?.length === 0 ? (
                    <ProfileListSection.Empty>
                        {history ? 'No Worker history yet.' : 'No Workers awaiting a result.'}
                    </ProfileListSection.Empty>
                ) : (
                    query.data?.map((row, index) => (
                        <React.Fragment key={row.worker.id}>
                            {index > 0 ? <Separator /> : null}
                            <CloudAutomationRow now={now} row={row} />
                        </React.Fragment>
                    ))
                )}
            </ProfileListSection>
            <p className="text-muted px-3 text-sm">
                {history
                    ? 'Latest 100 handoffs, including work Haus can no longer track.'
                    : `Managed by Haus. ${agent.displayName} is notified when a run finishes or needs input.`}
            </p>
        </div>
    );
}

function CloudAutomationRow({ now, row }: { now: number; row: WorkerAutomation }) {
    const openWork = useOpenWorker();
    const presentation = cloudAutomationPresentation(row, now);
    const open = () => openWork({ id: row.worker.id, location: row.location });
    return (
        <ItemCard<'button'>
            className="focus-visible:ring-focus relative w-full cursor-(--cursor-interactive) overflow-hidden text-left focus-visible:ring-2"
            onClick={open}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon aria-hidden="true" className="automation-mark">
                <WorkerKeycapFace
                    provider={row.worker.place.kind === 'computer' ? null : row.worker.place.kind}
                    size={workerRowKeySize}
                />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title className="truncate">{row.worker.title}</ItemCard.Title>
                <ItemCard.Description className="max-w-full" title={presentation.detail}>
                    {row.worker.repository} · {presentation.detail}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Tooltip delay={0}>
                    <Chip color={presentation.color} size="sm" variant="soft">
                        <Chip.Label>{presentation.label}</Chip.Label>
                    </Chip>
                    <Tooltip.Content>{presentation.detail}</Tooltip.Content>
                </Tooltip>
            </ItemCard.Action>
        </ItemCard>
    );
}

/** The stock `size-9` icon slot, in px at the default `--spacing`. */
const workerRowKeySize = 34;
