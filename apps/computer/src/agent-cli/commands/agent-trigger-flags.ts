import type { CliFlag } from '../parse.ts';

export const GITHUB_CREATE_FLAGS: CliFlag[] = [
    ...[
        'actor',
        'exclude-actor',
        'match-repo',
        'exclude-repo',
        'exclude-branch',
        'exclude-workflow',
        'exclude-check-name',
        'exclude-environment',
        'workflow-event',
        'events-json',
    ].map((name) => ({
        description:
            name === 'events-json'
                ? 'github: JSON array of OR groups, replaces event/filter flags'
                : name.endsWith('actor')
                  ? `github or linear: ${name} filter, repeatable`
                  : `github: ${name} filter, repeatable; patterns for names`,
        name: `--${name}`,
        valueName: '<value>',
    })),
    {
        description: 'github: a repository to watch (repeatable)',
        name: '--repo',
        valueName: '<owner/name>',
    },
    {
        description: 'github: every repository you can reach in this account',
        name: '--org',
        valueName: '<login>',
    },
    {
        description: 'github: event to listen to (repeatable); linear: issue, comment, or project',
        name: '--event',
        valueName: '<name>',
    },
    {
        description: 'github or linear: event action filter',
        name: '--action',
        valueName: '<action>',
    },
    {
        description: 'github: check or workflow conclusion, e.g. failure',
        name: '--conclusion',
        valueName: '<value>',
    },
    { description: 'github: branch filter', name: '--branch', valueName: '<branch>' },
    { description: 'github or linear: label filter', name: '--label', valueName: '<label>' },
    { description: 'github: deployment or review state', name: '--state', valueName: '<state>' },
    { description: 'github: deployment environment', name: '--environment', valueName: '<name>' },
    { description: 'github: workflow file path', name: '--workflow', valueName: '<path>' },
    { description: 'github: check run name', name: '--check-name', valueName: '<name>' },
    {
        description: 'github: collaborators (default) or anyone',
        name: '--authors',
        valueName: '<who>',
    },
];

/** `linear` flags; `--event`, `--action`, `--label`, `--actor`, `--exclude-actor` are shared above. */
export const LINEAR_CREATE_FLAGS: CliFlag[] = [
    {
        description: 'linear: workspace url key from haus linear workspaces',
        name: '--workspace',
        valueName: '<urlKey>',
    },
    {
        description: 'linear: JSON array of match groups, replaces event/filter flags',
        name: '--groups-json',
        valueName: '<json>',
    },
    { description: 'linear: changed field, e.g. state', name: '--changed', valueName: '<field>' },
    { description: 'linear: previous state name', name: '--state-from', valueName: '<name>' },
    { description: 'linear: state the issue arrived in', name: '--state-to', valueName: '<name>' },
    {
        description: 'linear: state type, e.g. started',
        name: '--state-type',
        valueName: '<type>',
    },
    { description: 'linear: team key or name', name: '--team', valueName: '<key>' },
    { description: 'linear: project name or URL', name: '--project', valueName: '<name>' },
    { description: 'linear: label to exclude', name: '--exclude-label', valueName: '<name>' },
    {
        description: 'linear: issue delegated to @self or @agent:<handle>',
        name: '--delegate',
        valueName: '<agent>',
    },
    { description: 'linear: assignee email or name', name: '--assignee', valueName: '<who>' },
];
