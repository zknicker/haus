import { expect, test } from 'bun:test';
import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { createDraft, draftError, hasDraftChanges, toSaveInput } from './browser-settings-model.ts';

const connection = { applicationPath: '/Applications/Google Chrome.app', userDataDir: '/shared' };
const settings: AgentRuntimeBrowserSettings = {
    connection,
    configured: true,
    enabled: true,
    browsers: [],
    status: null,
    updatedAt: null,
};

test('an unavailable saved browser can be disconnected without resubmitting its selection', () => {
    const draft = { ...createDraft(settings), enabled: false };
    expect(draftError(settings, draft)).toBeNull();
    expect(toSaveInput(settings, draft)).toEqual({ enabled: false });
    expect(hasDraftChanges(settings, draft)).toBe(true);
    expect(draftError(settings, { ...draft, enabled: true })).toContain('current owner');
});

test('first setup selects an available browser and cannot connect without one', () => {
    const fresh = { ...settings, connection: null, configured: false, enabled: false };
    expect(draftError(fresh, createDraft(fresh))).toContain('Select a running browser');
    const discovered = {
        ...fresh,
        browsers: [
            {
                ...connection,
                name: 'shared',
                version: '153',
                available: true,
            },
        ],
    };
    const draft = createDraft(discovered);
    expect(draft.connection).toEqual(connection);
    expect(draftError(discovered, draft)).toBeNull();
    expect(toSaveInput(discovered, draft)).toEqual({ enabled: true, connection });
});
