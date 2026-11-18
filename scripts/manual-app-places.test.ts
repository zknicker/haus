import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { agentSectionLabels } from '../apps/website/src/features/members/agent-profile/agent-sections.ts';
import { settingsNavItems } from '../apps/website/src/features/settings/layout/navigation.ts';
import { serverPageRoutes } from '../apps/website/src/routes/app/server-page-routes.tsx';
import type { AppPlace, AppPlaceAnchor } from '../packages/agent-manual/src/app-place-model.ts';
import { appPlaces } from '../packages/agent-manual/src/app-places.ts';
import { renderAppPlace } from '../packages/agent-manual/src/app-topic.ts';
import { getManualTopic, manualTopics } from '../packages/agent-manual/src/index.ts';
import { coveCoordinationGuidance } from '../packages/agent-workspace/src/cove-coordination-guidance.ts';
import { coveOnboardingFaq } from '../packages/agent-workspace/src/cove-factory-faq.ts';
import { coveOnboardingPlaybook } from '../packages/agent-workspace/src/cove-factory-guidance.ts';
import { isPlaceholder, unmappedAppPaths } from './app-place-paths.ts';

const repoRoot = new URL('../', import.meta.url);
const webRoutes = new Set(flattenRoutes(serverPageRoutes({ desktop: false })));
const desktopRoutes = new Set(flattenRoutes(serverPageRoutes({ desktop: true })));

test('every App place anchor resolves against App source', () => {
    for (const place of appPlaces) {
        for (const anchor of place.anchors) {
            const where = `${place.task}: ${JSON.stringify(anchor)}`;
            if (anchor.kind === 'page') {
                expect(webRoutes.has(anchor.path), `${where} on the web`).toBe(true);
                expect(desktopRoutes.has(anchor.path), `${where} on desktop`).toBe(true);
            } else if (anchor.kind === 'label') {
                const file = new URL(anchor.file, repoRoot);
                expect(existsSync(file), where).toBe(true);
                const source = readFileSync(file, 'utf8').replaceAll('&amp;', '&');
                expect(source.includes(anchor.text), where).toBe(true);
            } else {
                expect(anchorLabel(anchor), where).toBe(segmentAfter(place, anchorRoot(anchor)));
            }
        }
    }
});

test('every UI label in a path has an anchor, and every anchor names a segment', () => {
    for (const place of appPlaces) {
        const covered = new Set(place.anchors.flatMap((anchor) => anchorLabel(anchor) ?? []));
        for (const segment of place.path.filter((entry) => !isPlaceholder(entry))) {
            expect(covered.has(segment), `${place.task}: "${segment}"`).toBe(true);
        }
        for (const name of covered) {
            expect(place.path, `${place.task}: anchor "${name}"`).toContain(name);
        }
    }
});

test('Manual topics and Cove guidance write only App paths the map knows', () => {
    const texts = [
        ...manualTopics.map((topic) => [topic.id, topic.body] as const),
        ['cove faq', coveOnboardingFaq] as const,
        ['cove playbook', coveOnboardingPlaybook] as const,
        ['cove coordination', coveCoordinationGuidance] as const,
    ];
    const unmapped = texts.flatMap(([source, text]) =>
        unmappedAppPaths(text).map((chain) => `${source}: ${chain.join(' → ')}`)
    );
    expect(unmapped).toEqual([]);
});

test('a hand-written App path the map does not know is reported', () => {
    expect(
        unmappedAppPaths('Ask the Server Owner to open Computer settings → Secrets, then retry.')
    ).toEqual([['Ask the Server Owner to open Computer settings', 'Secrets']]);
    expect(unmappedAppPaths('Then open Settings → Computers → (your Computer) → Secrets.')).toEqual(
        []
    );
    expect(unmappedAppPaths('Status moves `todo` → `in_progress` → `done`.')).toEqual([]);
});

test('the app topic renders each place as one line with its role and caveat', () => {
    const body = getManualTopic('app')?.body ?? '';
    expect(body).toContain('- Change your timezone: Settings → Profile → Timezone.\n');
    expect(body).toContain(
        '- Connect a 1Password vault to a Computer: Settings → Computers → (your Computer) → Secrets → Connect 1Password (Server Owner). Desktop App only.\n'
    );
    expect(body).toContain('## Channels\n\n- Create a channel: Channels → New channel.');
    expect(renderAppPlace(placeFor('Rename a channel or change its description'))).toBe(
        'Rename a channel or change its description: Channel actions → Name & description…'
    );
    expect(body.length).toBeLessThan(3800);
});

function anchorRoot(anchor: AppPlaceAnchor): string {
    return anchor.kind === 'agent-section' ? 'Agent profile' : 'Settings';
}

function anchorLabel(anchor: AppPlaceAnchor): string | undefined {
    switch (anchor.kind) {
        case 'settings-section':
            return settingsNavItems.find((item) => item.id === anchor.id)?.label;
        case 'agent-section':
            return Object.entries(agentSectionLabels).find(([id]) => id === anchor.id)?.[1];
        case 'label':
            return anchor.text;
        case 'page':
            return undefined;
    }
}

function segmentAfter(place: AppPlace, root: string): string | undefined {
    const index = place.path.indexOf(root);
    return index === -1 ? undefined : place.path[index + 1];
}

function placeFor(task: string): AppPlace {
    const place = appPlaces.find((entry) => entry.task === task);
    if (!place) {
        throw new Error(`No App place for ${task}`);
    }
    return place;
}

interface RouteNode {
    children?: RouteNode[];
    path?: string;
}

function flattenRoutes(routes: readonly RouteNode[], parent = ''): string[] {
    return routes.flatMap((route) => {
        const path = route.path ? [parent, route.path].filter(Boolean).join('/') : parent;
        return [path, ...flattenRoutes(route.children ?? [], path)];
    });
}
