import * as React from 'react';
import type { ArtifactActions } from './use-artifact-actions.tsx';

/**
 * The library's one action owner (`useArtifactActions`), shared with every
 * row's ⋮ menu so each row does not mount its own dialogs.
 */
export const ArtifactActionsContext = React.createContext<ArtifactActions | null>(null);

export function useArtifactActionsContext(): ArtifactActions {
    const actions = React.use(ArtifactActionsContext);
    if (!actions) {
        throw new Error('Library rows render inside the library’s ArtifactActionsContext.');
    }
    return actions;
}
