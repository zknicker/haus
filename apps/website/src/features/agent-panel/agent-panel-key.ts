export function isAgentPanelKey(
    event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>
) {
    return (
        event.key === '.' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
    );
}
