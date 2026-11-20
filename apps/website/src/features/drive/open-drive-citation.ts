import type { DriveCitation } from '@haus/api';
import { useSharedArtifactOpen } from '../chats/use-shared-artifact-open.ts';

export type OpenableDriveCitation = DriveCitation & { artifactId: string };

export function isOpenableDriveCitation(
    citation: DriveCitation
): citation is OpenableDriveCitation {
    return citation.artifactId !== null;
}

export function useOpenDriveCitation(slug: string, citation: OpenableDriveCitation) {
    return useSharedArtifactOpen(slug, {
        artifactId: citation.artifactId,
        ...(citation.revisionId ? { revisionId: citation.revisionId } : {}),
    });
}
