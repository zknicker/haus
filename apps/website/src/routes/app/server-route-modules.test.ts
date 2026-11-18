import { expect, test } from 'bun:test';
import { cachedRouteModule } from './server-route-modules.ts';

test('shares a pending route import across prefetch and navigation', async () => {
    let loadCount = 0;
    const load = cachedRouteModule(async () => {
        loadCount += 1;
        return { route: 'tasks' };
    });

    const preload = load();
    const navigation = load();

    expect(preload).toBe(navigation);
    expect(await navigation).toEqual({ route: 'tasks' });
    expect(loadCount).toBe(1);
});

test('retries a route import after a failed preload', async () => {
    let loadCount = 0;
    const load = cachedRouteModule(async () => {
        loadCount += 1;
        if (loadCount === 1) {
            throw new Error('dev server restarted');
        }
        return { route: 'members' };
    });

    await expect(load()).rejects.toThrow('dev server restarted');
    await expect(load()).resolves.toEqual({ route: 'members' });
    expect(loadCount).toBe(2);
});
