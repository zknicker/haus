const databaseName = 'haus-backgrounds';
const storeName = 'images';

export async function putBackgroundImage(id: string, blob: Blob) {
    const database = await openDatabase();
    try {
        await request(
            database.transaction(storeName, 'readwrite').objectStore(storeName).put(blob, id)
        );
    } finally {
        database.close();
    }
}

export async function readBackgroundImage(id: string) {
    const database = await openDatabase();
    try {
        const value: unknown = await request(
            database.transaction(storeName, 'readonly').objectStore(storeName).get(id)
        );
        return value instanceof Blob ? value : null;
    } finally {
        database.close();
    }
}

export async function pruneBackgroundImages(kept: ReadonlySet<string>) {
    const database = await openDatabase();
    try {
        const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
        const keys = await request(store.getAllKeys());
        await Promise.all(
            keys.flatMap((key) =>
                typeof key === 'string' && !kept.has(key) ? [request(store.delete(key))] : []
            )
        );
    } finally {
        database.close();
    }
}

function openDatabase() {
    const opening = indexedDB.open(databaseName, 1);
    opening.onupgradeneeded = () => {
        opening.result.createObjectStore(storeName);
    };
    return request(opening);
}

function request<T>(pending: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error ?? new Error('IndexedDB request failed'));
    });
}
