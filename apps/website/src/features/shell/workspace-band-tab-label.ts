import * as React from 'react';

/**
 * The primary workspace tab's label when band content renders beside it in
 * the desktop tab strip; null anywhere else. A leaf module so band content
 * (SectionHeader) can read it without importing the topbar that hosts tabs.
 */
export const WorkspaceBandTabLabel = React.createContext<string | null>(null);

/** Band content uses it to drop what the tab already says (SectionHeader). */
export function useWorkspaceBandTabLabel(): string | null {
    return React.use(WorkspaceBandTabLabel);
}
