import type { Trigger } from '@haus/api';
import { Separator, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type * as React from 'react';
import { useTriggerSetStatus } from '../../../hooks/members/use-trigger-set-status.ts';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import {
    formatTriggerActivity,
    triggerCreatorName,
    triggerKindLabel,
} from './agent-trigger-model.ts';

/**
 * What this Trigger is, as rows: the one state someone can change, then the
 * three facts the heading used to pack into a single prose line. A fact on a
 * row can be read at a glance and stays true as the drawer grows; the same
 * fact in a sentence has to be parsed and rewritten every time one is added.
 */
export function TriggerSummaryGroup({
    agentId,
    ownerName,
    serverId,
    trigger,
}: {
    agentId: string;
    ownerName: string;
    serverId: string;
    trigger: Trigger;
}) {
    const setStatus = useTriggerSetStatus(serverId, agentId);
    const isArmed = trigger.status === 'armed';

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Trigger</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        {/* The switch already says which way it is set, so the
                            row does not narrate both directions underneath. */}
                        <ItemCard.Title>Active</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label="Active"
                            isDisabled={setStatus.isPending}
                            isSelected={isArmed}
                            onChange={(selected) =>
                                setStatus.setStatus(trigger.id, selected ? 'armed' : 'disabled')
                            }
                        >
                            <Switch.Content>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch.Content>
                        </Switch>
                    </ItemCard.Action>
                </ItemCard>
                <Separator />
                <TriggerFactRow title="Type">{triggerKindLabel(trigger.kind)}</TriggerFactRow>
                <Separator />
                <TriggerFactRow title="Created by">
                    {triggerCreatorName(trigger, ownerName)}
                </TriggerFactRow>
                <Separator />
                <TriggerFactRow title="Activity">{formatTriggerActivity(trigger)}</TriggerFactRow>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function TriggerFactRow({ children, title }: { children: React.ReactNode; title: string }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action className="min-w-0 shrink">
                <SettingsFact className="block truncate text-right">{children}</SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
