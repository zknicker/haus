import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { AgentProfileLink } from '../../members/agent-profile-link.tsx';

/**
 * Out of the transcript and into the automation itself. The owning Agent's
 * Automations tab is the one place a Trigger or Reminder can be edited,
 * disabled, or read fire-by-fire, so both provenance surfaces point there and
 * neither tries to be an editor.
 */
export function ManageInAutomationsLink({ agentId }: { agentId: string }) {
    return (
        <AgentProfileLink
            agentId={agentId}
            className="inline-flex w-fit items-center gap-1 font-semibold text-accent text-xs"
            section="automations"
        >
            Manage in Automations
            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={11} />
        </AgentProfileLink>
    );
}
