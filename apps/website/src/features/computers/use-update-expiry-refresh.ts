import { useEffect, useReducer } from 'react';
import { offlineComputerUpdateExpiry } from '../updates/offline-computer-update.ts';
import { stalledComputerUpdateExpiry } from '../updates/stalled-computer-update.ts';
import type { ComputerUpdateComputer } from './computer-update-card.tsx';

export function useUpdateExpiryRefresh(computer: ComputerUpdateComputer | undefined) {
    const [, refreshTime] = useReducer((value: number) => value + 1, 0);
    const expiry = computer ? computerUpdateExpiry(computer) : null;
    useEffect(() => {
        if (expiry === null || expiry <= Date.now()) {
            return;
        }
        const timer = window.setTimeout(refreshTime, expiry - Date.now());
        return () => window.clearTimeout(timer);
    }, [expiry]);
}

export function computerUpdateExpiry(
    computer: Pick<ComputerUpdateComputer, 'health' | 'updatePhase' | 'updateUpdatedAt'>
) {
    const progress = {
        health: computer.health,
        phase: computer.updatePhase,
        updateUpdatedAt: computer.updateUpdatedAt,
    };
    return offlineComputerUpdateExpiry(progress) ?? stalledComputerUpdateExpiry(progress);
}
