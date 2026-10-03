import { expect, mock, test } from 'bun:test';
import { routeArtifactOpen } from './artifact-panel-context.tsx';
import type { HausResourceTarget } from './haus-resource-link.ts';

const bound: HausResourceTarget = { agentId: 'agent-1', kind: 'workspaceFile', path: 'a.html' };
const unbound: HausResourceTarget = { kind: 'workspaceFile', path: 'a.html' };

test('desktop opens an Agent artifact as a workspace tab, never the chat panel', () => {
    const onOpen = mock((_target: HausResourceTarget) => undefined);
    const openArtifactTab = mock((_target: HausResourceTarget, _title?: string) => undefined);

    routeArtifactOpen(bound, 'Report', { onOpen, openArtifactTab });

    expect(openArtifactTab).toHaveBeenCalledWith(bound, 'Report');
    expect(onOpen).not.toHaveBeenCalled();
});

test('desktop has no chat Artifact Panel, so an artifact without an Agent says it is unavailable', () => {
    const onOpen = mock((_target: HausResourceTarget) => undefined);
    const onUnavailable = mock(() => undefined);
    const openArtifactTab = mock((_target: HausResourceTarget, _title?: string) => undefined);

    routeArtifactOpen(unbound, undefined, { onOpen, onUnavailable, openArtifactTab });

    expect(openArtifactTab).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
});

test('the website opens every artifact in the chat Artifact Panel', () => {
    const onOpen = mock((_target: HausResourceTarget) => undefined);

    routeArtifactOpen(bound, 'Report', { onOpen, openArtifactTab: undefined });

    expect(onOpen).toHaveBeenCalledWith(bound);
});
