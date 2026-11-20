export type BackgroundImageUrl =
    | { readonly status: 'loading' }
    | { readonly status: 'missing' }
    | { readonly status: 'ready'; readonly url: string };

interface Entry {
    refs: number;
    url: BackgroundImageUrl;
}

const loading: BackgroundImageUrl = { status: 'loading' };
const missing: BackgroundImageUrl = { status: 'missing' };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function retainBackgroundImageUrl(key: string, load: () => Promise<Blob | null>) {
    const entry = entries.get(key) ?? startLoading(key, load);
    entry.refs += 1;
    return () => {
        entry.refs -= 1;
        if (entry.refs > 0 || entries.get(key) !== entry) {
            return;
        }
        entries.delete(key);
        revoke(entry.url);
    };
}

export function readBackgroundImageUrl(key: string) {
    return entries.get(key)?.url ?? loading;
}

export function subscribeBackgroundImageUrls(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function startLoading(key: string, load: () => Promise<Blob | null>) {
    const entry: Entry = { refs: 0, url: loading };
    entries.set(key, entry);
    load()
        .then(
            (blob): BackgroundImageUrl =>
                blob ? { status: 'ready', url: URL.createObjectURL(blob) } : missing,
            () => missing
        )
        .then((url) => {
            if (entries.get(key) !== entry) {
                revoke(url);
                return;
            }
            entry.url = url;
            for (const listener of listeners) {
                listener();
            }
        });
    return entry;
}

function revoke(url: BackgroundImageUrl) {
    if (url.status === 'ready') {
        URL.revokeObjectURL(url.url);
    }
}
