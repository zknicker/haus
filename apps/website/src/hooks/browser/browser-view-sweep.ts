/** How long a web view must stay unnamed by every tab before its window closes it. */
export const unnamedViewGraceMs = 500;

/**
 * Picks the web views a window may close: those no tab's history names (ADR
 * 0039), once they have stayed unnamed for `graceMs`. The grace absorbs a tab
 * drag, where a view can arrive (or its tab leave) a moment before the tabs
 * that name it do; closing on first sight would destroy a live page in flight.
 */
export function createViewSweeper(graceMs = unnamedViewGraceMs) {
    const unnamedSince = new Map<string, number>();
    return {
        /** The ids to close now, given the views here and the ids tabs name. */
        sweep(viewIds: readonly string[], named: ReadonlySet<string>, now: number): string[] {
            const present = new Set(viewIds);
            for (const id of unnamedSince.keys()) {
                if (named.has(id) || !present.has(id)) {
                    unnamedSince.delete(id);
                }
            }
            const closing: string[] = [];
            for (const id of viewIds) {
                if (named.has(id)) {
                    continue;
                }
                const since = unnamedSince.get(id);
                if (since === undefined) {
                    unnamedSince.set(id, now);
                } else if (now - since >= graceMs) {
                    unnamedSince.delete(id);
                    closing.push(id);
                }
            }
            return closing;
        },
    };
}
