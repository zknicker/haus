import { expect, test } from 'bun:test';
import { getArtifactPanelTargetKey } from '../../chats/haus-resource-link.ts';
import { mergeArtifactTarget } from './use-artifact-panel.ts';

test('keeps same-path workspace artifacts separate for different authors', () => {
    const first = {
        agentId: 'agent-one',
        kind: 'workspaceFile' as const,
        path: 'reports/summary.html',
    };
    const second = {
        agentId: 'agent-two',
        kind: 'workspaceFile' as const,
        path: 'reports/summary.html',
    };

    const withFirst = mergeArtifactTarget({ activeKey: null, targets: [] }, first);
    const withBoth = mergeArtifactTarget(withFirst, second);

    expect(withBoth.targets).toEqual([first, second]);
    expect(getArtifactPanelTargetKey(first)).not.toBe(getArtifactPanelTargetKey(second));
    expect(withBoth.activeKey).toBe(getArtifactPanelTargetKey(second));
});

test('morphs only the selected author workspace tab to a new file', () => {
    const firstAuthor = {
        agentId: 'agent-one',
        kind: 'workspaceFile' as const,
        path: 'first.html',
    };
    const secondAuthor = {
        agentId: 'agent-two',
        kind: 'workspaceFile' as const,
        path: 'same.html',
    };
    const nextFirstAuthor = {
        agentId: 'agent-one',
        kind: 'workspaceFile' as const,
        path: 'next.html',
    };
    const initial = mergeArtifactTarget(
        mergeArtifactTarget({ activeKey: null, targets: [] }, firstAuthor),
        secondAuthor
    );

    const result = mergeArtifactTarget(initial, nextFirstAuthor);

    expect(result.targets).toEqual([nextFirstAuthor, secondAuthor]);
    expect(result.activeKey).toBe(getArtifactPanelTargetKey(nextFirstAuthor));
});
