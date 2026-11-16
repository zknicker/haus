import { expect, test } from 'bun:test';
import { tabPageKey } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    artifactPagePath,
    filesPagePath,
    parseArtifactPageKey,
    threadPagePath,
    windowSeedPath,
} from './desktop-page-paths.ts';
import { serverPageRoutes } from './server-page-routes.tsx';

test('an artifact page address round-trips its Agent-bound target', () => {
    const target = { agentId: 'agt_1', kind: 'workspaceFile', path: 'notes/a:b.md' } as const;
    const path = artifactPagePath('acme', target, 'Plan');
    expect(path).toStartWith('/s/acme/artifacts/');
    expect(path).toEndWith('?title=Plan');
    const key = decodeURIComponent(path.split('/')[4]?.split('?')[0] ?? '');
    expect(parseArtifactPageKey(key)).toEqual(target);
});

test('malformed artifact keys name no target', () => {
    expect(parseArtifactPageKey('workspaceFile:agt_1:')).toBeNull();
    expect(parseArtifactPageKey('bogus:agt_1:a.md')).toBeNull();
    expect(parseArtifactPageKey('workspaceRoot::')).toBeNull();
    expect(parseArtifactPageKey('workspaceRoot:agt_1:')).toEqual({
        agentId: 'agt_1',
        kind: 'workspaceRoot',
        path: '',
    });
});

test('two Threads in one chat are different pages; Attachments is its own page', () => {
    const a = tabPageKey({ kind: 'app', path: threadPagePath('acme', 'c1', 'm1') });
    const b = tabPageKey({ kind: 'app', path: threadPagePath('acme', 'c1', 'm2') });
    expect(a).not.toBe(b);
    expect(tabPageKey({ kind: 'app', path: filesPagePath('acme', 'c1') })).toBe('files/c1');
});

test('a Thread opened on a claim inside it carries the claim and stays the same page', () => {
    const plain = threadPagePath('acme', 'c1', 'm1');
    const onClaim = threadPagePath('acme', 'c1', 'm1', { claimMessageId: 'msg_reply' });
    expect(onClaim).toBe('/s/acme/threads/c1/m1?claim=msg_reply');
    expect(tabPageKey({ kind: 'app', path: onClaim })).toBe(
        tabPageKey({ kind: 'app', path: plain })
    );
});

test('both surfaces route a Thread; only desktop tabs route Attachments and artifact pages', () => {
    const paths = (desktop: boolean) =>
        serverPageRoutes({ desktop }).map((route) => route.path ?? '(index)');
    const threadPage = 'threads/:chatId/:anchorMessageId';
    const desktopOnly = ['files/:chatId', 'artifacts/:artifactKey'];
    expect(paths(false)).toContain(threadPage);
    expect(paths(false)).not.toContain(desktopOnly[0]);
    expect(paths(true)).toEqual(expect.arrayContaining([threadPage, ...desktopOnly]));
    // The catch-all stays last on both.
    expect(paths(false).at(-1)).toBe('*');
    expect(paths(true).at(-1)).toBe('*');
});

test("a window seeds its first tab only from its own Server's route", () => {
    expect(windowSeedPath({ pathname: '/s/acme/chats/c1', search: '?m=1' }, 'acme')).toBe(
        '/s/acme/chats/c1?m=1'
    );
    expect(windowSeedPath({ pathname: '/s/acme', search: '' }, 'acme')).toBe('/s/acme');
    // A switch to a cached Server renders before the route moves: never seed B with A's page.
    expect(windowSeedPath({ pathname: '/s/acme/inbox', search: '' }, 'beta')).toBeNull();
    expect(windowSeedPath({ pathname: '/s/acmeco/inbox', search: '' }, 'acme')).toBeNull();
});
