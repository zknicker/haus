import * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * A row's inline pad: 2 steps in a trace's rounded rows; the log's
 * edge-to-edge rows set `--trace-pad` to the page gutter.
 */
export const tracePad = 'var(--trace-pad, calc(var(--spacing) * 2))';

/** One plain depth step inside the label cell (a log turn's steps). */
const traceIndentRem = 0.75;

/**
 * One step into an opened group: room for the rail at the group row's icon
 * center, a ~9px connector, and a ~3px gap before the child's icon.
 */
const traceBranchIndentRem = 1.25;

interface TraceDepth {
    readonly depth: number;
    /** The label cell's indent, in rem: the sum of every step out to the trace's edge. */
    readonly indentRem: number;
    /** These rows are an opened group's children and draw elbows to its rail. */
    readonly isBranch: boolean;
    /** The next nesting opens a group's children. */
    readonly opensBranch: boolean;
}

const TraceDepthContext = React.createContext<TraceDepth>({
    depth: 0,
    indentRem: 0,
    isBranch: false,
    opensBranch: false,
});

/** Rows inside this sit one depth step further in, on the same columns. */
export function TraceNested({ children }: { children: React.ReactNode }) {
    const parent = React.use(TraceDepthContext);
    const next: TraceDepth = {
        depth: parent.depth + 1,
        indentRem: parent.indentRem + (parent.opensBranch ? traceBranchIndentRem : traceIndentRem),
        isBranch: parent.opensBranch,
        opensBranch: false,
    };
    return <TraceDepthContext value={next}>{children}</TraceDepthContext>;
}

/** The depth's custom properties, set once per row or body so indents derive from them. */
export function useTraceDepthStyle(): React.CSSProperties {
    const { depth, indentRem } = React.use(TraceDepthContext);
    return { '--trace-depth': depth, '--trace-indent': `${indentRem}rem` } as React.CSSProperties;
}

/**
 * A group row's opened rows — a fold's members, a sub-agent's calls, a run of
 * thoughts — hang off one rail at the center of the group row's icon, file
 * tree style: each child is a branch (`traceBranchClass` + `TraceElbow`) with
 * a square elbow from the rail to just before its icon, ├ for every child and
 * └ for the last, where the rail ends. Each branch draws its own stretch of
 * rail over its whole height, an opened body included, so the rail runs on to
 * later siblings and ends on the last child's row line, never its body. It
 * sits in the label cell, so the time, track, and duration columns stay
 * clean, and paints over the rows' tints and highlights. A nested group draws
 * its own rail at its own icon.
 */
export function TraceGroup({ children }: { children: React.ReactNode }) {
    const depth = React.use(TraceDepthContext);
    const branch = React.useMemo(() => ({ ...depth, opensBranch: true }), [depth]);
    return (
        <div className="min-w-0" data-trace-group>
            <TraceDepthContext value={branch}>{children}</TraceDepthContext>
        </div>
    );
}

/**
 * A group's child: siblings in one list, so the last one turns its elbow into
 * └. Elbows match their own branch's `:last-child`, never an ancestor's.
 */
export const traceBranchClass = 'relative min-w-0';

/**
 * A branch's stretch of rail and its elbow. `row` hangs a child row (one
 * `min-h-8` line, icon centered) off its group's rail; it draws only in an
 * opened group's children. `line` hangs a line of body text whose text starts
 * where a row's label would, as a run of thoughts. `pass` carries the rail on
 * past a body with no elbow, as a sub-agent's fact line before its calls.
 * Both hairlines straddle the icon's center exactly, so the browser snaps
 * them to whole device pixels and they stay crisp at 1x and 2x.
 */
export function TraceElbow({ at }: { at: 'line' | 'pass' | 'row' }) {
    const { isBranch } = React.use(TraceDepthContext);
    const style = useTraceDepthStyle();
    if (at === 'row' && !isBranch) {
        return null;
    }
    const rail = traceElbowRail[at];
    const line = at === 'pass' ? null : traceElbowLine[at];
    return (
        <>
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute w-px bg-separator',
                    traceElbowRun[at],
                    line && '[:last-child>&]:hidden'
                )}
                data-trace-rail={at}
                style={{ ...style, insetInlineStart: rail }}
            />
            {line ? (
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute top-0 box-content border-separator border-b',
                        'start-[calc(var(--trace-rail)+1px)] w-(--trace-arm)',
                        '[:last-child>&]:start-(--trace-rail) [:last-child>&]:border-s',
                        line.className
                    )}
                    data-trace-elbow
                    style={
                        {
                            ...style,
                            '--trace-arm': line.arm,
                            '--trace-rail': rail,
                        } as React.CSSProperties
                    }
                />
            ) : null}
        </>
    );
}

/**
 * The rail's x from the branch's edge, centered on the group row's icon
 * (`size-3.5`). A row's branch spans the panel, so the icon sits one branch
 * step out from the child's indent; a line starts at its text, 5.5 steps past
 * the group row's icon start (`traceTextInset`).
 */
const traceElbowRail = {
    line: 'calc(var(--spacing) * -3.75 - 0.5px)',
    pass: `calc(var(--trace-lead, 0rem) + ${tracePad} + var(--trace-indent) + var(--spacing) * 1.75 - 0.5px)`,
    row: `calc(var(--trace-lead, 0rem) + ${tracePad} + var(--trace-indent) - ${traceBranchIndentRem}rem + var(--spacing) * 1.75 - 0.5px)`,
};

/**
 * The connector: its length past the rail, stopping 0.75 steps short of the
 * child's icon or text, and its content height, so its 1px bottom border
 * straddles the line's center (half a row, or half a line of text). A
 * thought's first line also reaches up through its body's top pad.
 */
const traceElbowLine = {
    line: {
        arm: 'calc(var(--spacing) * 3 - 0.5px)',
        className:
            'h-[calc(0.5lh-0.5px)] [:first-child>&]:-top-1 [:first-child>&]:h-[calc(0.5lh-0.5px+var(--spacing))]',
    },
    row: {
        arm: `calc(${traceBranchIndentRem}rem - var(--spacing) * 2.5 - 0.5px)`,
        className: 'h-[calc(var(--spacing)*4-0.5px)]',
    },
};

/** The rail's run down the branch, across the list's gap to the next sibling. */
const traceElbowRun = {
    line: 'top-0 -bottom-0.5 [:first-child>&]:-top-1',
    pass: 'top-0 bottom-0',
    row: 'top-0 -bottom-px',
};
