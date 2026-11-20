import { type ArtifactTextResult, artifactTextMaxBytes } from '@haus/api';
import { useArtifactText } from './use-artifact-text.ts';

export type ArtifactCompareTexts =
    | { status: 'loading' }
    | { message: string; status: 'failed' }
    | { from: string; status: 'ready'; to: string };

interface CompareSide {
    revisionId: string;
    sizeBytes: number | undefined;
}

export function useArtifactCompareTexts(
    serverId: string,
    artifactId: string,
    from: CompareSide,
    to: CompareSide
) {
    const fromFits = fits(from);
    const toFits = fits(to);
    const fromText = useArtifactText(serverId, artifactId, from.revisionId, { enabled: fromFits });
    const toText = useArtifactText(serverId, artifactId, to.revisionId, { enabled: toFits });
    const error = fromText.error ?? toText.error;
    if (!(fromFits && toFits)) {
        return failed(tooLarge);
    }
    if (error) {
        return failed(error.message);
    }
    if (!(fromText.data && toText.data)) {
        const loading: ArtifactCompareTexts = { status: 'loading' };
        return loading;
    }
    return compareResults(fromText.data, toText.data);
}

const tooLarge = 'Too large to compare.';

function fits(side: CompareSide) {
    return side.sizeBytes === undefined || side.sizeBytes <= artifactTextMaxBytes;
}

function failed(message: string) {
    const texts: ArtifactCompareTexts = { message, status: 'failed' };
    return texts;
}

function compareResults(from: ArtifactTextResult, to: ArtifactTextResult) {
    if (from.status === 'text' && to.status === 'text') {
        const texts: ArtifactCompareTexts = { from: from.text, status: 'ready', to: to.text };
        return texts;
    }
    if (from.status === 'too_large' || to.status === 'too_large') {
        return failed(tooLarge);
    }
    return failed('This revision is not readable as text.');
}
