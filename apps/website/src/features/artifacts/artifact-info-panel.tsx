import type { ArtifactRecord } from '@haus/api';
import { Button, Tabs, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import type { RevisionView } from './artifact-compare-url.ts';
import { ArtifactHistory } from './artifact-history.tsx';
import { ArtifactInspector } from './artifact-inspector.tsx';
import { artifactTextRenderer } from './artifact-text.ts';

export type ArtifactInfoSection = 'details' | 'revisions';

export function useArtifactInfoPanel() {
    const location = useLocation();
    const navigate = useNavigate();
    const section = infoSection(location.hash);
    const show = (next: ArtifactInfoSection | null) =>
        navigate(
            { hash: next ?? '', pathname: location.pathname, search: location.search },
            { replace: true, state: location.state }
        );
    return {
        close: () => show(null),
        open: show,
        section,
        toggle: (next: ArtifactInfoSection) => show(section ? null : next),
    };
}

export function ArtifactInfoPanel({
    artifact,
    onClose,
    onSection,
    section,
    serverId,
    slug,
    viewHref,
}: {
    artifact: ArtifactRecord;
    onClose: () => void;
    onSection: (section: ArtifactInfoSection) => void;
    section: ArtifactInfoSection;
    serverId: string;
    slug: string;
    viewHref: (view: RevisionView) => string;
}) {
    const { hash } = useLocation();
    return (
        <aside aria-label="File details" className="artifact-info-panel">
            <Tabs
                className="flex min-h-0 flex-1 flex-col"
                onSelectionChange={(key) => onSection(key === 'details' ? 'details' : 'revisions')}
                selectedKey={section}
                variant="secondary"
            >
                <div className="artifact-info-panel__header">
                    <Tabs.ListContainer>
                        <Tabs.List aria-label="File details">
                            <Tabs.Tab id="revisions">
                                History
                                <Tabs.Indicator />
                            </Tabs.Tab>
                            <Tabs.Tab id="details">
                                Details
                                <Tabs.Indicator />
                            </Tabs.Tab>
                        </Tabs.List>
                    </Tabs.ListContainer>
                    <Tooltip delay={0}>
                        <Button
                            aria-label="Close file details"
                            className="ms-auto"
                            isIconOnly
                            onPress={onClose}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={Cancel01Icon} size={16} />
                        </Button>
                        <Tooltip.Content>Close</Tooltip.Content>
                    </Tooltip>
                </div>
                <Tabs.Panel className="artifact-info-panel__body" id="revisions">
                    <ArtifactHistory
                        artifactId={artifact.artifact_id}
                        canCompare={artifactTextRenderer(artifact) !== null}
                        serverId={serverId}
                        slug={slug}
                        viewHref={(view) => `${viewHref(view)}${hash}`}
                        viewingRevisionId={artifact.revision_id}
                    />
                </Tabs.Panel>
                <Tabs.Panel className="artifact-info-panel__body" id="details">
                    <ArtifactInspector artifact={artifact} serverId={serverId} />
                </Tabs.Panel>
            </Tabs>
        </aside>
    );
}

const sections = new Map<string, ArtifactInfoSection>([
    ['#details', 'details'],
    ['#revisions', 'revisions'],
]);

function infoSection(hash: string) {
    return sections.get(hash) ?? null;
}
