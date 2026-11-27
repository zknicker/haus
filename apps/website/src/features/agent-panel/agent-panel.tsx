import type * as React from 'react';
import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import { useViewportBelow } from '../../hooks/use-viewport-below.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { cn } from '../../lib/utils.ts';
import { type AgentPanelSubject, agentPanelKey } from './agent-panel-model.ts';
import { AgentPanelShortcut } from './agent-panel-shortcut.tsx';
import { useAgentPanelState } from './agent-panel-store.ts';
import { CaptainPanel } from './captain/captain-panel.tsx';
import { agentPanelWidthLimits, useAgentPanelWidth } from './use-agent-panel-width.ts';

export function AgentPanel({
    subject,
    server,
}: {
    subject: AgentPanelSubject;
    server: ServerDetail;
}) {
    const panelKey = agentPanelKey(subject);
    const { open } = useAgentPanelState(panelKey);
    return (
        <>
            <AgentPanelShortcut panelKey={panelKey} />
            {open ? (
                <AgentPanelFrame label="Captain panel">
                    <CaptainPanel agentId={subject.agentId} panelKey={panelKey} server={server} />
                </AgentPanelFrame>
            ) : null}
        </>
    );
}

function AgentPanelFrame({ children, label }: { children: React.ReactNode; label: string }) {
    const width = useAgentPanelWidth();
    const takeover = useViewportBelow(agentPanelTakeoverBelow);
    return (
        <aside
            aria-label={label}
            className={cn(
                'bg-background flex h-full min-h-0 flex-col',
                takeover ? 'absolute inset-0 z-[36]' : 'border-separator relative shrink-0 border-l'
            )}
            style={takeover ? undefined : { maxWidth: '50%', width: width.width }}
        >
            {takeover ? null : (
                <ResizablePaneRail
                    aria-label="Resize panel"
                    maxWidth={agentPanelWidthLimits.max}
                    minWidth={agentPanelWidthLimits.min}
                    onWidthChange={width.setWidth}
                    onWidthCommit={width.persistWidth}
                    side="left"
                    width={width.width}
                />
            )}
            {children}
        </aside>
    );
}

const agentPanelTakeoverBelow = 768;
