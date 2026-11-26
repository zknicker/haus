import { type Agent, type Chat, isTaskShortId } from '@haus/api';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { parseArtifactPageKey } from '../../routes/app/desktop-page-paths.ts';
import { type AppSection, resolveActiveSection } from '../../routes/app/server-route-state.ts';
import { settingsPageLabel } from '../settings/layout/navigation.ts';

/**
 * A desktop tab's mark and title, from its current location (ADR 0039). A tab
 * borrows the identity the sidebar already shows — a channel's icon and color,
 * a DM's or Agent's avatar, a section glyph — and a web page's favicon.
 */
export interface TabIdentity {
    /** Empty while the record behind the page loads; the tab keeps its slot. */
    label: string;
    mark: TabMark;
    place: string | null;
}

export type TabMark =
    | { kind: 'avatar'; name: string; src: string | null }
    | { kind: 'channel'; color: string | null; icon: string | null }
    | { kind: 'favicon'; loading: boolean; url: string | null }
    | { kind: 'glyph'; glyph: 'artifact' | 'files' | 'home' | 'newTab' | 'task' | AppSection }
    | { kind: 'none' };

/** What a location shows, before any record is looked up. */
export type TabPage =
    | { kind: 'agent'; agentId: string }
    | {
          kind: 'artifact';
          /** A shared library file (`artifacts/<id>`); null for a workspace target key. */
          shared: { artifactId: string; revisionId: string | null } | null;
          title: string | null;
      }
    | { kind: 'browser'; title: string; url: string; viewId: string }
    | { kind: 'chat'; chatId: string }
    | { kind: 'dm'; agentId: string }
    | { kind: 'files'; chatId: string }
    | { kind: 'home' }
    | { kind: 'newTab' }
    | { kind: 'section'; section: AppSection }
    | { kind: 'settings'; page: string }
    | { kind: 'task'; shortId: string }
    | { kind: 'worker'; workerId: string };

/**
 * Parses a tab location. App paths are `/s/<slug>/<section>/<id>…`; desktop
 * Attachments and artifact pages are `files/<chatId>` and
 * `artifacts/<key>?title=…`; a shared library file is
 * `artifacts/<artifactId>`, titled from its record. A Task is `tasks/<shortId>`.
 */
export function parseTabPage(location: TabLocation): TabPage {
    if (location.kind === 'browser') {
        return {
            kind: 'browser',
            title: location.title,
            url: location.url,
            viewId: location.viewId,
        };
    }
    if (location.kind === 'newTab') {
        return location;
    }
    const [pathname = '', search = ''] = location.path.split('?');
    const segments = pathname.split('/').map(decodeSegment);
    const slug = segments[2] ?? '';
    const [section = '', first = '', second = ''] = segments.slice(3);
    if ((section === '' && segments.length <= 4) || section === 'inbox') {
        return { kind: 'home' };
    }
    const idPage = first && Object.hasOwn(idPages, section) ? idPages[section as IdSection] : null;
    if (idPage && first) {
        return idPage(first);
    }
    switch (section) {
        case 'artifacts':
            return first
                ? artifactPage(first, new URLSearchParams(search))
                : sectionPage(pathname, slug);
        case 'tasks':
            return tasksPage(first, second) ?? sectionPage(pathname, slug);
        case 'settings':
            return { kind: 'settings', page: first };
        default:
            return sectionPage(pathname, slug);
    }
}

const idPages = {
    agents: (agentId: string) => ({ agentId, kind: 'agent' }),
    chats: (chatId: string) => ({ chatId, kind: 'chat' }),
    dm: (agentId: string) => ({ agentId, kind: 'dm' }),
    files: (chatId: string) => ({ chatId, kind: 'files' }),
    workers: (workerId: string) => ({ kind: 'worker', workerId }),
} as const satisfies Record<string, (id: string) => TabPage>;

type IdSection = keyof typeof idPages;

/** The records a page's identity reads; each is null until it loads. */
export interface TabIdentityRecords {
    agents: readonly Pick<Agent, 'avatarUrl' | 'displayName' | 'id'>[] | null;
    /** A shared artifact page's title, once its record loads. */
    artifactTitle: string | null;
    /** A Worker page's title, once its record loads. */
    workerTitle?: string | null;
    /** The live web view's state, when Electron has reported it. */
    browserTab: Pick<BrowserTab, 'faviconUrl' | 'loading' | 'title' | 'url'> | null;
    chats: readonly TabChat[] | null;
}

export type TabChat = Pick<
    Chat,
    'color' | 'icon' | 'id' | 'kind' | 'name' | 'peerAgentDisplayName' | 'peerAgentId'
>;

