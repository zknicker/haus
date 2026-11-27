import * as React from 'react';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import { useViewShown } from '../../hooks/desktop-tabs/view-shown.ts';
import { isAgentPanelKey } from './agent-panel-key.ts';
import { toggleAgentPanel } from './agent-panel-store.ts';

export function AgentPanelShortcut({ panelKey }: { panelKey: string }) {
    const presence = useTabPresence();
    const viewShown = useViewShown();
    const active = presence.shown && presence.focusedPane;
    const onKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
        if (!(isAgentPanelKey(event) && viewShown.isShown())) {
            return;
        }
        event.preventDefault();
        if (!event.repeat) {
            toggleAgentPanel(panelKey);
        }
    });
    React.useEffect(() => {
        if (!active) {
            return;
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [active]);
    return null;
}
