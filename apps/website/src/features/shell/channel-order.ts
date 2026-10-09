/** The user's stored channel order first, then channels it has not placed yet, in Server order. */
export function orderChannelIds(
    channelIds: readonly string[],
    storedIds: readonly string[]
): string[] {
    const unplaced = new Set(channelIds);
    const ordered = storedIds.filter((id) => unplaced.delete(id));
    return [...ordered, ...unplaced];
}

export function readChannelOrder(storage: Pick<Storage, 'getItem'>, key: string): string[] {
    try {
        const value: unknown = JSON.parse(storage.getItem(key) ?? '[]');
        if (!Array.isArray(value)) {
            return [];
        }
        return [...new Set(value.filter((id): id is string => typeof id === 'string'))];
    } catch {
        return [];
    }
}

export function writeChannelOrder(
    storage: Pick<Storage, 'setItem'>,
    key: string,
    channelIds: readonly string[]
) {
    try {
        storage.setItem(key, JSON.stringify(channelIds));
    } catch {
        // Local presentation can still update when storage is unavailable.
    }
}
