import { useCallback } from 'react';
import { useAppAuth } from '../../lib/app-auth.tsx';

/** Ends this browser or desktop session and drops its App cache ownership. */
export function useSignOut(): () => void {
    const { signOut } = useAppAuth();
    return useCallback(() => {
        void signOut();
    }, [signOut]);
}
