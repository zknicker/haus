import {
    type AppPlace,
    computers,
    computersGroup,
    label,
    secrets,
    secretsRow,
    settingsEntry,
    settingsSection,
} from './app-place-model.ts';

export const computerAppPlaces: readonly AppPlace[] = [
    {
        area: 'connections-and-computers',
        task: 'Connect a service such as GitHub or an MCP server',
        path: ['Settings', 'Connections'],
        who: 'owner-or-admin',
        anchors: [settingsEntry(), settingsSection('connections')],
    },
    {
        area: 'connections-and-computers',
        task: 'Add a Computer',
        path: ['Settings', 'Devices', 'Add device'],
        who: 'owner-or-admin',
        note: 'It is the Add device button on Devices.',
        anchors: [settingsEntry(), computers(), label(computersGroup, 'Add device')],
    },
    {
        area: 'connections-and-computers',
        task: 'Connect a 1Password vault to a Computer',
        path: ['Settings', 'Devices', '(your device)', 'Secrets', 'Connect 1Password'],
        who: 'owner',
        note: 'Desktop App only.',
        anchors: [settingsEntry(), computers(), secrets(), label(secretsRow, 'Connect 1Password')],
    },
    {
        area: 'connections-and-computers',
        task: 'Pick up items newly added to that vault',
        path: ['Settings', 'Devices', '(your device)', 'Secrets', 'Refresh items'],
        who: 'owner',
        note: 'Desktop App only.',
        anchors: [settingsEntry(), computers(), secrets(), label(secretsRow, 'Refresh items')],
    },
    {
        area: 'connections-and-computers',
        task: 'Let a Captain from another device run tools on a device',
        path: ['Settings', 'Devices', '(your device)', 'Access', 'Add Captain'],
        who: 'attacher',
        note: 'An Owner or Admin can Remove a Captain there but not add one.',
        anchors: [
            settingsEntry(),
            computers(),
            label('features/computers/computer-access-section.tsx', 'Access'),
            label('features/computers/agent-access-card.tsx', 'Add Captain'),
        ],
    },
    {
        area: 'connections-and-computers',
        task: 'Add a repo folder to a Computer',
        path: ['Settings', 'Devices', '(your device)', 'Folders', 'Add folder'],
        who: 'anyone',
        note: 'Only the person who attached the Device.',
        anchors: [
            settingsEntry(),
            computers(),
            label('features/computers/computer-repo-folders-card.tsx', 'Folders'),
            label('features/computers/computer-repo-folders-card.tsx', 'Add folder'),
        ],
    },
    {
        area: 'connections-and-computers',
        task: "Add a repo, or check the Haus GitHub App's access to it",
        path: ['Settings', 'Repositories', 'Add repository'],
        who: 'anyone',
        anchors: [
            settingsEntry(),
            settingsSection('repos'),
            label('features/settings/repos/page.tsx', 'Add repository'),
        ],
    },
    {
        area: 'connections-and-computers',
        task: "Connect a Captain's model account (Claude, ChatGPT, SuperGrok or an API key)",
        path: ['Settings', 'Models', 'Add connection'],
        who: 'owner',
        anchors: [
            settingsEntry(),
            settingsSection('models'),
            label(
                'features/settings/models/connections/model-connections-group.tsx',
                'Add connection'
            ),
        ],
    },
    {
        area: 'connections-and-computers',
        task: 'Add an image generation provider key',
        path: ['Settings', 'Models', 'Image generation'],
        who: 'owner',
        anchors: [
            settingsEntry(),
            settingsSection('models'),
            label(
                'features/settings/image-generation/image-generation-group.tsx',
                'Image generation'
            ),
        ],
    },
    {
        area: 'connections-and-computers',
        task: 'Choose the model each Worker place uses',
        path: ['Settings', 'Models', 'Workers'],
        who: 'owner-or-admin',
        note: 'Every member can read it.',
        anchors: [
            settingsEntry(),
            settingsSection('models'),
            label('features/settings/models/cloud-agent-model-group.tsx', 'Workers'),
        ],
    },
];
