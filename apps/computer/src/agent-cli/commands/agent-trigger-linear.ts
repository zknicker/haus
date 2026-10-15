import {
    type AgentLinearWorkspace,
    agentLinearWorkspacesSchema,
    type LinearTriggerConfigInput,
    type LinearTriggerGroupsInput,
    linearTriggerEventNameSchema,
    linearTriggerGroupsInputSchema,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

// Turns `haus trigger create --kind linear` flags into the wire config
// (specs/linear-triggers.md#agent-cli-and-manual). Flags build one match group;
// `--groups-json` supplies the whole array. Names, keys, and Agent selectors
// go to the Server as typed: it resolves them to stable ids before storing.

/** Group flags and the group field each one fills. */
const groupFlags = {
    '--action': 'actions',
    '--actor': 'actors',
    '--assignee': 'assignees',
    '--changed': 'changed',
    '--delegate': 'delegates',
    '--exclude-actor': 'actorsIgnore',
    '--exclude-label': 'labelsIgnore',
    '--label': 'labels',
    '--project': 'projects',
    '--state-from': 'stateFrom',
    '--state-to': 'stateTo',
    '--state-type': 'stateTypes',
    '--team': 'teams',
} as const;
type GroupFlag = keyof typeof groupFlags;

/** Enumerated values split on commas too; names may contain commas, so they only repeat. */
const commaFlags = new Set<string>(['--action', '--changed', '--state-type']);

/** Flags only a `linear` Trigger takes. */
export const linearOnlyFlags = [
    '--workspace',
    '--groups-json',
    '--assignee',
    '--changed',
    '--delegate',
    '--exclude-label',
    '--project',
    '--state-from',
    '--state-to',
    '--state-type',
    '--team',
];

/** Every flag a `linear` Trigger takes, including the names it shares with `github`. */
export const linearFlags = [...linearOnlyFlags, '--event', ...Object.keys(groupFlags)];

export async function readLinearTriggerConfig(
    args: ParsedArgs,
    client: AgentApiRequester
): Promise<LinearTriggerConfigInput> {
    const groups = readLinearTriggerGroups(args);
    const workspace = await resolveWorkspace(client, args.values['--workspace']?.trim());
    return { connectionId: workspace.connectionId, groups };
}

export function readLinearTriggerGroups(args: ParsedArgs): LinearTriggerGroupsInput {
    const json = args.values['--groups-json'];
    if (json !== undefined) {
        const flag = ['--event', ...Object.keys(groupFlags)].find(
            (name) => args.values[name] !== undefined
        );
        if (flag) {
            throw new AgentCliError('INVALID_ARG', `--groups-json replaces ${flag}.`, {
                nextAction: 'Put every filter inside the JSON groups, or drop --groups-json.',
            });
        }
        let value: unknown;
        try {
            value = JSON.parse(json);
        } catch {
            throw new AgentCliError(
                'INVALID_ARG',
                '--groups-json must be a JSON array of match groups.'
            );
        }
        return validateGroups(value, (path) => `--groups-json ${path}`);
    }
    const events = listValues(args, '--event', false);
    if (events.length !== 1) {
        throw new AgentCliError(
            'INVALID_ARG',
            events.length === 0
                ? 'Provide --event with the Linear event to listen to.'
                : 'Flags build one match group, so pass one --event.',
            {
                nextAction: `Events: ${linearTriggerEventNameSchema.options.join(', ')}. Use --groups-json for several groups.`,
            }
        );
    }
    const group: Record<string, unknown> = { event: events[0] };
    for (const flag of Object.keys(groupFlags) as GroupFlag[]) {
        const values = listValues(args, flag, commaFlags.has(flag));
        if (values.length > 0) {
            group[groupFlags[flag]] = values;
        }
    }
    return validateGroups([group], (path) => flagFor(path));
}

/** Validates against the wire schema, naming the flag or JSON path at fault. */
function validateGroups(
    value: unknown,
    locate: (path: string) => string
): LinearTriggerGroupsInput {
    const parsed = linearTriggerGroupsInputSchema.safeParse(value);
    if (parsed.success) {
        return parsed.data;
    }
    const issue = parsed.error.issues[0];
    if (!issue) {
        throw new AgentCliError('INVALID_ARG', 'Invalid match groups.');
    }
    const event = eventAt(value, issue.path[0]);
    if (issue.code === 'unrecognized_keys') {
        const where = issue.keys.map((key) => locate([...issue.path, key].join('.'))).join(', ');
        throw new AgentCliError('INVALID_ARG', `${where} does not apply to ${event} events.`, {
            nextAction:
                'haus manual get recipes/technique/trigger-linear lists each event’s filters.',
        });
    }
    if (issue.path[1] === 'event' || (issue.path.length <= 1 && issue.code === 'invalid_union')) {
        throw new AgentCliError(
            'INVALID_ARG',
            `${event ?? 'That'} is not a Linear Trigger event.`,
            {
                nextAction: `Events: ${linearTriggerEventNameSchema.options.join(', ')}. A label change is issue update with changed labels.`,
            }
        );
    }
    throw new AgentCliError('INVALID_ARG', `${locate(issue.path.join('.'))}: ${issue.message}`, {
        nextAction: 'Use at most 10 groups and 20 values per filter.',
    });
}

async function resolveWorkspace(
    client: AgentApiRequester,
    key: string | undefined
): Promise<AgentLinearWorkspace> {
    const { workspaces } = await client.request(
        '/api/agent/linear/workspaces',
        agentLinearWorkspacesSchema,
        { method: 'GET' }
    );
    if (workspaces.length === 0) {
        throw new AgentCliError('INVALID_TARGET', 'No Linear workspace you can use.', {
            nextAction:
                'Ask a Haus Owner or Admin to connect Linear under Settings → Connections → Linear and grant you the connection.',
        });
    }
    const keys = workspaces.map((workspace) => workspace.urlKey).join(', ');
    const match = key
        ? workspaces.find((workspace) =>
              [workspace.urlKey, workspace.name].some(
                  (name) => name.toLowerCase() === key.toLowerCase()
              )
          )
        : workspaces.length === 1
          ? workspaces[0]
          : undefined;
    if (!match) {
        throw new AgentCliError(
            key ? 'INVALID_TARGET' : 'INVALID_ARG',
            key
                ? `No Linear workspace you can use is ${key}.`
                : 'Provide --workspace with the workspace url key.',
            { nextAction: `You can use: ${keys}.` }
        );
    }
    if (match.status !== 'active') {
        throw new AgentCliError(
            'INVALID_TARGET',
            `The ${match.name} Linear workspace is ${match.status.replaceAll('_', ' ')}.`,
            {
                nextAction:
                    'Ask a Haus Owner or Admin to reconnect Linear under Settings → Connections → Linear.',
            }
        );
    }
    return match;
}

/** `0.stateTo.1` → `--state-to`. */
function flagFor(path: string): string {
    const field = path.split('.')[1];
    const entry = Object.entries(groupFlags).find(([, name]) => name === field);
    return entry ? entry[0] : (field ?? 'the group');
}

function eventAt(value: unknown, index: PropertyKey | undefined): string | undefined {
    if (!Array.isArray(value) || typeof index !== 'number') {
        return undefined;
    }
    const group: unknown = value[index];
    return group && typeof group === 'object' && 'event' in group ? String(group.event) : undefined;
}

/** Repeated flags; enumerated flags also split on commas. */
function listValues(args: ParsedArgs, flag: string, splitCommas: boolean): string[] {
    const raw = args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
    return raw
        .flatMap((value) => (splitCommas ? value.split(',') : [value]))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
