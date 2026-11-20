import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { createRenderCensus } from '../../test-support/render-census.tsx';

const restoreDom = installFakeDom();
afterAll(restoreDom);

const { HomeBackground } = await import('./home-background.tsx');
const { saveThemeBackground } = await import('../../hooks/shell/use-theme-background.ts');
const { themeBackground, withAdjustment } = await import('../../lib/home-background.ts');
const { createRoot } = await import('react-dom/client');
const { act } = React;

function HomeStandIn({ activity }: { activity: number }) {
    return (
        <div className="home-host">
            <HomeBackground />
            <p>{activity}</p>
        </div>
    );
}

test('chat activity that re-renders Home never renders its background', async () => {
    const { census, CensusRoot, observe } = createRenderCensus();
    const container = document.createElement('div');
    observe(container);
    const root = createRoot(container);
    const show = (activity: number) =>
        act(() =>
            root.render(
                <CensusRoot>
                    <HomeStandIn activity={activity} />
                </CensusRoot>
            )
        );

    await act(() => saveThemeBackground('default', themeBackground('dots')));
    await show(0);
    const layer = findByClass(container, 'home-background');
    expect(layer?.getAttribute?.('data-art')).toBe('dots');
    const host = findByClass(container, 'home-host');
    expect(host?.style?.['--home-input-opacity']).toBe('0.9');

    census.reset();
    await show(1);
    await show(2);
    expect(census.count('HomeBackground')).toBe(0);
    expect(census.count('HomeStandIn')).toBe(2);

    await act(() =>
        saveThemeBackground('default', withAdjustment(themeBackground('dots'), 'inputOpacity', 40))
    );
    expect(census.count('HomeBackground')).toBe(1);
    expect(host?.style?.['--home-input-opacity']).toBe('0.4');

    await act(() => saveThemeBackground('default', themeBackground('none')));
    expect(findByClass(container, 'home-background')).toBeNull();
    await act(() => root.unmount());
});

interface TreeNode {
    childNodes: TreeNode[];
    className?: string;
    getAttribute?: (name: string) => string | null;
    style?: Record<string, string>;
}

function findByClass(root: unknown, name: string) {
    const stack = [root as TreeNode];
    while (stack.length > 0) {
        const current = stack.pop() as TreeNode;
        const classes = current.className ?? current.getAttribute?.('class') ?? '';
        if (classes.split(' ').includes(name)) {
            return current;
        }
        stack.push(...current.childNodes);
    }
    return null;
}
