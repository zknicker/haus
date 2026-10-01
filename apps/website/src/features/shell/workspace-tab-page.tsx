import {
    type AppTabRef,
    artifactTabLabel,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { cn } from '../../lib/utils.ts';
import { AgentWorkspacePage } from './agent-workspace-page.tsx';
import { ArtifactWorkspacePage } from './artifact-workspace-page.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * The main strip's selected App-local tab. It covers the mounted routed page
 * like a browser page does; split tabs never cover it.
 */
export function MainWorkspaceTabPage() {
    const active = useBrowserWorkspace()?.activeTab;
    if (!(active && (active.kind === 'artifact' || active.kind === 'agent'))) {
        return null;
    }
    return <WorkspaceTabPage className="absolute inset-0 z-10" tabRef={active} />;
}

/** One App-local tab's body, in whichever group shows it. */
export function WorkspaceTabPage({ className, tabRef }: { className?: string; tabRef: AppTabRef }) {
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
