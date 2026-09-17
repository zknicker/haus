import type { Agent } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { agentProfileRoute } from '../../servers/server-routes.ts';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import { AgentPeekAutomations } from './agent-peek-automations.tsx';
import { AgentPeekChats } from './agent-peek-chats.tsx';
import { AgentPeekIdentity } from './agent-peek-identity.tsx';
import type { AgentPeekTab } from './agent-peek-model.ts';
import { AgentPeekNow } from './agent-peek-now.tsx';
import { AgentPeekTools } from './agent-peek-tools.tsx';

/**
 * A read-only look at one Agent, beside the chat you met it in. Peeking takes
 * you nowhere (docs/internals/react.md): every editable surface lives on the
 * Agent's own page, and each section here is a link to the tab that owns it.
 *
 * One scrolling column, no tabs. The pane is resizable from 420px, which is too
 * narrow for a five-word tab strip and a Close button — the strip already had
 * only 15px of headroom at the default width — and a peek that needs tabs is a
 * page wearing a pane.
 */
export function AgentPeek({
    agent,
    onClose,
    server,
}: {
    agent: Agent;
    onClose: () => void;
    server: ServerDetail;
}) {
    const navigate = useNavigate();
    // One owner for "leave the peek for the page": the pane closes behind you,
    // so coming back to this chat does not reopen what you just navigated past.
    const openProfile = React.useCallback(
        (tab: AgentPeekTab) => {
            navigate(agentProfileRoute(server.slug, agent.id, tab));
            onClose();
        },
        [agent.id, navigate, onClose, server.slug]
    );

    return (
        <AgentPeekBody>
            {/* px-3 matches the band above so the label and the content
                    share one left edge, and keeps the reading measure at the
                    pane's 420px minimum. The modules below carry their own
                    padding, so nothing here wraps them in a second one. */}

            <AgentPeekIdentity agent={agent} server={server} />
            <AgentRuntimeIssue agent={agent} />
            <AgentPeekNow
                agent={agent}
                onOpenActivity={() => openProfile('activity')}
                serverId={server.id}
            />
            <AgentPeekChats agent={agent} server={server} />
            <AgentPeekAutomations
                agent={agent}
                onOpenAutomations={() => openProfile('automations')}
                server={server}
            />
            <AgentPeekTools
                agent={agent}
                onOpenSetup={() => openProfile('setup')}
                server={server}
            />
        </AgentPeekBody>
    );
}

export function AgentPeekBody({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            <div className="flex min-w-0 flex-col gap-6 px-3 pt-2 pb-12">{children}</div>
        </div>
    );
}
