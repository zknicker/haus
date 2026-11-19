import { expect, test } from 'bun:test';
import {
    coveGuidanceConflictNotice,
    coveGuidanceRefreshNotice,
    coveTurnGuidanceNotice,
} from './cove-guidance-refresh.ts';

test('every Cove notice is bounded and preserves quiet reporting and destination consent', () => {
    expect(coveTurnGuidanceNotice('ordinary', 'cove')).toBeNull();
    for (const notice of [
        coveTurnGuidanceNotice('cove', 'cove')!,
        coveGuidanceRefreshNotice('cove'),
        coveGuidanceConflictNotice(
            ['notes/onboarding_playbook.md', 'notes/onboarding_knowledge_faq.md'],
            'cove'
        ),
    ]) {
        expect(notice.length).toBeLessThanOrEqual(2300);
        expect(notice).toContain('need no acknowledgment or completion post');
        expect(notice).toContain('explicit scope, cadence and destination agreement');
        expect(notice).toContain('Calendar repeats require --timezone');
        expect(notice).toContain('Never wake or schedule to advertise');
        expect(notice).toContain('Reconcile uncertain delivery from canonical history');
        expect(notice).toContain('rewritten in place; history stays in chats');
        expect(notice).not.toContain('save the message id');
    }
    expect(coveGuidanceConflictNotice([], 'cove')).toContain(
        'before claiming a capability is unavailable'
    );
});

test('Cove notices name the onboarding notes by their Drive path from the working directory', () => {
    expect(coveTurnGuidanceNotice('cove', 'cove')).toContain(
        'Read onboarding_playbook.md and coordination.md in drive/agents/cove/notes/ if present'
    );
    expect(coveGuidanceRefreshNotice('cove')).toContain(
        're-read onboarding_playbook.md and onboarding_knowledge_faq.md in drive/agents/cove/notes/;'
    );
});
