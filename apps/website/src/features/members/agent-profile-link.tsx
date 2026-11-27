import { Link, type LinkProps, useParams } from 'react-router-dom';
import { showCaptainPanel, useOpenCaptain } from '../../hooks/agents/use-open-captain.ts';
import { usePreloadAgentProfile } from '../../hooks/members/use-preload-agent-profile.ts';
import { usePressNavigation } from '../../hooks/shell/use-press-navigation.ts';
import { type CaptainDrill, captainSectionForDrill } from '../agent-panel/agent-panel-model.ts';
import { captainChatRoute } from '../agent-panel/captain-chat-route.ts';
import { agentProfileRoute } from '../servers/server-routes.ts';

/**
 * A real link to a Captain — middle-click and copy-link keep its chat's route — that warms the
 * chat and panel on hover or focus and opens it on a plain mouse press, with the panel on
 * Overview or `drill`. Keyboard and other clicks open it through `useOpenCaptain`. On desktop,
 * Command-click and middle-click open a new tab (the desktop shell's link handler, ADR 0039).
 */
export function AgentProfileLink({
    agentId,
    drill,
    onFocus,
    onMouseEnter,
    ...props
}: Omit<LinkProps, 'onClick' | 'to'> & { agentId: string; drill?: CaptainDrill }) {
    const { slug = '' } = useParams();
    const openCaptain = useOpenCaptain();
    const preload = usePreloadAgentProfile(agentId);
    const href = drill
        ? agentProfileRoute(slug, agentId, captainSectionForDrill(drill))
        : captainChatRoute(slug, agentId);
    const pressRef = usePressNavigation(href, () => {
        preload();
        showCaptainPanel(agentId, { drill });
    });

    return (
        <Link
            {...props}
            onClick={(event) => {
                if (event.button !== 0 || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                openCaptain(agentId, { drill });
            }}
            onFocus={(event) => {
                preload();
                onFocus?.(event);
            }}
            onMouseEnter={(event) => {
                preload();
                onMouseEnter?.(event);
            }}
            ref={pressRef}
            to={href}
        />
    );
}
