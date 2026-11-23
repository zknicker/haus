import {
    type AppPlace,
    agentProfile,
    agentSection,
    agentTriggers,
    channelActions,
    channelActionsMenu,
    label,
    settingsEntry,
    settingsSection,
    triggerManageGroup,
} from './app-place-model.ts';
import { computerAppPlaces } from './app-places-computers.ts';

const projectGeneralSection = 'features/settings/projects/project-general-section.tsx';

/** Where things live in Haus App, for Agents answering "where do I…". */
export const appPlaces: readonly AppPlace[] = [
    {
        area: 'you',
        task: 'Change your timezone',
        path: ['Settings', 'Profile', 'Timezone'],
        who: 'anyone',
        anchors: [
            settingsEntry(),
            settingsSection('profile'),
            label('features/settings/profile/timezone-row.tsx', 'Timezone'),
        ],
    },
    {
        area: 'you',
        task: 'Change the theme or light and dark mode',
        path: ['Settings', 'Appearance', 'Theme'],
        who: 'anyone',
        note: 'Mode sits above it. Create theme makes a custom one.',
        anchors: [
            settingsEntry(),
            settingsSection('appearance'),
            label('features/settings/appearance/theme-gallery.tsx', 'Theme'),
        ],
    },
    {
        area: 'you',
        task: 'Turn notifications on or off',
        path: ['Settings', 'Notifications', "Notify me when I'm needed"],
        who: 'anyone',
        anchors: [
            settingsEntry(),
            settingsSection('notifications'),
            label(
                'features/settings/notifications/notifications-section.tsx',
                "Notify me when I'm needed"
            ),
        ],
    },
    {
        area: 'you',
        task: 'Switch Servers or create one',
        path: ['Settings', 'Servers', 'Create a Server'],
        who: 'anyone',
        anchors: [
            settingsEntry(),
            settingsSection('servers'),
            label('features/settings/servers/page.tsx', 'Create a Server'),
        ],
    },
    {
        area: 'people-and-agents',
        task: 'Invite someone to this Server',
        path: ['Settings', 'Members', 'Invite'],
        who: 'owner-or-admin',
        anchors: [
            settingsEntry(),
            settingsSection('members'),
            label('features/servers/invite-popover.tsx', 'Invite'),
        ],
    },
    {
        area: 'people-and-agents',
        task: 'Create an Agent',
        path: ['Captains', 'New Captain'],
        who: 'owner-or-admin',
        note: 'It is the + beside Captains in the sidebar.',
        anchors: [
            label('features/capy-shell/captain-tiles.tsx', 'Captains'),
            label('features/capy-shell/capy-sidebar.tsx', 'New Captain'),
        ],
    },
    {
        area: 'people-and-agents',
        task: "Open an Agent's profile",
        path: ['Captains', "(the Captain's tile)", 'View Captain profile'],
        who: 'anyone',
        note: 'Right-click the tile.',
        anchors: [
            label('features/capy-shell/captain-tiles.tsx', 'Captains'),
            label('features/servers/chat/chat-context-menu-items.tsx', 'View Captain profile'),
        ],
    },
    {
        area: 'channels',
        task: 'Create a channel',
        path: ['Projects', 'New project'],
        who: 'anyone',
        note: 'It is the + beside Projects in the sidebar.',
        anchors: [
            label('features/capy-shell/capy-sidebar.tsx', 'Projects'),
            label('features/capy-shell/capy-sidebar.tsx', 'New project'),
        ],
    },
    {
        area: 'channels',
        task: 'Rename a channel or change its description',
        path: ['Project actions', 'Project settings', 'General'],
        who: 'anyone',
        anchors: [
            channelActions(),
            label(channelActionsMenu, 'Project settings'),
            label(projectGeneralSection, 'General'),
        ],
    },
    {
        area: 'channels',
        task: "Change a channel's icon or color",
        path: ['Project actions', 'Project settings', '(the mark beside its name)'],
        who: 'anyone',
        anchors: [channelActions(), label(channelActionsMenu, 'Project settings')],
    },
    {
        area: 'channels',
        task: "Choose where a channel's Workers run by default",
        path: ['Settings', 'Projects', '(the project)', 'Workers', 'Default place'],
        who: 'anyone',
        note: 'With No default, a Worker start must name its place.',
        anchors: [
            settingsEntry(),
            settingsSection('projects'),
            label('features/settings/projects/project-workers-section.tsx', 'Workers'),
            label('features/settings/projects/project-workers-section.tsx', 'Default place'),
        ],
    },
    {
        area: 'channels',
        task: 'Archive or delete a channel',
        path: ['Project actions', 'Archive project'],
        who: 'owner-or-admin',
        note: 'Delete project sits beside it. Neither is offered on #all.',
        anchors: [channelActions(), label(channelActionsMenu, 'Archive project')],
    },
    {
        area: 'agent-setup',
        task: "Change an Agent's runtime, model, or reasoning effort",
        path: ['Captain profile', 'Runs on'],
        who: 'owner-or-admin',
        anchors: [...agentProfile(), agentSection('runtime')],
    },
    {
        area: 'agent-setup',
        task: 'Create a Trigger',
        path: ['Captain profile', 'Automations', 'New Trigger'],
        who: 'owner-or-admin',
        anchors: [
            ...agentProfile(),
            agentSection('automations'),
            label(agentTriggers, 'New Trigger'),
        ],
    },
    {
        area: 'agent-setup',
        task: 'Reveal a fresh Trigger secret',
        path: ['Captain profile', 'Automations', '(the Trigger)', 'Rotate secret', 'Rotate'],
        who: 'owner-or-admin',
        note: 'The old secret stops working.',
        anchors: [
            ...agentProfile(),
            agentSection('automations'),
            label(triggerManageGroup, 'Rotate secret'),
            label(triggerManageGroup, 'Rotate'),
        ],
    },
    {
        area: 'agent-setup',
        task: "See a Trigger's recent fires",
        path: ['Captain profile', 'Automations', 'View trigger history'],
        who: 'owner-or-admin',
        anchors: [
            ...agentProfile(),
            agentSection('automations'),
            label(agentTriggers, 'View trigger history'),
        ],
    },
    {
        area: 'agent-setup',
        task: "Add a skill from a Computer to an Agent's library",
        path: ['Captain profile', 'Skills', 'Add Skills'],
        who: 'owner-or-admin',
        anchors: [
            ...agentProfile(),
            agentSection('skills'),
            label('features/members/agent-profile/skill-list.tsx', 'Add Skills'),
        ],
    },
    {
        area: 'agent-setup',
        task: 'Choose which connections an Agent can use',
        path: ['Captain profile', 'Connections'],
        who: 'owner-or-admin',
        anchors: [...agentProfile(), agentSection('connections')],
    },
    ...computerAppPlaces,
    {
        area: 'server',
        task: 'See Agent usage',
        path: ['Settings', 'Usage'],
        who: 'anyone',
        anchors: [settingsEntry(), settingsSection('usage')],
    },
    {
        area: 'server',
        task: 'Find an archived chat',
        path: ['Settings', 'Archived chats'],
        who: 'anyone',
        anchors: [settingsEntry(), settingsSection('archived')],
    },
];
