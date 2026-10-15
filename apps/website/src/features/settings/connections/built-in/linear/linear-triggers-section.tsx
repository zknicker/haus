import type { LinearTrigger } from '@haus/api';
import { Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useLinearTriggers } from '../../../../../hooks/linear/use-linear-triggers.ts';
import { triggerRowStatus } from '../../../../members/agent-profile/agent-trigger-model.ts';
import { useServerContext } from '../../../../servers/server-context.ts';
import { agentProfileRoute } from '../../../../servers/server-routes.ts';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
import type { BuiltInConnectionSectionProps } from '../built-in-connection-definition.ts';

/**
 * The Agents' `linear` Triggers on this workspace, read-only: each row opens
 * its Agent's Automations, where Triggers are managed. Absent while there are
 * none, since Agents create them from chat.
 */
export function LinearTriggersSection({ connection, serverId }: BuiltInConnectionSectionProps) {
    const rows = useLinearTriggers(serverId, connection.id).data;
    if (!rows || rows.length === 0) {
        return null;
    }

    return (
        <ConnectionSection count={rows.length} title="Triggers">
            <ItemCardGroup variant="outline">
                {rows.map((trigger, index) => (
                    <Fragment key={trigger.id}>
                        {index > 0 ? <Separator /> : null}
                        <TriggerRow trigger={trigger} />
                    </Fragment>
                ))}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function TriggerRow({ trigger }: { trigger: LinearTrigger }) {
    const navigate = useNavigate();
    const { slug } = useServerContext().server;
    const status = triggerRowStatus(trigger);

    return (
        <ItemCard<'button'>
            aria-label={`Open ${trigger.title} in @${trigger.ownerHandle}'s Automations`}
            onClick={() => navigate(agentProfileRoute(slug, trigger.ownerAgentId, 'automations'))}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Content>
                <ItemCard.Title>{trigger.title}</ItemCard.Title>
                <ItemCard.Description className="max-w-full truncate">
                    @{trigger.ownerHandle}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-2">
                {status ? (
                    <Chip color="warning" size="sm" variant="soft">
                        <Chip.Label>{status}</Chip.Label>
                    </Chip>
                ) : null}
                <Icon aria-hidden="true" className="text-muted" icon={ArrowRight01Icon} size={16} />
            </ItemCard.Action>
        </ItemCard>
    );
}
