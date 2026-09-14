import type { Agent, Trigger } from '@haus/api';
import { Button, Chip, Separator, Tooltip } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Add01Icon, HistoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentTriggers } from '../../../hooks/members/use-agent-triggers.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentLoading } from './agent-loading.tsx';
import {
    formatTriggerRowDetail,
    resolveTriggerSheetMode,
    type TriggerSheetState,
    triggerStatusChip,
} from './agent-trigger-model.ts';
import { ProfileListSection } from './profile-list-section.tsx';
import { TriggerHistoryDrawer } from './trigger-history-drawer.tsx';
import { TriggerSheet } from './trigger-sheet.tsx';

/** The Agent's inbound webhook wakes, authored here or from the `haus` CLI. */
export function AgentTriggers({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const canManage = server.role !== 'member';
    const triggers = useAgentTriggers(server.id, agent.id, canManage);
    // One clock for the section, not one interval per row.
    const now = useRelativeNow();
    const [sheet, setSheet] = React.useState<TriggerSheetState | null>(null);
    const [isHistoryOpen, setHistoryOpen] = React.useState(false);
    const rows = triggers.data ?? [];
    // Resolving the open drawer against the list the section renders keeps it
    // on the same record — and closes it when a delete removes that row.
    const mode = resolveTriggerSheetMode(sheet, rows);

    return (
        <>
            <ProfileListSection
                action={
                    canManage ? (
                        <div className="flex shrink-0 items-center gap-2">
                            <Tooltip delay={0}>
                                <Button
                                    aria-label="New Trigger"
                                    isIconOnly
                                    onPress={() => setSheet({ kind: 'create' })}
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                >
                                    <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                                </Button>
                                <Tooltip.Content>New Trigger</Tooltip.Content>
                            </Tooltip>
                            <Tooltip delay={0}>
                                <Button
                                    aria-label="View trigger history"
                                    isIconOnly
                                    onPress={() => setHistoryOpen(true)}
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                >
                                    <Icon aria-hidden="true" icon={HistoryIcon} size={16} />
                                </Button>
                                <Tooltip.Content>View trigger history</Tooltip.Content>
                            </Tooltip>
                        </div>
                    ) : null
                }
                count={triggers.data ? rows.length : undefined}
                title="Triggers"
            >
                {canManage && triggers.isPending ? (
                    <AgentLoading label="Loading triggers" />
                ) : triggers.error && !triggers.data ? (
                    <ProfileListSection.Empty>Unable to load triggers.</ProfileListSection.Empty>
                ) : rows.length === 0 ? (
                    <ProfileListSection.Empty>
                        No triggers yet. Add one for an outside event, or ask {agent.displayName} to
                        wire one up.
                    </ProfileListSection.Empty>
                ) : (
                    rows.map((trigger, index) => (
                        <React.Fragment key={trigger.id}>
                            {index > 0 ? <Separator /> : null}
                            <TriggerRow
                                canManage={canManage}
                                now={now}
                                onSelect={() => setSheet({ kind: 'detail', triggerId: trigger.id })}
                                trigger={trigger}
                            />
                        </React.Fragment>
                    ))
                )}
            </ProfileListSection>
            <TriggerSheet
                agent={agent}
                mode={mode}
                onCreated={(created) => setSheet({ kind: 'detail', triggerId: created.id })}
                onOpenChange={(open) => {
                    if (!open) {
                        setSheet(null);
                    }
                }}
                serverId={server.id}
            />
            {canManage ? (
                <TriggerHistoryDrawer
                    agentId={agent.id}
                    isOpen={isHistoryOpen}
                    onOpenChange={setHistoryOpen}
                    serverId={server.id}
                    serverSlug={server.slug}
                />
            ) : null}
        </>
    );
}

/**
 * The row states the Trigger and nothing more: every action on it lives in the
 * drawer the row opens, so there is one place a Trigger is operated. The whole
 * row is the press target, using the stock pressable ItemCard rather than a
 * hand-built control inside the title.
 */
function TriggerRow({
    canManage,
    now,
    onSelect,
    trigger,
}: {
    canManage: boolean;
    now: number;
    onSelect: () => void;
    trigger: Trigger;
}) {
    const status = triggerStatusChip(trigger.status);
    const content = (
        <ItemCard.Content>
            <ItemCard.Title>
                {trigger.title}
                <Chip className="ms-2 align-middle" color={status.color} size="sm" variant="soft">
                    {status.label}
                </Chip>
            </ItemCard.Title>
            <ItemCard.Description className="tabular-nums">
                {formatTriggerRowDetail(trigger, now)}
            </ItemCard.Description>
        </ItemCard.Content>
    );

    if (!canManage) {
        return <ItemCard>{content}</ItemCard>;
    }

    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onSelect}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {content}
        </ItemCard>
    );
}
