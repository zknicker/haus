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
        description: 'github: event to listen to (repeatable)',
        name: '--event',
        valueName: '<name>',
    },
    { description: 'github: event action filter', name: '--action', valueName: '<action>' },
    {
        description: 'github: check or workflow conclusion, e.g. failure',
        name: '--conclusion',
        valueName: '<value>',
    },
    { description: 'github: branch filter', name: '--branch', valueName: '<branch>' },
    { description: 'github: label filter', name: '--label', valueName: '<label>' },
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
