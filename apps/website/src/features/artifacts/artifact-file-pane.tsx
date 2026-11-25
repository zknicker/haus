import type { ArtifactRecord } from '@haus/api';
import { HistoryIcon, SourceCodeIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { useArtifactPublicLink } from '../../hooks/artifacts/use-artifact-public-link.ts';
import { useViewShown } from '../../hooks/desktop-tabs/view-shown.ts';
import type { RevisionView } from './artifact-compare-url.ts';
import { ArtifactCompare } from './artifact-compare.tsx';
import { type ArtifactDocumentMode, ArtifactDocument } from './artifact-document.tsx';
import type { useArtifactInfoPanel } from './artifact-info-panel.tsx';
import {
    ArtifactCopyButton,
    ArtifactDownloadButton,
    ArtifactFileOptions,
    PathToggleButton,
    SaveButton,
    type ViewerStepper,
    ViewerSteps,
} from './artifact-path-actions.tsx';
import { type ArtifactPathCrumb, ArtifactPathRow } from './artifact-path-row.tsx';
import { ArtifactPreview } from './artifact-preview.tsx';
import { PublicLinkChip } from './artifact-public-link-mark.tsx';
import { artifactTextEditable } from './artifact-text-edit.ts';
import { artifactTextRenderer } from './artifact-text.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactTextSession } from './use-artifact-text-session.ts';

export interface ArtifactFilePaneView {
    compareFrom: string | null;
    crumbs: readonly ArtifactPathCrumb[];
    glyph: React.ReactNode;
    info: ReturnType<typeof useArtifactInfoPanel>;
    latestHref: string | null;
    onCompareView: (next: RevisionView, options?: { replace?: boolean }) => void;
    pinnedRevisionId: string | undefined;
    startEditing: boolean;
    startZoomed: boolean;
    stepper: ViewerStepper | null;
    zoomStepper: ViewerStepper | null;
}

export function ArtifactFilePane({
    artifact,
    serverId,
    view,
}: {
    artifact: ArtifactRecord;
    serverId: string;
    view: ArtifactFilePaneView;
}) {
    const renderer = artifactTextRenderer(artifact);
    if (renderer && artifactTextEditable(artifact, { pinned: false })) {
        return (
            <TextFilePane
                artifact={artifact}
                key={`${artifact.artifact_id}:${view.pinnedRevisionId ?? 'head'}`}
                renderer={renderer}
                serverId={serverId}
                view={view}
            />
        );
    }
    return (
        <>
            <FilePathRow artifact={artifact} serverId={serverId} text={null} view={view} />
            <PaneBody>
                {view.compareFrom ? (
                    <Compare artifact={artifact} serverId={serverId} view={view} />
                ) : (
                    <div className="pt-2 pb-6">
                        <ArtifactPreview
                            artifact={artifact}
                            key={artifact.revision_id}
                            serverId={serverId}
                            startZoomed={view.startZoomed}
                            stepper={view.zoomStepper}
                        />
                    </div>
                )}
            </PaneBody>
        </>
    );
}

function TextFilePane({
    artifact,
    renderer,
    serverId,
    view,
}: {
    artifact: ArtifactRecord;
    renderer: NonNullable<ReturnType<typeof artifactTextRenderer>>;
    serverId: string;
    view: ArtifactFilePaneView;
}) {
    const session = useArtifactTextSession({
        artifact,
        pinnedRevisionId: view.pinnedRevisionId,
        serverId,
    });
    const plain = renderer === 'code' && artifactFileKind(artifact) === 'text';
    const [mode, setMode] = React.useState<ArtifactDocumentMode>(plain ? 'source' : 'rendered');
    const sourceToggle =
        plain || view.compareFrom ? null : (
            <PathToggleButton
                icon={SourceCodeIcon}
                isSelected={mode === 'source'}
                label="View source"
                onChange={(selected) => setMode(selected ? 'source' : 'rendered')}
            />
        );
    useSaveShortcut(session.save);
    return (
        <>
            <FilePathRow
                artifact={artifact}
                dirty={session.dirty}
                leading={sourceToggle}
                onDiscard={session.discard}
                save={
                    session.dirty && !view.pinnedRevisionId ? (
                        <SaveButton isPending={session.saving} onPress={session.save} />
                    ) : null
                }
                serverId={serverId}
                text={session.text}
                view={view}
            />
            <PaneBody>
                {view.compareFrom ? (
                    <Compare artifact={artifact} serverId={serverId} view={view} />
                ) : (
                    <ArtifactDocument
                        artifact={artifact}
                        autoFocus={view.startEditing}
                        mode={mode}
                        renderer={renderer}
                        serverId={serverId}
                        session={session}
                    />
                )}
            </PaneBody>
        </>
    );
}

function useSaveShortcut(save: () => void) {
    const shown = useViewShown();
    const onKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
        const command = event.metaKey || event.ctrlKey;
        if (!command || event.key.toLowerCase() !== 's' || !shown.isShown()) {
            return;
        }
        event.preventDefault();
        if (!event.repeat) {
            save();
        }
    });
    React.useEffect(() => {
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}

function FilePathRow({
    artifact,
    dirty = false,
    leading = null,
    onDiscard,
    save = null,
    serverId,
    text,
    view,
}: {
    artifact: ArtifactRecord;
    dirty?: boolean;
    leading?: React.ReactNode;
    onDiscard?: () => void;
    save?: React.ReactNode;
    serverId: string;
    text: string | null;
    view: ArtifactFilePaneView;
}) {
    const publicLink = useArtifactPublicLink(serverId, artifact.artifact_id);
    const { info } = view;
    const status = view.pinnedRevisionId ? (
        <>
            Revision {artifact.revision_number}
            {view.latestHref ? (
                <>
                    {' · '}
                    <Link className="text-accent" to={view.latestHref}>
                        Open latest
                    </Link>
                </>
            ) : null}
        </>
    ) : null;
    return (
        <ArtifactPathRow
            crumbs={view.crumbs}
            current={artifact.filename}
            glyph={view.glyph}
            status={status}
        >
            {publicLink ? <PublicLinkChip /> : null}
            {view.stepper ? (
                <span className="flex items-center gap-1 @3xl/viewer:hidden">
                    <ViewerSteps stepper={view.stepper} />
                </span>
            ) : null}
            {leading}
            <PathToggleButton
                icon={HistoryIcon}
                isSelected={info.section !== null}
                label="History"
                onChange={() => info.toggle('revisions')}
            />
            {text === null ? null : <ArtifactCopyButton text={text} />}
            <ArtifactDownloadButton artifact={artifact} />
            {save}
            <ArtifactFileOptions
                artifact={artifact}
                canDiscard={dirty && onDiscard !== undefined}
                onOption={(id) => (id === 'details' ? info.open('details') : onDiscard?.())}
                publicLink={publicLink}
            />
        </ArtifactPathRow>
    );
}

function PaneBody({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
            {children}
        </div>
    );
}

function Compare({
    artifact,
    serverId,
    view,
}: {
    artifact: ArtifactRecord;
    serverId: string;
    view: ArtifactFilePaneView;
}) {
    return (
        <div className="py-6">
            <ArtifactCompare
                artifact={artifact}
                fromRevisionId={view.compareFrom ?? ''}
                onView={view.onCompareView}
                serverId={serverId}
            />
        </div>
    );
}
