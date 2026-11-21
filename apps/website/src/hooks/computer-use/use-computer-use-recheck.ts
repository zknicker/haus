import * as React from 'react';
import { useComputerInventoryRefresh } from '../servers/use-computer-inventory-refresh.ts';

export function useComputerUseRecheck(input: {
    active: boolean;
    computerId: string;
    serverId: string;
}) {
    const refresh = useComputerInventoryRefresh();
    const { mutate } = refresh;
    const { active, computerId, serverId } = input;
    React.useEffect(() => {
        if (!active) {
            return;
        }
        const recheck = () => mutate({ computerId, serverId });
        window.addEventListener('focus', recheck);
        return () => window.removeEventListener('focus', recheck);
    }, [active, computerId, mutate, serverId]);
    return refresh;
}
