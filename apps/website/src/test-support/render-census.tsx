import * as React from 'react';

/**
 * Counts which components rendered in each commit of a test root, so a test
 * can assert that an unrelated cache change renders nothing. A root
 * `Profiler` runs `onRender` in the layout phase of every commit with work
 * below it, when the root's current tree is the one just committed. The walk
 * descends only into subtrees React re-entered this render (a skipped
 * subtree keeps its old child fibers) and counts component fibers whose
 * PerformedWork flag is set: their function or class render ran.
 */
export interface RenderCensus {
    /** Renders of components with this name since the last reset, optionally only under `key`. */
    count(name: string, key?: string): number;
    /** Every component render since the last reset, as `name` or `name#key`. */
    renders(): readonly string[];
    reset(): void;
}

export function createRenderCensus() {
    const seen: string[] = [];
    let container: object | null = null;
    const onRender = () => {
        const root = container ? findRootFiber(container) : null;
        if (root) {
            walk(root, seen);
        }
    };
    const census: RenderCensus = {
        count: (name, key) =>
            seen.filter((entry) =>
                key === undefined
                    ? entry === name || entry.startsWith(`${name}#`)
                    : entry === `${name}#${key}`
            ).length,
        renders: () => seen,
        reset: () => {
            seen.length = 0;
        },
    };
    function CensusRoot({ children }: { children: React.ReactNode }) {
        return (
            <React.Profiler id="render-census" onRender={onRender}>
                {children}
            </React.Profiler>
        );
    }
    return {
        census,
        CensusRoot,
        observe(element: object) {
            container = element;
        },
    };
}

interface Fiber {
    alternate: Fiber | null;
    child: Fiber | null;
    elementType: unknown;
    flags: number;
    key: string | null;
    sibling: Fiber | null;
    stateNode: unknown;
    tag: number;
    type: unknown;
}

// React fiber tags and flags (react-reconciler ReactWorkTags / ReactFiberFlags).
const componentTags = new Set([0, 1, 11, 15]);
const performedWork = 1;

function findRootFiber(container: object): Fiber | null {
    const key = Object.keys(container).find((name) => name.startsWith('__reactContainer$'));
    const hostRoot = key ? (container as Record<string, Fiber>)[key] : undefined;
    const fiberRoot = hostRoot?.stateNode as { current: Fiber } | undefined;
    return fiberRoot?.current ?? null;
}

function walk(fiber: Fiber, seen: string[]) {
    const stack: Fiber[] = [fiber];
    while (stack.length > 0) {
        const current = stack.pop() as Fiber;
        if (componentTags.has(current.tag) && (current.flags & performedWork) !== 0) {
            const name = componentName(current);
            seen.push(current.key === null ? name : `${name}#${current.key}`);
        }
        // An untouched subtree still points at the children of its last render.
        const reentered = current.alternate === null || current.child !== current.alternate.child;
        if (reentered && current.child) {
            stack.push(current.child);
        }
        if (current.sibling) {
            stack.push(current.sibling);
        }
    }
}

function componentName(fiber: Fiber): string {
    const type = fiber.type as { displayName?: string; name?: string; render?: { name?: string } };
    return type?.displayName ?? type?.name ?? type?.render?.name ?? 'Anonymous';
}
