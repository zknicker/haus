export interface RevisionView {
    compare: string | null;
    revision: string | null;
}

export function parseRevisionView(params: URLSearchParams) {
    const view: RevisionView = {
        compare: params.get('compare') || null,
        revision: params.get('revision') || null,
    };
    return view;
}

export function revisionViewHref(href: string, view: RevisionView) {
    const [path = '', search = ''] = href.split('?');
    const params = new URLSearchParams(search);
    params.delete('compare');
    params.delete('revision');
    if (view.compare) {
        params.set('compare', view.compare);
    }
    if (view.revision) {
        params.set('revision', view.revision);
    }
    const next = params.toString();
    return next ? `${path}?${next}` : path;
}