export function resolveTabIdentity(page: TabPage, records: TabIdentityRecords): TabIdentity {
    switch (page.kind) {
        case 'browser':
            return browserIdentity(page, records);
        case 'chat': {
            const chat = records.chats?.find((item) => item.id === page.chatId) ?? null;
            return chat ? chatIdentity(chat, records) : pending;
        }
        case 'dm': {
            const agent = findAgent(records, page.agentId);
            return agent ? { label: agent.displayName, mark: avatar(agent), place: 'DM' } : pending;
        }
        case 'agent': {
            const agent = findAgent(records, page.agentId);
            return agent ? { label: agent.displayName, mark: avatar(agent), place: null } : pending;
        }
        case 'files':
            return chatChildIdentity(page, records);
        case 'artifact':
            return {
                // A shared file names itself once its record loads; until then the slot stays empty.
                label: page.title ?? records.artifactTitle ?? (page.shared ? '' : 'Workspace'),
                mark: { kind: 'glyph', glyph: 'artifact' },
                place: null,
            };
        case 'settings':
            return {
                label: settingsPageLabel(page.page) ?? sectionLabels.settings,
                mark: { kind: 'glyph', glyph: 'settings' },
                place: null,
            };
        case 'task':
            return { label: page.shortId, mark: { kind: 'glyph', glyph: 'task' }, place: null };
        case 'worker':
            return {
                label: records.workerTitle ?? '',
                mark: { kind: 'glyph', glyph: 'task' },
                place: null,
            };
        default:
            return glyphIdentity(page);
    }
}

function glyphIdentity(
    page: Extract<TabPage, { kind: 'home' | 'newTab' | 'section' }>
): TabIdentity {
    switch (page.kind) {
        case 'home':
            return { label: 'Home', mark: { kind: 'glyph', glyph: 'home' }, place: null };
        case 'newTab':
            return fixedIdentities.newTab;
        case 'section':
            return {
                label: sectionLabels[page.section],
                mark: { kind: 'glyph', glyph: page.section },
                place: null,
            };
    }
}

/** The chat as context: a channel by name; a DM as "DM", its Agent already shown by the mark. */
export function chatPlace(chat: Pick<Chat, 'kind' | 'name'>): string {
    return chat.kind === 'channel' ? `#${chat.name ?? 'channel'}` : 'DM';
}

function browserIdentity(page: Extract<TabPage, { kind: 'browser' }>, records: TabIdentityRecords) {
    const live = records.browserTab;
    const url = live?.url || page.url;
    return {
        label: live?.title || page.title || url,
        mark: { kind: 'favicon', loading: live?.loading ?? false, url: live?.faviconUrl ?? null },
        place: url,
    } satisfies TabIdentity;
}

const fixedIdentities = {
    newTab: { label: 'New tab', mark: { kind: 'glyph', glyph: 'newTab' }, place: null },
} as const satisfies Record<'newTab', TabIdentity>;

const pending: TabIdentity = { label: '', mark: { kind: 'none' }, place: null };

const sectionLabels: Record<AppSection, string> = {
    artifacts: 'Drive',
    activity: 'Activity',
    agent: 'Captain',
    chat: 'Chat',
    search: 'Search',
    settings: 'Settings',
    tasks: 'Tasks',
};

function chatIdentity(chat: TabChat, records: TabIdentityRecords): TabIdentity {
    if (chat.kind === 'channel') {
        return {
            label: chat.name ?? 'Project',
            mark: { kind: 'channel', color: chat.color, icon: chat.icon },
            place: null,
        };
    }
    const agent = chat.peerAgentId ? findAgent(records, chat.peerAgentId) : null;
    const label = agent?.displayName ?? chat.peerAgentDisplayName ?? chat.name ?? 'DM';
    return {
        label,
        mark: { kind: 'avatar', name: label, src: agent?.avatarUrl ?? null },
        place: 'DM',
    };
}

function chatChildIdentity(
    page: Extract<TabPage, { kind: 'files' }>,
    records: TabIdentityRecords
): TabIdentity {
    const chat = records.chats?.find((item) => item.id === page.chatId) ?? null;
    return {
        label: 'Attachments',
        mark: chat ? chatIdentity(chat, records).mark : { kind: 'glyph', glyph: 'files' },
        place: chat ? `${chatPlace(chat)} › attachments` : null,
    };
}

function findAgent(records: TabIdentityRecords, agentId: string) {
    return records.agents?.find((agent) => agent.id === agentId) ?? null;
}

function avatar(agent: Pick<Agent, 'avatarUrl' | 'displayName'>): TabMark {
    return { kind: 'avatar', name: agent.displayName, src: agent.avatarUrl };
}

function artifactPage(key: string, search: URLSearchParams): TabPage {
    return {
        kind: 'artifact',
        shared: parseArtifactPageKey(key)
            ? null
            : { artifactId: key, revisionId: search.get('revision') },
        title: search.get('title'),
    };
}

/** Null for `/tasks` itself, and for an address that names no Task short id. */
function tasksPage(shortId: string, rest: string): TabPage | null {
    return shortId && !rest && isTaskShortId(shortId) ? { kind: 'task', shortId } : null;
}

function sectionPage(pathname: string, slug: string): TabPage {
    return { kind: 'section', section: resolveActiveSection(pathname, slug) };
}

/** A malformed escape (`%E0`) keeps its raw text rather than throwing mid-render. */
function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
