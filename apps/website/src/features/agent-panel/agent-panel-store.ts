import * as React from 'react';
import * as z from 'zod';
import {
    type AgentPanelState,
    type AgentPanelView,
    agentPanelStateSchema,
    defaultAgentPanelState,
} from './agent-panel-model.ts';

const storageKey = 'haus.agentPanel.v1';
const storedSchema = z.record(z.string(), agentPanelStateSchema);

let states: Readonly<Record<string, AgentPanelState>> = readStored();
const listeners = new Set<() => void>();

export function useAgentPanelState(key: string) {
    return React.useSyncExternalStore(
        subscribe,
        () => states[key] ?? defaultAgentPanelState,
        () => defaultAgentPanelState
    );
}

export function readAgentPanelState(key: string) {
    return states[key] ?? defaultAgentPanelState;
}

export function setAgentPanelOpen(key: string, open: boolean) {
    write(key, { ...readAgentPanelState(key), open });
}

export function toggleAgentPanel(key: string) {
    setAgentPanelOpen(key, !readAgentPanelState(key).open);
}

export function setAgentPanelView(key: string, view: AgentPanelView) {
    write(key, { ...readAgentPanelState(key), view });
}

export function showAgentPanel(key: string, view: AgentPanelView) {
    write(key, { open: true, view });
}

function write(key: string, next: AgentPanelState) {
    states = { ...states, [key]: next };
    window.localStorage.setItem(storageKey, JSON.stringify(states));
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readStored() {
    if (typeof window === 'undefined') {
        return {};
    }
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
        return {};
    }
    const parsed = storedSchema.safeParse(parseJson(raw));
    return parsed.success ? parsed.data : {};
}

function parseJson(raw: string) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
