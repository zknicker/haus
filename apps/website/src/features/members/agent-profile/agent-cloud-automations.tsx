import type { Agent, CloudAgentAutomation } from '@haus/api';
import { Button, Chip, Separator, Tooltip } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { HistoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { currentOpenGesture } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useAgentCloudAutomations } from '../../../hooks/members/use-agent-cloud-automations.ts';
import { useThreadOpener } from '../../../hooks/threads/use-thread-opener.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { CloudAgentKeycapFace } from '../../cloud-agents/cloud-agent-provider-mark.tsx';
import { useOpenCloudAgentWork } from '../../cloud-agents/use-open-cloud-agent-work.ts';
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
                            aria-label={
                                history ? 'View current cloud agents' : 'View cloud agent history'
                            }
                            aria-pressed={history}
                            isIconOnly
                            onPress={() => setHistory(!history)}
                            size="sm"
                            variant="secondary"
                        >
                            <Icon aria-hidden="true" icon={HistoryIcon} size={16} />
                        </Button>
                        <Tooltip.Content>
                            {history ? 'View current cloud agents' : 'View cloud agent history'}
                        </Tooltip.Content>
                    </Tooltip>
                }
                count={query.data?.length}
                title={history ? 'Cloud agents · History' : 'Cloud agents'}
            >
                {query.isPending ? (
                    <AgentLoading label="Loading cloud agents" />
                ) : query.error && !query.data ? (
                    <ProfileListSection.Empty>
                        Unable to load cloud agents.
                    </ProfileListSection.Empty>
                ) : query.data?.length === 0 ? (
                    <ProfileListSection.Empty>
                        {history
                            ? 'No cloud agent history yet.'
                            : 'No cloud agents awaiting a result.'}
                    </ProfileListSection.Empty>
                ) : (
                    query.data?.map((row, index) => (
                        <React.Fragment key={row.work.id}>
                            {index > 0 ? <Separator /> : null}
                            <CloudAutomationRow now={now} row={row} serverSlug={server.slug} />
                        </React.Fragment>
                    ))
                )}
            </ProfileListSection>
            <p className="px-3 text-muted text-sm">
                {history
                    ? 'Latest 100 handoffs, including work Haus can no longer track.'
                    : `Managed by Haus. ${agent.displayName} is notified when a run finishes or needs input.`}
            </p>
        </div>
    );
}

function CloudAutomationRow({
    now,
    row,
    serverSlug,
}: {
    now: number;
    row: CloudAgentAutomation;
    serverSlug: string;
}) {
    const openThread = useThreadOpener(serverSlug);
    const openWork = useOpenCloudAgentWork();
    const presentation = cloudAutomationPresentation(row, now);
    const open = () => {
        // History must open the actual Thread: the active-work peek excludes settled work.
        if (row.location.kind === 'work-thread') {
            openThread(row.conversationChatId, row.location.anchorMessageId, currentOpenGesture());
        } else {
            openWork({ id: row.work.id, location: row.location });
        }
    };
    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-focus"
            onClick={open}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon aria-hidden="true" className="automation-mark">
                <CloudAgentKeycapFace provider={row.work.provider} size={cloudAgentRowKeySize} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title className="truncate">{row.work.title}</ItemCard.Title>
                <ItemCard.Description className="max-w-full" title={presentation.detail}>
                    {row.work.repository} · {presentation.detail}
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
const cloudAgentRowKeySize = 34;
