import {
    type AgentLinearTriggerConfigInput,
    type LinearTriggerGroupsInput,
    linearTriggerEventNameSchema,
    linearTriggerGroupInputSchema,
    linearTriggerGroupsInputSchema,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

// Turns `haus trigger create --kind linear` flags into the wire config
// (specs/linear-triggers.md#agent-cli). Flags build one match group;
// `--groups-json` supplies the whole array. The workspace url key, names, and
// Agent selectors go to the Server as typed: it resolves them to stable ids.

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

export function readLinearTriggerConfig(args: ParsedArgs): AgentLinearTriggerConfigInput {
    const groups = readLinearTriggerGroups(args);
    const workspace = args.values['--workspace']?.trim();
    return workspace ? { groups, workspace } : { groups };
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
        return validateGroups(value, (path) => `--groups-json ${path}`, 'keys');
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
    return validateGroups([group], (path) => flagFor(path), 'flags');
}

/** Validates against the wire schema, naming the flag or JSON path at fault. */
function validateGroups(
    value: unknown,
    locate: (path: string) => string,
    vocabulary: 'flags' | 'keys'
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
        const allowed = allowedFor(event, vocabulary);
        throw new AgentCliError('INVALID_ARG', `${where} does not apply to ${event} events.`, {
            nextAction: `${event} ${vocabulary === 'flags' ? 'flags' : 'group keys'}: ${allowed}.`,
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

/** The group keys (or their flags) an event's schema accepts. */
function allowedFor(event: string | undefined, vocabulary: 'flags' | 'keys'): string {
    const option = linearTriggerGroupInputSchema.options.find(
        (candidate) => candidate.shape.event.value === event
    );
    const keys = Object.keys(option?.shape ?? {});
    if (vocabulary === 'keys') {
        return keys.join(', ');
    }
    const flags = Object.entries(groupFlags)
        .filter(([, key]) => keys.includes(key))
        .map(([flag]) => flag);
    return flags.join(', ');
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
