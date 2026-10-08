import type { Trigger } from '@haus/api';
import { Separator, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useTriggerSetStatus } from '../../../hooks/members/use-trigger-set-status.ts';
import { formatTriggerActivity, triggerCreatorName } from './agent-trigger-model.ts';
import { AutomationFactRow } from './automation-fact-row.tsx';

/**
 * What this Trigger is, as rows: the one state someone can change, then the
 * facts about it. A fact on a row can be read at a glance and stays true as the
 * drawer grows. Its kind is not one of them: the sheet's header already says
 * "Webhook trigger".
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
                <AutomationFactRow title="Created by">
                    {triggerCreatorName(trigger, ownerName)}
                </AutomationFactRow>
                <Separator />
                <AutomationFactRow title="Activity">
                    {formatTriggerActivity(trigger)}
                </AutomationFactRow>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
