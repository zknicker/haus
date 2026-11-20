export function isCommandMenuKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey'>) {
    return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
}
