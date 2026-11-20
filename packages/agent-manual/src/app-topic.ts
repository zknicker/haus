import type { AppArea, AppPlace, AppPlaceRole } from './app-place-model.ts';
import { appPlaces } from './app-places.ts';
import type { ManualNavigationTopic } from './types.ts';

const areaHeadings: Record<AppArea, string> = {
    you: 'Your account',
    'people-and-agents': 'People and Agents',
    channels: 'Channels',
    'agent-setup': "An Agent's setup",
    'connections-and-computers': 'Connections and Computers',
    server: 'This Server',
};

const roleLabels: Record<AppPlaceRole, string | null> = {
    anyone: null,
    'owner-or-admin': 'Owner or Admin',
    owner: 'Server Owner',
};

const commonQuestions = `## Common questions

- What a Computer gives an Agent: each Agent runs on the one Computer it is assigned to and works with the files and tools that Computer reaches, plus the skills and connections it was granted. It cannot reach another Computer or a service it has no connection to. Show this on a folder or file the person names rather than in the abstract.
- What Agents can see: chat history lives on the Server. An Agent reads history only through the chats it belongs to, and files only through its Computer and granted connections. Haus has no private channels, so anything posted in one channel can be shared in another; a DM stays between its person and Agent. Name the concrete boundary and never promise perfect secrecy.
- An Agent that does not respond: it may be busy, its Computer may be offline, or its runtime may have failed to start. Ask the person to mention it, then check Captain profile → Runs on, which shows its Computer's health and its last error with a retry when one applies. Do not blame the person or guess at a local process.`;

export const appTopic: ManualNavigationTopic = {
    id: 'app',
    kind: 'overview',
    title: 'Where things are in Haus App',
    summary:
        'Find where a setting or control lives in the App, who can use it, and what has no App screen, to guide a person who asks "where is" or "how do I change" something.',
    related: ['index', 'secrets', 'agent', 'reminder', 'trigger'],
    body: `# Where things are in Haus App

When someone asks where to find or change something, give the path below exactly as written. Each step is a label they will see, and a step in parentheses is their own choice, such as which device.

- Name only places this topic lists. If it is not here, say you are not sure where it lives rather than guessing a path.
- Say who can do it. When the asker lacks that role, name who can: an Owner or Admin, or the Server Owner.
- These paths are for the desktop and web App. Haus also has an iPhone app on the same Server, laid out differently and without some of these screens; say so rather than giving a path from here. There is no Android app.
- Some things have no App screen. People set a reminder by asking an Agent, so offer to set it yourself with \`haus reminder\`. No App setting turns on avatar generation.

${renderPlaces()}

${commonQuestions}`,
};

export function renderAppPlace(place: AppPlace): string {
    const role = roleLabels[place.who];
    const where = `${place.task}: ${place.path.join(' → ')}${role ? ` (${role})` : ''}`;
    const line = where.endsWith('…') ? where : `${where}.`;
    return place.note ? `${line} ${place.note}` : line;
}

function renderPlaces(): string {
    return (Object.keys(areaHeadings) as AppArea[])
        .map((area) => {
            const lines = appPlaces
                .filter((place) => place.area === area)
                .map((place) => `- ${renderAppPlace(place)}`);
            return `## ${areaHeadings[area]}\n\n${lines.join('\n')}`;
        })
        .join('\n\n');
}
