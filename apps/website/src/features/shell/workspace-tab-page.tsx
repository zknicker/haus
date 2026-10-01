import {
    type AppTabRef,
    artifactTabLabel,
    type ClosableTabRef,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { cn } from '../../lib/utils.ts';
import { AgentWorkspacePage } from './agent-workspace-page.tsx';
import { ArtifactWorkspacePage } from './artifact-workspace-page.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspacePage } from './browser-workspace-page.tsx';
import { ThreadWorkspacePage } from './thread-workspace-page.tsx';

/**
 * One closable tab's body, wherever the layout shows it: the side pane in
 * split mode, over the routed page in expanded mode. A browser tab's native
 * page follows this body's host element, so it moves with it.
 */
export function ClosableTabPage({
    className,
    tabRef,
}: {
    className?: string;
    tabRef: ClosableTabRef;
}) {
    if (tabRef.kind === 'browser') {
        return <BrowserWorkspacePage className={className} id={tabRef.id} />;
    }
    return <AppTabPage className={className} tabRef={tabRef} />;
}

function AppTabPage({ className, tabRef }: { className?: string; tabRef: AppTabRef }) {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    const sectionClass = cn('flex min-h-0 flex-col bg-background', className);
    if (tabRef.kind === 'agent') {
        const tab = workspace.agents.find((item) => item.agentId === tabRef.agentId);
        return tab ? (
            <section
                aria-label="Agent profile"
                className={sectionClass}
                key={workspaceTabId(tabRef)}
            >
                <AgentWorkspacePage tab={tab} />
            </section>
        ) : null;
    }
    if (tabRef.kind === 'thread') {
        return (
            <section aria-label="Thread" className={sectionClass} key={workspaceTabId(tabRef)}>
                <ThreadWorkspacePage tabRef={tabRef} />
            </section>
        );
    }
    const tab = workspace.artifacts.find((item) => item.key === tabRef.key);
    return tab ? (
        <section
            aria-label={`Artifact: ${artifactTabLabel(tab)}`}
            className={sectionClass}
            key={workspaceTabId(tabRef)}
        >
            <ArtifactWorkspacePage serverId={workspace.serverId} tab={tab} />
        </section>
    ) : null;
}
