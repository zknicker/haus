import type { Selection } from '@heroui/react';
import { Button, Dropdown, Label } from '@heroui/react';
import type { ComputerUpdateComputer } from './computer-update-card.tsx';

export type ComputerUpdatePreviewState =
    | 'live'
    | ComputerUpdateComputer['updatePhase']
    | 'downloading-indeterminate'
    | 'offline'
    | 'update-required';

export const computerUpdatePreviewStates: {
    id: ComputerUpdatePreviewState;
    label: string;
}[] = [
    { id: 'live', label: 'Live state' },
    { id: 'idle', label: 'Not checked' },
    { id: 'checking', label: 'Checking' },
    { id: 'available', label: 'Update available' },
    { id: 'requested', label: 'Download requested' },
    { id: 'downloading', label: 'Downloading · 42%' },
    { id: 'downloading-indeterminate', label: 'Downloading · unknown size' },
    { id: 'verifying', label: 'Verifying' },
    { id: 'waiting-for-agents', label: 'Waiting for Agents' },
    { id: 'installing', label: 'Installing' },
    { id: 'restarting', label: 'Restarting' },
    { id: 'complete', label: 'Complete' },
    { id: 'failed', label: 'Failed' },
    { id: 'offline', label: 'Offline' },
    { id: 'update-required', label: 'Update required' },
];

export function ComputerUpdatePreviewMenu({
    onChange,
    value,
}: {
    onChange: (state: ComputerUpdatePreviewState) => void;
    value: ComputerUpdatePreviewState;
}) {
    const label =
        computerUpdatePreviewStates.find((state) => state.id === value)?.label ?? 'Live state';

    return (
        <Dropdown>
            <Button aria-label="Preview software update state" size="sm" variant="secondary">
                Preview: {label}
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    onSelectionChange={(selection) => selectPreviewState(selection, onChange)}
                    selectedKeys={new Set([value])}
                    selectionMode="single"
                >
                    {computerUpdatePreviewStates.map((state) => (
                        <Dropdown.Item id={state.id} key={state.id} textValue={state.label}>
                            <Label>{state.label}</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

export function previewComputerUpdate(
    computer: ComputerUpdateComputer,
    state: ComputerUpdatePreviewState
): ComputerUpdateComputer {
    if (state === 'live') {
        return computer;
    }

    const phase = previewPhase(state);
    return {
        ...computer,
        health:
            state === 'offline'
                ? 'offline'
                : state === 'update-required'
                  ? 'update-required'
                  : 'healthy',
        updateActiveAgentCount: phase === 'waiting-for-agents' ? 2 : null,
        updateDetail: null,
        updateDownloadedBytes: phase === 'downloading' ? 42 : null,
        updateFailedPhase: phase === 'failed' ? 'checking' : null,
        updatePhase: phase,
        updateTargetVersion: phase === 'idle' ? null : '1.5.0',
        updateTotalBytes: state === 'downloading' ? 100 : null,
        // A preview phase is freshly reported, never stalled.
        updateUpdatedAt: new Date().toISOString(),
    };
}

function previewPhase(state: Exclude<ComputerUpdatePreviewState, 'live'>) {
    if (state === 'offline') {
        return 'idle';
    }
    if (state === 'update-required') {
        return 'available';
    }
    if (state === 'downloading-indeterminate') {
        return 'downloading';
    }
    return state;
}

function selectPreviewState(
    selection: Selection,
    onChange: (state: ComputerUpdatePreviewState) => void
) {
    if (selection === 'all') {
        return;
    }
    const [selected] = selection;
    if (typeof selected === 'string') {
        onChange(selected as ComputerUpdatePreviewState);
    }
}
