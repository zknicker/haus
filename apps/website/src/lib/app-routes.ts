export const appRoutes = {
    search: '/search',
    chats: '/chats',
    chat(chatId: string) {
        return `/chats/${chatId}`;
    },
    archivedChats: '/chats/archived',
    inbox: '/inbox',
    tasks: '/tasks',
    activity: '/activity',

    settings: '/settings',
    settingsPreferences: '/settings/preferences',
    settingsProfile: '/settings/profile',
    settingsMembers: '/settings/members',
    settingsServers: '/settings/servers',
    settingsSkills: '/settings/skills',
    settingsConnections: '/settings/connections',
    settingsModels: '/settings/models',
    settingsUsage: '/settings/usage',
} as const;
