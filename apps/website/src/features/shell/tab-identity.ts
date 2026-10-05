import type { Agent, Chat } from '@haus/api';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { type AppSection, resolveActiveSection } from '../../routes/app/server-route-state.ts';

/**
 * A desktop tab's mark and title, from its current location (ADR 0039). A tab
 * borrows the identity the sidebar already shows — a channel's icon and color,
 * a DM's or Agent's avatar, a section glyph — and a web page's favicon.
 */
export interface TabIdentity {
    /** Empty while the record behind the page loads; the tab keeps its slot. */
    label: string;
    mark: TabMark;
    /** A second tooltip line naming where the page sits (a URL, `#general › thread`). */
    place: string | null;
}

export type TabMark =
    | { kind: 'avatar'; name: string; src: string | null }
    | { kind: 'channel'; color: string | null; icon: string | null }
    | { kind: 'favicon'; loading: boolean; url: string | null }
    | { kind: 'glyph'; glyph: 'artifact' | 'files' | 'newTab' | AppSection }
    | { kind: 'none' };

/** What a location shows, before any record is looked up. */
export type TabPage =
    | { kind: 'agent'; agentId: string }
    | { kind: 'artifact'; title: string | null }
    | { kind: 'browser'; title: string; url: string; viewId: string }
    | { kind: 'chat'; chatId: string }
    | { kind: 'dm'; agentId: string }
    | { kind: 'files'; chatId: string }
    | { kind: 'newTab' }
    | { kind: 'section'; section: AppSection }
    | { kind: 'thread'; anchorMessageId: string; chatId: string };

/**
 * Parses a tab location. App paths are `/s/<slug>/<section>/<id>…`; desktop
 * Thread, Files, and artifact pages are `threads/<chatId>/<anchorId>`,
 * `files/<chatId>`, and `artifacts/<key>?title=…`.
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
    switch (section) {
        case 'chats':
            return first ? { kind: 'chat', chatId: first } : sectionPage(pathname, slug);
        case 'dm':
            return first ? { kind: 'dm', agentId: first } : sectionPage(pathname, slug);
        case 'agents':
            return first ? { kind: 'agent', agentId: first } : sectionPage(pathname, slug);
        case 'threads':
            return first && second
                ? { kind: 'thread', anchorMessageId: second, chatId: first }
                : sectionPage(pathname, slug);
        case 'files':
            return first ? { kind: 'files', chatId: first } : sectionPage(pathname, slug);
        case 'artifacts':
            return { kind: 'artifact', title: new URLSearchParams(search).get('title') };
        default:
            return sectionPage(pathname, slug);
    }
}

/** The records a page's identity reads; each is null until it loads. */
export interface TabIdentityRecords {
    agents: readonly Pick<Agent, 'avatarUrl' | 'displayName' | 'id'>[] | null;
    /** The live web view's state, when Electron has reported it. */
    browserTab: Pick<BrowserTab, 'faviconUrl' | 'loading' | 'title' | 'url'> | null;
    chats: readonly TabChat[] | null;
    /** A Thread page's root message text. */
    threadExcerpt: string | null;
}

export type TabChat = Pick<
    Chat,
    'color' | 'icon' | 'id' | 'kind' | 'name' | 'peerAgentDisplayName' | 'peerAgentId'
>;

export function resolveTabIdentity(page: TabPage, records: TabIdentityRecords): TabIdentity {
    switch (page.kind) {
        case 'browser': {
            const live = records.browserTab;
            const url = live?.url || page.url;
            return {
                label: live?.title || page.title || url,
                mark: {
                    kind: 'favicon',
                    loading: live?.loading ?? false,
                    url: live?.faviconUrl ?? null,
                },
                place: url,
            };
        }
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
        case 'thread':
        case 'files':
            return chatChildIdentity(page, records);
        case 'artifact':
            return {
                label: page.title ?? 'Artifact',
                mark: { kind: 'glyph', glyph: 'artifact' },
                place: null,
            };
        case 'newTab':
            return { label: 'New tab', mark: { kind: 'glyph', glyph: 'newTab' }, place: null };
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

const pending: TabIdentity = { label: '', mark: { kind: 'none' }, place: null };

const sectionLabels: Record<AppSection, string> = {
    agent: 'Agent',
    chat: 'Chat',
    inbox: 'Inbox',
    search: 'Search',
    settings: 'Settings',
    tasks: 'Tasks',
};

function chatIdentity(chat: TabChat, records: TabIdentityRecords): TabIdentity {
    if (chat.kind === 'channel') {
        return {
            label: chat.name ?? 'Channel',
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

/** Thread and Files pages wear their chat's mark and name it as context. */
function chatChildIdentity(
    page: Extract<TabPage, { kind: 'files' | 'thread' }>,
    records: TabIdentityRecords
): TabIdentity {
    const chat = records.chats?.find((item) => item.id === page.chatId) ?? null;
    const thread = page.kind === 'thread';
    const fallback: TabMark = thread ? { kind: 'none' } : { kind: 'glyph', glyph: 'files' };
    return {
        label: thread ? (records.threadExcerpt ?? '') : 'Files',
        mark: chat ? chatIdentity(chat, records).mark : fallback,
        place: chat ? `${chatPlace(chat)} › ${thread ? 'thread' : 'files'}` : null,
    };
}

function findAgent(records: TabIdentityRecords, agentId: string) {
    return records.agents?.find((agent) => agent.id === agentId) ?? null;
}

function avatar(agent: Pick<Agent, 'avatarUrl' | 'displayName'>): TabMark {
    return { kind: 'avatar', name: agent.displayName, src: agent.avatarUrl };
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
