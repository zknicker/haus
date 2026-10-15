import {
    type ArtifactCreator,
    type ArtifactListInput,
    artifactListInputSchema,
    parseArtifactPath,
} from '@haus/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { serverRoute } from '../servers/server-routes.ts';
import { creatorKey, parseCreatorKey } from './artifact-creators.ts';

export type ArtifactKindFilter = ArtifactListInput['kind'];

/** The list API's kind filter, in its declared order. */
export const artifactKindFilters: readonly ArtifactKindFilter[] =
    artifactListInputSchema.shape.kind.unwrap().options;

/** Where the library is and what it shows: the open folder (`''` is the root) and its filters. */
export interface ArtifactLibraryView {
    creator: ArtifactCreator | null;
    folder: string;
    kind: ArtifactKindFilter;
}

/**
 * The library's folder and filters live in the URL
 * (`?folder=starter-kit/scripts&kind=images&creator=agent:…`) so back, reload,
 * and a desktop tab all return to the same view. Anything malformed reads as
 * its default: the root, all kinds, anyone.
 */
export function parseLibrarySearch(params: URLSearchParams): ArtifactLibraryView {
    const folder = parseArtifactPath(params.get('folder') ?? '');
    return {
        creator: parseCreatorKey(params.get('creator')),
        folder: folder.ok ? folder.path : '',
        kind: artifactKindFilters.find((kind) => kind === params.get('kind')) ?? 'all',
    };
}

/** The inverse of `parseLibrarySearch`, omitting defaults: `''` for the plain root. */
export function librarySearch(view: ArtifactLibraryView): string {
    const params = new URLSearchParams();
    if (view.folder) {
        params.set('folder', view.folder);
    }
    if (view.kind !== 'all') {
        params.set('kind', view.kind);
    }
    if (view.creator) {
        params.set('creator', creatorKey(view.creator));
    }
    const search = params.toString();
    return search ? `?${search}` : '';
}

export function libraryHref(slug: string, view: ArtifactLibraryView): string {
    return `${serverRoute(slug)}/artifacts${librarySearch(view)}`;
}

/**
 * The URL view plus moves: opening a folder keeps the filters, as Finder does.
 * Only a folder change is a history step (Back and Forward walk folders); a
 * filter change replaces the current entry.
 */
export function useArtifactLibraryParams() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const view = parseLibrarySearch(params);
    const go = (next: ArtifactLibraryView, replace: boolean) =>
        navigate({ search: librarySearch(next) }, { replace });

    return {
        ...view,
        openFolder: (folder: string) => go({ ...view, folder }, false),
        selectCreator: (creator: ArtifactCreator | null) => go({ ...view, creator }, true),
        selectKind: (kind: ArtifactKindFilter) => go({ ...view, kind }, true),
    };
}
