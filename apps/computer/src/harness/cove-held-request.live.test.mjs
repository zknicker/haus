import { expect, test } from 'bun:test';

const live = process.env.HAUS_RUN_COVE_WEEKLY_TEST === '1';
const fixture = live
    ? (await import('../../../server/test/agent-creation-fixture.ts')).agentCreationFixture()
    : null;
(live ? test : test.skip)(
    'newer owner resolution allows Cove to leave a held answer unsent',
    async () => {
        const { withWeeklyCove } = await import('./cove-weekly-live-fixture.mjs');
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                await driver.seedState('declined');
                const turn = await driver.ask(
                    'superseded-answer',
                    'Please verify the latest #product deliverable status and give one concise answer.',
                    {
                        newsBeforeSend:
                            'That status question is now resolved. No answer or acknowledgment is needed.',
                    }
                );
                expect(turn.actions.some((action) => action.result?.state === 'held')).toBe(true);
                expect(turn.messages).toHaveLength(0);
                expect(turn.actions.some((action) => action.body?.sendDraft)).toBe(false);
            },
            { reportSuffix: 'superseded-answer' }
        );
    },
    600_000
);
