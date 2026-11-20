import type { ToolIntentCopy, ToolIntentKind } from './chat-transcript-tool-intent-types.ts';

export const intentCopy: Record<ToolIntentKind, ToolIntentCopy> = {
    automation: {
        active: 'Managing automations',
        completed: 'Managed automations',
        priority: 5,
    },
    browser: {
        active: 'Browsing web',
        completed: 'Browsed web',
        priority: 7,
    },
    calendar: {
        active: 'Checking calendar',
        completed: 'Checked calendar',
        priority: 10,
    },
    code: {
        active: 'Running code',
        completed: 'Ran code',
        priority: 5,
    },
    'code-search': {
        active: 'Searching code',
        completed: 'Searched code',
        priority: 8,
    },
    command: {
        active: 'Running a command',
        completed: 'Ran a command',
        plural: 'Ran {count} commands',
        priority: 4,
    },
    computer: {
        active: 'Using computer',
        completed: 'Used computer',
        priority: 7,
    },
    clarification: {
        active: 'Needs an answer',
        completed: 'Asked a question',
        priority: 11,
    },
    document: {
        active: 'Checking documents',
        completed: 'Checked documents',
        priority: 6,
    },
    'file-edit': {
        active: 'Editing a file',
        completed: 'Edited a file',
        plural: 'Edited {count} files',
        priority: 9,
    },
    'file-list': {
        active: 'Listing files',
        completed: 'Listed files',
        priority: 8,
    },
    'file-read': {
        active: 'Reading a file',
        completed: 'Read a file',
        plural: 'Read {count} files',
        priority: 8,
    },
    home: {
        active: 'Checking Home Assistant',
        completed: 'Checked Home Assistant',
        priority: 7,
    },
    image: {
        active: 'Working with media',
        completed: 'Worked with media',
        priority: 6,
    },
    memory: {
        active: 'Checking memory',
        completed: 'Checked memory',
        priority: 6,
    },
    message: {
        active: 'Sending a message',
        completed: 'Sent a message',
        plural: 'Sent {count} messages',
        priority: 5,
    },
    skill: {
        active: 'Checking skills',
        completed: 'Checked skills',
        priority: 5,
    },
    task: {
        active: 'Updating tasks',
        completed: 'Updated tasks',
        priority: 5,
    },
    thinking: {
        active: 'Thinking',
        completed: 'Thought',
        priority: 1,
    },
    tool: {
        active: 'Using a tool',
        completed: 'Used a tool',
        plural: 'Used {count} tools',
        priority: 1,
    },
    voice: {
        active: 'Generating audio',
        completed: 'Generated audio',
        priority: 6,
    },
    web: {
        active: 'Searching web',
        completed: 'Searched web',
        priority: 8,
    },
    wiki: {
        active: 'Checking wiki',
        completed: 'Checked wiki',
        priority: 6,
    },
    subagent: {
        active: 'Working with agents',
        completed: 'Worked with agents',
        priority: 7,
    },
};

export function activeVerb(kind: ToolIntentKind) {
    switch (kind) {
        case 'automation':
            return 'Managing';
        case 'browser':
            return 'Browsing';
        case 'calendar':
            return 'Checking';
        case 'code':
            return 'Running';
        case 'code-search':
            return 'Searching';
        case 'command':
            return 'Running';
        case 'computer':
            return 'Using';
        case 'clarification':
            return 'Waiting on';
        case 'document':
            return 'Checking';
        case 'file-edit':
            return 'Editing';
        case 'file-list':
            return 'Listing';
        case 'file-read':
            return 'Reading';
        case 'home':
            return 'Checking';
        case 'image':
            return 'Working with';
        case 'memory':
            return 'Checking';
        case 'message':
            return 'Sending';
        case 'skill':
            return 'Checking';
        case 'task':
            return 'Updating';
        case 'thinking':
            return 'Thinking about';
        case 'tool':
            return 'Using';
        case 'voice':
            return 'Generating';
        case 'web':
            return 'Searching';
        case 'wiki':
            return 'Checking';
        case 'subagent':
            return 'Working on';
    }
}

export function completedVerb(kind: ToolIntentKind) {
    switch (kind) {
        case 'automation':
            return 'Managed';
        case 'browser':
            return 'Browsed';
        case 'calendar':
            return 'Checked';
        case 'code':
            return 'Ran';
        case 'code-search':
            return 'Searched';
        case 'command':
            return 'Ran';
        case 'computer':
            return 'Used';
        case 'clarification':
            return 'Asked';
        case 'document':
            return 'Checked';
        case 'file-edit':
            return 'Edited';
        case 'file-list':
            return 'Listed';
        case 'file-read':
            return 'Read';
        case 'home':
            return 'Checked';
        case 'image':
            return 'Worked with';
        case 'memory':
            return 'Checked';
        case 'message':
            return 'Sent';
        case 'skill':
            return 'Checked';
        case 'task':
            return 'Updated';
        case 'thinking':
            return 'Thought about';
        case 'tool':
            return 'Used';
        case 'voice':
            return 'Generated';
        case 'web':
            return 'Searched';
        case 'wiki':
            return 'Checked';
        case 'subagent':
            return 'Worked on';
    }
}
