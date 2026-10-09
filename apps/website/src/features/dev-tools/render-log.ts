/**
 * Logs which components rendered, once per second while anything did. Wraps
 * the dev build's `__REACT_DEVTOOLS_GLOBAL_HOOK__` (React Refresh installs
 * it before React loads) and counts component fibers whose render ran in
 * each commit, skipping subtrees React bailed out of. Returns a stop function.
 */
export function startRenderLog(intervalMs = 1000): () => void {
    const hook = (window as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook })
        .__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) {
        console.warn('[render-log] no React devtools hook; the render log needs a dev build');
        return () => undefined;
    }
    const counts = new Map<string, number>();
    const forward = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = (id, root, ...rest) => {
        countRenders(root.current, counts);
        return forward?.call(hook, id, root, ...rest);
    };
    const timer = window.setInterval(() => {
        if (counts.size === 0) {
            return;
        }
        const top = [...counts].sort((a, b) => b[1] - a[1]);
        const total = top.reduce((sum, [, count]) => sum + count, 0);
        console.groupCollapsed(`[render-log] ${total} renders`);
        console.table(Object.fromEntries(top.slice(0, 20)));
        console.groupEnd();
        counts.clear();
    }, intervalMs);
    return () => {
        hook.onCommitFiberRoot = forward;
        window.clearInterval(timer);
    };
}

interface DevtoolsHook {
    onCommitFiberRoot?: (id: number, root: { current: Fiber }, ...rest: unknown[]) => unknown;
}

interface Fiber {
    alternate: Fiber | null;
    child: Fiber | null;
    flags: number;
    sibling: Fiber | null;
    tag: number;
    type: { displayName?: string; name?: string; render?: { name?: string } } | null;
}

// Function, class, forwardRef, and simple memo components; PerformedWork flag.
const componentTags = new Set([0, 1, 11, 15]);
const performedWork = 1;

function countRenders(root: Fiber, counts: Map<string, number>) {
    const stack: Fiber[] = [root];
    while (stack.length > 0) {
        const fiber = stack.pop() as Fiber;
        if (componentTags.has(fiber.tag) && (fiber.flags & performedWork) !== 0) {
            const type = fiber.type;
            const name = type?.displayName ?? type?.name ?? type?.render?.name ?? 'Anonymous';
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        // An untouched subtree still points at the children of its last render.
        if (fiber.child && (fiber.alternate === null || fiber.child !== fiber.alternate.child)) {
            stack.push(fiber.child);
        }
        if (fiber.sibling) {
            stack.push(fiber.sibling);
        }
    }
}
