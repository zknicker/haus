import type { Page } from '@playwright/test';

/**
 * Counts component renders in the running App without a custom build, the
 * way react-scan does: a `__REACT_DEVTOOLS_GLOBAL_HOOK__` stub installed
 * before React loads receives every committed root. For each commit it walks
 * the subtrees React re-entered and counts function, class, forwardRef, and
 * simple-memo fibers whose PerformedWork flag is set (their render ran);
 * bailed-out components are skipped. React Refresh wraps the stub in dev and
 * still forwards every commit. The unit-lane twin is
 * src/test-support/render-census.tsx.
 */
export interface RenderTally {
    byName: Record<string, number>;
    total: number;
}

export async function installRenderCounter(page: Page) {
    await page.addInitScript(() => {
        interface Fiber {
            alternate: Fiber | null;
            child: Fiber | null;
            flags: number;
            sibling: Fiber | null;
            tag: number;
            type: { displayName?: string; name?: string; render?: { name?: string } } | null;
        }
        const componentTags = new Set([0, 1, 11, 15]);
        const performedWork = 1;
        const tally = { byName: new Map<string, number>(), total: 0 };
        const walk = (root: Fiber) => {
            const stack: Fiber[] = [root];
            while (stack.length > 0) {
                const fiber = stack.pop() as Fiber;
                if (componentTags.has(fiber.tag) && (fiber.flags & performedWork) !== 0) {
                    const type = fiber.type;
                    const name =
                        type?.displayName ?? type?.name ?? type?.render?.name ?? 'Anonymous';
                    tally.byName.set(name, (tally.byName.get(name) ?? 0) + 1);
                    tally.total += 1;
                }
                // An untouched subtree still points at the children of its last render.
                const reentered = fiber.alternate === null || fiber.child !== fiber.alternate.child;
                if (reentered && fiber.child) {
                    stack.push(fiber.child);
                }
                if (fiber.sibling) {
                    stack.push(fiber.sibling);
                }
            }
        };
        let rendererId = 0;
        Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
            configurable: true,
            value: {
                checkDCE: () => undefined,
                inject: () => {
                    rendererId += 1;
                    return rendererId;
                },
                isDisabled: false,
                onCommitFiberRoot: (_id: number, root: { current: Fiber }) => walk(root.current),
                onCommitFiberUnmount: () => undefined,
                onPostCommitFiberRoot: () => undefined,
                renderers: new Map(),
                supportsFiber: true,
            },
        });
        Object.defineProperty(window, '__hausRenderTally', {
            configurable: true,
            value: {
                read: () => ({ byName: Object.fromEntries(tally.byName), total: tally.total }),
                reset: () => {
                    tally.byName.clear();
                    tally.total = 0;
                },
            },
        });
    });
}

type TallyWindow = Window & { __hausRenderTally: { read(): RenderTally; reset(): void } };

export function resetRenders(page: Page) {
    return page.evaluate(() => (window as unknown as TallyWindow).__hausRenderTally.reset());
}

export function readRenders(page: Page) {
    return page.evaluate(() => (window as unknown as TallyWindow).__hausRenderTally.read());
}

/** Waits until no component has rendered for `quietMs` of real time, then reads the tally. */
export async function settleRenders(page: Page, quietMs = 600, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    let last = await readRenders(page);
    for (;;) {
        await page.waitForTimeout(quietMs);
        const next = await readRenders(page);
        if (next.total === last.total) {
            return next;
        }
        if (Date.now() > deadline) {
            throw new Error(`The App kept rendering for ${timeoutMs} ms (${next.total} renders)`);
        }
        last = next;
    }
}

/** The `limit` most-rendered components, as `Name ×count` lines. */
export function topComponents(tally: RenderTally, limit = 12) {
    return Object.entries(tally.byName)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => `  ${name} ×${count}`)
        .join('\n');
}
