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

export const appTopic: ManualNavigationTopic = {
    id: 'app',
    kind: 'overview',
    title: 'Where things are in Haus App',
    summary:
        'Find where a setting or control lives in the App, who can use it, and what has no App screen, to guide a person who asks "where is" or "how do I change" something.',
    related: ['index', 'secrets', 'agent', 'reminder', 'trigger'],
    body: `# Where things are in Haus App

When someone asks where to find or change something, give the path below exactly as written. Each step is a label they will see, and a step in parentheses is their own choice, such as which Computer.

- Name only places this topic lists. If it is not here, say you are not sure where it lives rather than guessing a path.
- Say who can do it. When the asker lacks that role, name who can: an Owner or Admin, or the Server Owner.
- These paths are for the desktop and web App. The iPhone app is laid out differently; say so rather than giving a path from here.
- Some things have no App screen. People set a reminder by asking an Agent, so offer to set it yourself with \`haus reminder\`. No App setting turns on avatar generation.

${renderPlaces()}`,
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
