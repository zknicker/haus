import type { ModelSignIn } from '@haus/api';
import * as React from 'react';

export function useLandedSignIn(
    signIn: ModelSignIn | undefined,
    onConnected: (connectionId: string, label: string) => void
) {
    const landed = signIn?.state === 'connected' ? signIn.connectionId : null;
    const label = signIn?.label ?? '';
    const announced = React.useRef<string | null>(null);
    const announce = React.useEffectEvent((connectionId: string) =>
        onConnected(connectionId, label)
    );
    React.useEffect(() => {
        if (landed && announced.current !== landed) {
            announced.current = landed;
            announce(landed);
        }
    }, [landed]);
    return landed;
}
