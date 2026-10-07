import { traceTextMaxChars } from './turn-trace-values.ts';

/** A JSON object or array: the only values the trace draws as a tree. */
export type TraceJsonContainer = readonly unknown[] | Readonly<Record<string, unknown>>;

/** One row of a JSON tree: a container to open, or a scalar to read. */
export type TraceJsonNode =
    | {
          readonly children: readonly TraceJsonNode[];
          readonly id: string;
          readonly kind: 'array' | 'object';
          readonly label: string;
          readonly level: number;
          /** What a collapsed container says it holds: `{3 keys}`, `[12]`. */
          readonly summary: string;
          readonly value: TraceJsonContainer;
      }
    | {
          readonly id: string;
          readonly kind: 'boolean' | 'null' | 'number' | 'string';
          readonly label: string;
          readonly level: number;
          /** The value as JSON spells it: `"text"`, `12`, `true`, `null`. */
          readonly text: string;
          readonly value: unknown;
      };

/**
 * The JSON container a tool payload is, or null. A payload that is already
 * an object or array is one; a string is one when it parses as an object or
 * array (a runtime handing back serialized JSON). Anything else — a scalar,
 * prose, text past the trace's character bound — draws as text instead.
 */
export function readTraceJson(value: unknown): TraceJsonContainer | null {
    if (typeof value === 'string') {
        return parseJsonContainer(value);
    }
    return isContainer(value) ? value : null;
}

/** A container's entries as tree rows, ids by JSON path so they stay stable across renders. */
export function buildTraceJsonNodes(
    container: TraceJsonContainer,
    path = '$',
    level = 1
): TraceJsonNode[] {
    return readEntries(container).map(([key, value]) => {
        // Quoted keys, so `a.b` and `a` → `b` never share an id.
        const id = Array.isArray(container) ? `${path}[${key}]` : `${path}[${JSON.stringify(key)}]`;
        if (isContainer(value)) {
            return {
                children: buildTraceJsonNodes(value, id, level + 1),
                id,
                kind: Array.isArray(value) ? 'array' : 'object',
                label: key,
                level,
                summary: summarizeTraceJson(value),
                value,
            };
        }
        return { id, kind: scalarKind(value), label: key, level, text: formatScalar(value), value };
    });
}

export function summarizeTraceJson(container: TraceJsonContainer): string {
    if (Array.isArray(container)) {
        return `[${container.length}]`;
    }
    const keys = Object.keys(container).length;
    return `{${keys} ${keys === 1 ? 'key' : 'keys'}}`;
}

/**
 * Containers open on first render: the top level and the level under it, so
 * a payload reads at a glance without unrolling a large nested result.
 */
export function readTraceJsonOpenIds(
    nodes: readonly TraceJsonNode[],
    depth = traceJsonOpenDepth
): string[] {
    return nodes.flatMap((node) =>
        node.kind === 'array' || node.kind === 'object'
            ? node.level <= depth && node.children.length <= traceJsonOpenMaxChildren
                ? [node.id, ...readTraceJsonOpenIds(node.children, depth)]
                : []
            : []
    );
}

/** Longest string a row shows before it folds to an ellipsis. */
export const traceJsonStringChars = 120;

/** A string value as its row shows it: whole, or cut short until someone opens it. */
export function truncateTraceJsonString(text: string): { hiddenChars: number; text: string } {
    if (text.length <= traceJsonStringChars) {
        return { hiddenChars: 0, text };
    }
    return {
        hiddenChars: text.length - traceJsonStringChars,
        text: `${text.slice(0, traceJsonStringChars)}…`,
    };
}

/** What copying a row copies: a string's own text, anything else as indented JSON. */
export function formatTraceJsonCopy(value: unknown): string {
    return typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? 'null');
}

const traceJsonOpenDepth = 1;
const traceJsonOpenMaxChildren = 50;

function parseJsonContainer(text: string): TraceJsonContainer | null {
    const trimmed = text.trim();
    if (trimmed.length > traceTextMaxChars || !/^[[{]/.test(trimmed)) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        return isContainer(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isContainer(value: unknown): value is TraceJsonContainer {
    if (Array.isArray(value)) {
        return true;
    }
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function readEntries(container: TraceJsonContainer): [string, unknown][] {
    if (Array.isArray(container)) {
        return container.map((value, index) => [String(index), value]);
    }
    // `undefined` and functions are not JSON: `JSON.stringify` drops them, so the tree does too.
    return Object.entries(container).filter(
        ([, value]) => value !== undefined && typeof value !== 'function'
    );
}

function scalarKind(value: unknown): 'boolean' | 'null' | 'number' | 'string' {
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return typeof value as 'boolean' | 'number' | 'string';
    }
    return 'null';
}

function formatScalar(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return 'null';
}
