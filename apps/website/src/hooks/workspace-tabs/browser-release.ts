/**
 * Tracks the App releasing Electron's browser selection for an App-local tab.
 * While a release is in flight, Electron's own picks (closing the selected
 * page reports a successor first) must not show. The release ends when
 * Electron reports no selection, when the release command fails, or when the
 * user asks for a browser page again.
 */
export interface BrowserRelease {
    /** Electron reported its selected tab: true when that pick should show. */
    accept: (activeId: string | null) => boolean;
    begin: () => void;
    /** The user asked for a browser page; any release in flight is moot. */
    cancel: () => void;
    /** The release command settled with Electron's selection, or null when it failed. */
    settle: (activeId: string | null | undefined) => void;
}

export function createBrowserRelease(): BrowserRelease {
    let releasing = false;
    return {
        accept: (activeId) => {
            if (!activeId) {
                releasing = false;
                return false;
            }
            return !releasing;
        },
        begin: () => {
            releasing = true;
        },
        cancel: () => {
            releasing = false;
        },
        settle: (activeId) => {
            // Only a confirmed empty selection keeps waiting for Electron's report.
            if (activeId !== null) {
                releasing = false;
            }
        },
    };
}
