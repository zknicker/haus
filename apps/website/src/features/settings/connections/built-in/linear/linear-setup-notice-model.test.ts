import { describe, expect, test } from 'bun:test';
import { linearSetupNotice } from './linear-setup-notice-model.ts';

describe('linearSetupNotice', () => {
    test('celebrates every binding kind the callback reports', () => {
        for (const outcome of [
            'workspace_connected',
            'workspace_reconnected',
            'identity_installed',
        ]) {
            expect(linearSetupNotice(outcome).status).toBe('success');
        }
        expect(linearSetupNotice('identity_installed').title).toBe('Linear identity installed');
    });

    test('names each refusal the install and identity install can return', () => {
        expect(linearSetupNotice('linear_workspace_already_bound')).toMatchObject({
            status: 'danger',
            title: 'Already connected',
        });
        expect(linearSetupNotice('linear_admin_required').description).toContain('Owner or Admin');
        expect(linearSetupNotice('linear_identity_mismatch').title).toBe('Different app');
        expect(linearSetupNotice('linear_identity_not_found').title).toBe('Identity not found');
        expect(linearSetupNotice('linear_unavailable').title).toBe('Linear unavailable');
    });

    test('treats a denied authorization as a cancel, not a failure', () => {
        expect(linearSetupNotice('linear_denied')).toMatchObject({
            status: 'accent',
            title: 'Install canceled',
        });
    });

    test('falls back for an outcome it does not know', () => {
        expect(linearSetupNotice('something_new')).toMatchObject({
            status: 'danger',
            title: 'Not connected',
        });
    });
});
