/**
 * The Manual topic for each `haus` command family. Each family's `--help` ends
 * with `Details: haus manual get <family>`, so every family noun must resolve
 * here (tests prove it, plural forms included).
 */
export const cliFamilyTopics = {
    agent: 'agent',
    attachment: 'attachment',
    channel: 'channel',
    'cloud-agent': 'cloud-agents',
    inbox: 'inbox',
    manual: 'index',
    message: 'message',
    profile: 'profile',
    reminder: 'reminder',
    server: 'server',
    skill: 'skill',
    task: 'tasks',
    thread: 'thread',
    trigger: 'trigger',
    visual: 'visual',
} as const;
