import * as React from 'react';

const storageKey = 'haus.agentPanel.width';

export const agentPanelWidthLimits = { default: 400, max: 640, min: 320 } as const;

let panelWidth = readInitialWidth();
const listeners = new Set<() => void>();

export function useAgentPanelWidth() {
    const width = React.useSyncExternalStore(
        subscribe,
        () => panelWidth,
        () => agentPanelWidthLimits.default
    );
    return { persistWidth, setWidth, width };
}

function setWidth(next: number) {
    panelWidth = clampWidth(next);
    for (const listener of listeners) {
        listener();
    }
}

function persistWidth(next: number) {
    setWidth(next);
    window.localStorage.setItem(storageKey, String(panelWidth));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readInitialWidth() {
    if (typeof window === 'undefined') {
        return agentPanelWidthLimits.default;
    }
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : agentPanelWidthLimits.default;
}

function clampWidth(width: number) {
    return Math.min(
        agentPanelWidthLimits.max,
        Math.max(agentPanelWidthLimits.min, Math.round(width))
    );
}
