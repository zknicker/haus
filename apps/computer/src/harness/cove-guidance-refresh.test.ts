import { expect, test } from 'bun:test';
import {
    coveGuidanceConflictNotice,
    coveGuidanceRefreshNotice,
    coveTurnGuidanceNotice,
} from './cove-guidance-refresh.ts';

test('every Cove notice is bounded and preserves quiet reporting and destination consent', () => {
    expect(coveTurnGuidanceNotice('ordinary')).toBeNull();
    for (const notice of [
        coveTurnGuidanceNotice('cove')!,
        coveGuidanceRefreshNotice,
        coveGuidanceConflictNotice([
            'notes/onboarding_playbook.md',
            'notes/onboarding_knowledge_faq.md',
        ]),
    ]) {
        expect(notice.length).toBeLessThanOrEqual(2300);
        expect(notice).toContain('need no acknowledgment or completion post');
        expect(notice).toContain('explicit scope, cadence and destination agreement');
        expect(notice).toContain('Calendar repeats require --timezone');
        expect(notice).toContain('Never wake or schedule to advertise');
        expect(notice).toContain('Reconcile uncertain delivery from canonical history');
    }
    expect(coveGuidanceConflictNotice([])).toContain('before claiming a capability is unavailable');
});
