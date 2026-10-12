import { type ArtifactCreator, type ArtifactListInput, artifactListInputSchema } from '@haus/api';
import { useSearchParams } from 'react-router-dom';
import { creatorKey, parseCreatorKey } from './artifact-creators.ts';

export type ArtifactKindFilter = ArtifactListInput['kind'];

/** The list API's kind filter, in its declared order. */
export const artifactKindFilters: readonly ArtifactKindFilter[] =
    artifactListInputSchema.shape.kind.unwrap().options;

/**
 * The library's folder and kind live in the URL (`?creator=agent:…&kind=images`)
 * so back, reload, and a desktop tab all return to the same view.
 */
export function useArtifactLibraryParams() {
    const [params, setParams] = useSearchParams();
    const creator = parseCreatorKey(params.get('creator'));
    const kind = parseKind(params.get('kind'));

    function update(name: 'creator' | 'kind', value: string | null) {
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (value) {
                next.set(name, value);
            } else {
                next.delete(name);
            }
            return next;
        });
    }

    return {
        creator,
        kind,
        selectCreator: (next: ArtifactCreator | null) =>
            update('creator', next ? creatorKey(next) : null),
        selectKind: (next: ArtifactKindFilter) => update('kind', next === 'all' ? null : next),
    };
}

function parseKind(value: string | null): ArtifactKindFilter {
    return artifactKindFilters.find((kind) => kind === value) ?? 'all';
}
