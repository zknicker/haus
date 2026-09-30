import {
    type ArtifactTab,
    artifactTabLabel,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { ClosableWorkspaceTab } from './closable-workspace-tab.tsx';
import { ArtifactTabMark } from './workspace-tab-mark.tsx';

export function ArtifactWorkspaceTab({ tab }: { tab: ArtifactTab }) {
    const label = artifactTabLabel(tab);
    return (
        <ClosableWorkspaceTab
            label={label}
            mark={<ArtifactTabMark />}
            tabRef={{ kind: 'artifact', key: tab.key }}
            tooltip={
                <>
                    <p>{label}</p>
                    <p className="text-muted text-xs">
                        {[tab.source, tab.target.path].filter(Boolean).join(' · ')}
                    </p>
                </>
            }
        />
    );
}
