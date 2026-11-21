import { claimsCreatedBy, fireStatusCheck } from '../fire-claims.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelReminder } from '../task-intake-events.mjs';
import { expectSettled, postsAcross } from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Reminder check that finds nothing new leaves no trace: no post in the anchor channel, no claim anywhere, and no durable output from the fire turn.',
    name: 'reminder-fire-quiet-no-claim',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const fired = await fireStatusCheck(kit, {
            boardLine: `build ${marker('GREEN')} is green, nothing waiting.`,
            settleTurn,
            worker,
        });
        try {
            expectSettled(expect, fired.turn, 'fire turn');
            expect(fired.fireId, 'the reminder fired').toBeTruthy();

            log('checking gates');
            expect(
                (await claimsCreatedBy(kit, worker.id)).length - fired.claimsBefore,
                'claims the Agent created on the fire'
            ).toBe(0);
            expect(
                await postsAcross(kit, fired.channel.id, worker.id, fired.head),
                'Agent posts in the anchor channel'
            ).toHaveLength(0);
            expect(fired.turn.outputProduced, 'fire turn produced durable output').toBe(false);
        } finally {
            await cancelReminder(kit, fired.reminder, worker.id);
        }
    }),
});
