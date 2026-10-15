import type { LinearToolName } from '@haus/api/linear-actor-meta';
import * as z from 'zod';
import type { LinearCallContext } from './call-context.ts';
import { inputError } from './tool-error.ts';

/** One tool as the MCP surface sees it: a name, a JSON Schema, and a validated call. */
export interface LinearToolEntry {
    call(context: LinearCallContext, args: unknown): Promise<Record<string, unknown>>;
    description: string;
    inputSchema: Record<string, unknown>;
    name: LinearToolName;
    readOnly: boolean;
}

export function defineTool<Input extends z.ZodObject>(tool: {
    description: string;
    input: Input;
    name: LinearToolName;
    readOnly: boolean;
    run(context: LinearCallContext, input: z.output<Input>): Promise<Record<string, unknown>>;
}): LinearToolEntry {
    return {
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>,
        name: tool.name,
        readOnly: tool.readOnly,
        async call(context, args) {
            const parsed = tool.input.safeParse(args ?? {});
            if (!parsed.success) {
                throw inputError(`Invalid arguments: ${z.prettifyError(parsed.error)}`);
            }
            return await tool.run(context, parsed.data);
        },
    };
}

// Shared argument shapes. Linear accepts an issue's UUID or its identifier.
export const linearIdArg = z.string().trim().min(1).max(100);
export const issueArg = linearIdArg.describe('Issue id or identifier, such as DES-142.');
export const teamArg = linearIdArg.describe('Team id or key, such as DES.');
export const limitArg = z.number().int().min(1).max(50).default(25);
export const cursorArg = z.string().min(1).max(500).optional().describe('nextCursor of a page.');
export const queryArg = z.string().trim().min(1).max(200);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isLinearUuid(value: string) {
    return uuidPattern.test(value);
}

/** Filter one Linear object by id when given a UUID, otherwise by a case-insensitive field. */
export function idOr(field: string, value: string): Record<string, unknown> {
    return isLinearUuid(value) ? { id: { eq: value } } : { [field]: { eqIgnoreCase: value } };
}

export interface LinearConnection<T> {
    nodes: T[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
}

/** A page of results; `nextCursor` continues it. */
export function page<T>(connection: LinearConnection<T>, map: (node: T) => unknown = flatten) {
    return {
        items: connection.nodes.map(map),
        nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
    };
}

/** Collapses GraphQL `{ nodes: [...] }` wrappers into plain arrays. */
export function flatten(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(flatten);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const entries = Object.entries(value);
    const [only] = entries;
    if (entries.length === 1 && only?.[0] === 'nodes' && Array.isArray(only[1])) {
        return only[1].map(flatten);
    }
    return Object.fromEntries(entries.map(([key, inner]) => [key, flatten(inner)]));
}

export const pageInfoFields = 'pageInfo { hasNextPage endCursor }';
