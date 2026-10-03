import * as React from 'react';
import { type Location, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { WorkspaceTabs } from '../../hooks/workspace-tabs/use-workspace-tabs.ts';
import { primaryTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { resolveAgentProfileTarget } from '../../routes/app/server-route-state.ts';
import { serverRoute } from '../servers/server-routes.ts';
import { agentAddressHandBack, revealsRoutedPage } from './routed-page-reveal.ts';

/**
 * How routed navigation meets the workspace tabs. A navigation reveals the
 * routed page under a covering tab (`revealsRoutedPage`). On desktop an Agent's
 * profile address (a deep link, a new window, an old bookmark) is a tab, not a
 * main-pane destination: it opens the Agent tab and puts the routed page back
 * where it was (`agentAddressHandBack`), or on the Server's default page when
 * there was none.
 */
export function useRoutedPageTabs({
    openAgent,
    selectTab,
    server,
}: Pick<WorkspaceTabs, 'openAgent' | 'selectTab'> & { server: ServerDetail }) {
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();
    const routed = React.useRef<Location | null>(null);
    /** The last routed page, the place an Agent address hands back to. */
    const page = React.useRef<string | null>(null);
    const handingBack = React.useRef(false);
    // A layout effect, so a page's own open on arrival (a `?thread=` link) lands after the reveal.
    React.useLayoutEffect(() => {
        const previous = routed.current;
        routed.current = location;
        const agent = getDesktopBridge()?.browserCommand
            ? resolveAgentProfileTarget(location.pathname, server.slug)
            : null;
        if (agent) {
            openAgent(agent.agentId, { section: agent.section });
            handingBack.current = true;
            const handBack = agentAddressHandBack(previous, navigationType, {
                fallback: serverRoute(server.slug),
                page: page.current,
            });
            if (handBack.kind === 'back') {
                navigate(-1);
            } else {
                navigate(handBack.to, { replace: true });
            }
            return;
        }
        page.current = `${location.pathname}${location.search}${location.hash}`;
        if (handingBack.current) {
            // Handing the page back must not hide the Agent tab just opened.
            handingBack.current = false;
            return;
        }
        if (revealsRoutedPage(previous, location, navigationType)) {
            selectTab(primaryTabRef);
        }
    }, [location, navigate, navigationType, openAgent, selectTab, server.slug]);
}
