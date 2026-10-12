import { Chip } from '@heroui/react';
import type * as React from 'react';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { ArtifactFileIcon } from '../artifacts/icons/artifact-file-icon.tsx';
import { artifactFileKind } from '../artifacts/icons/artifact-file-kind.ts';
import type { SharedArtifactLinkTarget } from './shared-artifact-link.ts';
import type { SharedArtifactScope } from './shared-artifact-scope.tsx';
import { useSharedArtifactOpen } from './use-shared-artifact-open.ts';

/**
 * A library artifact linked inline: the shared reference grammar (kind mark,
 * title, dotted underline, no fill) once its metadata reads. Until then, and
 * when the artifact is missing or not visible, it stays the link the author
 * wrote, still opening in the App.
 */
export function SharedArtifactChip({
    children,
    scope,
    target,
}: {
    children: React.ReactNode;
    scope: SharedArtifactScope;
    target: SharedArtifactLinkTarget;
}) {
    const query = useArtifact(scope.serverId, target.artifactId, target.revisionId);
    const open = useSharedArtifactOpen(scope.slug, target);
    const artifact = query.data?.artifact;

    if (!artifact) {
        return (
            <a
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
                {...open}
            >
                {children}
            </a>
        );
    }

    return (
        <a
            {...open}
            aria-label={`Open ${artifact.title}`}
            className="reference-chip-trigger inline-flex max-w-full rounded-lg align-middle no-underline outline-none focus-visible:ring-2 focus-visible:ring-focus"
            data-testid="shared-artifact-chip"
            href={open.href}
        >
            <Chip
                className="reference-chip reference-chip--artifact max-w-80 whitespace-nowrap align-middle"
                size="md"
                title={artifact.title}
                variant="tertiary"
            >
                <ArtifactFileIcon
                    className="reference-chip__mark"
                    kind={artifactFileKind(artifact)}
                    size={16}
                />
                <Chip.Label className="min-w-0 truncate">{artifact.title}</Chip.Label>
            </Chip>
        </a>
    );
}
