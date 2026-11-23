/**
 * The Manual topic for each `haus` command family. Each family's `--help` ends
 * with `Details: haus manual get <family>`, so every family noun must resolve
 * here (tests prove it, plural forms included).
 */
export const cliFamilyTopics = {
    agent: 'agent',
    attachment: 'attachment',
    channel: 'channel',
    claim: 'claims',
    computer: 'computers',
    worker: 'workers',
    connection: 'connection',
    drive: 'drive',
    image: 'images',
    inbox: 'inbox',
    manual: 'index',
    message: 'message',
    profile: 'profile',
    reminder: 'reminder',
    repo: 'repos',
    server: 'server',
    skill: 'skill',
    task: 'tasks',
    trigger: 'trigger',
} as const;
