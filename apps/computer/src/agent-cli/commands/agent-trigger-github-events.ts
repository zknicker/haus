import {
    type GithubTriggerEvent,
    type GithubTriggerEventName,
    githubTriggerAuthorsSchema,
    githubTriggerEventNameSchema,
    githubTriggerEventSchema,
    githubTriggerEventsSchema,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

// Turns `haus trigger create --kind github` flags into the wire config
// (specs/github-triggers.md#agent-cli-and-manual). Each filter flag applies to
// every listed event that takes it; a value lands on the events that accept it.

/** Filter flags and the event field each one fills. */
const filterFlags = {
    '--actor': 'actors',
    '--exclude-actor': 'actorsIgnore',
    '--match-repo': 'repositories',
    '--exclude-repo': 'repositoriesIgnore',
    '--exclude-branch': 'branchesIgnore',
    '--exclude-workflow': 'workflowsIgnore',
    '--exclude-check-name': 'checkNamesIgnore',
    '--exclude-environment': 'environmentsIgnore',
    '--workflow-event': 'workflowEvents',
    '--action': 'actions',
    '--branch': 'branches',
    '--check-name': 'checkNames',
    '--conclusion': 'conclusions',
    '--environment': 'environments',
    '--label': 'labels',
    '--state': 'states',
    '--workflow': 'workflows',
} as const;
type FilterFlag = keyof typeof filterFlags;

/** Flags only a `github` Trigger takes; a webhook create refuses them. */
export const githubOnlyFlags = [
    '--repo',
    '--org',
    '--event',
    '--authors',
    '--events-json',
    ...Object.keys(filterFlags),
];

/** `--branch` means the base branch on a pull request. */
function fieldFor(flag: FilterFlag, event: GithubTriggerEventName): string {
    if (event === 'pull_request' && flag === '--branch') {
        return 'baseBranches';
    }
    if (event === 'pull_request' && flag === '--exclude-branch') {
        return 'baseBranchesIgnore';
    }
    return filterFlags[flag];
}

export function readGithubTriggerEvents(args: ParsedArgs): GithubTriggerEvent[] {
    const json = args.values['--events-json'];
    if (json !== undefined) {
        if (
            ['--event', '--authors', ...Object.keys(filterFlags)].some(
                (flag) => args.values[flag] !== undefined
            )
        ) {
            throw new AgentCliError(
                'INVALID_ARG',
                '--events-json replaces event and filter flags.'
            );
        }
        let value: unknown;
        try {
            value = JSON.parse(json);
        } catch {
            throw new AgentCliError(
                'INVALID_ARG',
                '--events-json must be a JSON array of match groups.'
            );
        }
        const parsed = githubTriggerEventsSchema.safeParse(value);
        if (!parsed.success) {
            throw new AgentCliError(
                'INVALID_ARG',
                parsed.error.issues[0]?.message ?? 'Invalid match groups.'
            );
        }
        return parsed.data;
    }
    const names = listValues(args, '--event');
    if (names.length === 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --event with a GitHub event to listen to.',
            {
                nextAction: `Events: ${githubTriggerEventNameSchema.options.join(', ')}. Repeat --event for more than one.`,
            }
        );
    }
    const events = names.map((name) => {
        const parsed = githubTriggerEventNameSchema.safeParse(name);
        if (!parsed.success) {
            throw new AgentCliError(
                'INVALID_ARG',
                `--event ${name} is not a GitHub Trigger event.`,
                {
                    nextAction: `Events: ${githubTriggerEventNameSchema.options.join(', ')}. Comment events are not available.`,
                }
            );
        }
        return parsed.data;
    });
    const entries: Record<string, unknown>[] = events.map((event) => ({ event }));
    for (const flag of Object.keys(filterFlags) as FilterFlag[]) {
        applyFilter(args, flag, entries);
    }
    applyAuthors(args, entries);
    const parsed = githubTriggerEventsSchema.safeParse(entries);
    if (!parsed.success) {
        throw new AgentCliError(
            'INVALID_ARG',
            parsed.error.issues[0]?.message ?? 'Invalid events.',
            {
                nextAction: 'Use at most 10 match groups and 20 values per filter.',
            }
        );
    }
    return parsed.data;
}

/** Each listed event takes the values it accepts; a value no event accepts is refused. */
function applyFilter(args: ParsedArgs, flag: FilterFlag, entries: Record<string, unknown>[]) {
    const values = listValues(args, flag);
    if (values.length === 0) {
        return;
    }
    const used = new Set<string>();
    let supported = false;
    for (const entry of entries) {
        const event = entry.event as GithubTriggerEventName;
        const field = fieldFor(flag, event);
        if (!acceptsField(event, field)) {
            continue;
        }
        supported = true;
        const accepted = values.filter((value) => accepts(event, field, value));
        for (const value of accepted) {
            used.add(value);
        }
        if (accepted.length > 0) {
            entry[field] = accepted;
        }
    }
    const listed = entries.map((entry) => entry.event).join(', ');
    if (!supported) {
        throw new AgentCliError(
            'INVALID_ARG',
            `${flag} applies to none of the listed events (${listed}).`,
            {
                nextAction:
                    'Drop the flag, or add an event that takes it. haus trigger create --help lists which do.',
            }
        );
    }
    const unused = values.filter((value) => !used.has(value));
    if (unused.length > 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            `${flag} ${unused.join(', ')} fits none of the listed events (${listed}).`,
            {
                nextAction:
                    'Use the lower-case GitHub value, such as --action completed or --conclusion failure.',
            }
        );
    }
}

function applyAuthors(args: ParsedArgs, entries: Record<string, unknown>[]) {
    const raw = args.values['--authors']?.trim();
    if (!raw) {
        return;
    }
    const authors = githubTriggerAuthorsSchema.safeParse(raw);
    if (!authors.success) {
        throw new AgentCliError('INVALID_ARG', `--authors ${raw} is not collaborators or anyone.`);
    }
    const takers = entries.filter((entry) =>
        acceptsField(entry.event as GithubTriggerEventName, 'authors')
    );
    if (takers.length === 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            '--authors applies only to pull_request, pull_request_review, and issues.'
        );
    }
    for (const entry of takers) {
        entry.authors = authors.data;
    }
}

/** Whether one event entry takes `field` with this single value. */
function accepts(event: GithubTriggerEventName, field: string, value: string): boolean {
    return githubTriggerEventSchema.safeParse({ event, [field]: [value] }).success;
}

/** Whether the event has the field at all (a strict schema refuses unknown keys). */
function acceptsField(event: GithubTriggerEventName, field: string): boolean {
    const result = githubTriggerEventSchema.safeParse({ event, [field]: 'probe' });
    return (
        result.success || !result.error.issues.some((issue) => issue.code === 'unrecognized_keys')
    );
}

/** Repeated flags, each value also split on commas. */
function listValues(args: ParsedArgs, flag: string): string[] {
    const raw = args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
    return raw
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
