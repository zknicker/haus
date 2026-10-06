import { signInAsClerkHuman } from '../support/clerk-session.ts';
import { attachComputer, createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

test('an Owner sees an Agent reminder on the Agent profile', async ({
    page,
    browser,
}, testInfo) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Agent Reminders',
        slug: 'reminders',
    });
    const computer = await attachComputer(client, {
        credential: 'reminder-test-credential-1234567890',
        slug: 'reminders',
    });
    await openChannel(page, 'all');

    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    if (!chatId) {
        throw new Error('The reminder fixture did not resolve #all.');
    }
    seedReminderState({
        chatId,
        computerId: computer.computerId,
        databaseUrl: session.databaseUrl,
        serverId: server.id,
    });

    await page.goto('/s/reminders/members');
    await page.getByRole('link', { name: 'Cove' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cove' })).toBeVisible();
    await page.getByRole('button', { name: /^Automations/u }).click();
    await expect(page.getByText('Local watchdog', { exact: true })).toBeVisible();
    await expect(page.getByText(/Daily at 9:00 AM · New York time/u)).toBeVisible();
    await expect(page.getByText(/your time/u)).toHaveCount(0);
    await page.screenshot({
        path: testInfo.outputPath('reminders-new-york.png'),
        animations: 'disabled',
    });

    const context = await browser.newContext({
        timezoneId: 'Asia/Tokyo',
        locale: 'en-US',
        viewport: { width: 600, height: 900 },
    });
    try {
        const other = await context.newPage();
        await signInAsClerkHuman(other);
        await other.goto(page.url());
        const schedule = other.getByText(/Daily at 9:00 AM · New York time/u);
        await expect(schedule).toContainText('10:00 PM your time');
        await expect(schedule).toHaveCSS('white-space', 'normal');
        expect(
            await schedule.evaluate((element) => element.scrollWidth <= element.clientWidth)
        ).toBe(true);
        await other.screenshot({
            path: testInfo.outputPath('reminders-tokyo-narrow.png'),
            animations: 'disabled',
        });
    } finally {
        await context.close();
    }
    // Reminders and Triggers share the Automations page, each as its own section.
    await expect(page.getByText(/No triggers yet\./u)).toBeVisible();

    // The section is the schedule: nothing that has already happened is listed
    // beside the wakes still coming.
    await expect(page.getByText('Deploy check', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Weekly digest', { exact: true })).toHaveCount(0);

    // Reminders and Triggers each carry their own history, so name the one.
    await page.getByRole('button', { name: 'View reminder history' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'History' })).toBeVisible();

    // History is a log of executions, so the recurring watchdog appears once
    // per fire and the canceled reminder that never fired appears not at all.
    // Newest fire first, and each row carries its reminder's cadence at read
    // time — "Once" for the one-shot.
    const rows = drawer.getByRole('row');
    await expect(rows).toHaveCount(5);
    await expect(drawer.getByRole('columnheader', { name: 'Executed (your time)' })).toBeVisible();
    await page.screenshot({
        path: testInfo.outputPath('reminder-history.png'),
        animations: 'disabled',
    });
    await expect(rows.nth(1)).toContainText('Local watchdog');
    await expect(rows.nth(1)).toContainText('Daily');
    await expect(rows.nth(1)).toContainText('Exit 0');
    await expect(rows.nth(2)).toContainText('Standup nudge');
    await expect(rows.nth(2)).toContainText('Every Monday');
    await expect(rows.nth(2)).toContainText('No answer');
    await expect(rows.nth(3)).toContainText('Deploy check');
    await expect(rows.nth(3)).toContainText('Once');
    await expect(rows.nth(4)).toContainText('Local watchdog');
    await expect(rows.nth(4)).toContainText('Timed out');
    await expect(drawer.getByText('Weekly digest')).toHaveCount(0);

    // The one answered fire is reachable; a scripted fire reports its script
    // instead, so only the scriptless unanswered row names the silence.
    const answerLink = drawer.getByRole('link', { name: 'Open' });
    await expect(answerLink).toHaveCount(1);
    await expect(answerLink).toHaveAttribute('href', `/s/reminders/chats/${chatId}`);
    await expect(drawer.getByText('No answer')).toHaveCount(1);
    await expect(drawer.getByText('History is kept for 30 days.')).toBeVisible();

    runPsql(
        session.databaseUrl,
        `update server_memberships set role = 'member'
         where server_id = '${server.id}'
           and user_id = (
             select id from users where clerk_user_id = 'user_e2e_human'
           )`
    );
    await page.reload();
    await expect(page.getByRole('link', { name: 'Automations', exact: true })).toBeVisible();
    await expect(page.getByText(/Nothing scheduled\./u)).toBeVisible();
    await expect(page.getByText('Local watchdog', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /view .* history/iu })).toHaveCount(0);
});

function seedReminderState(input: {
    chatId: string;
    computerId: string;
    databaseUrl: string;
    serverId: string;
}) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into agents (
           id, server_id, computer_id, handle, display_name, home_timezone,
           desired_runtime_id, desired_model_id
         ) values (
           'agt_e2e_reminder', '${input.serverId}', '${input.computerId}', 'reminder-cove', 'Cove',
           'America/New_York', 'codex', 'gpt-5.6-sol'
         );
         insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${input.serverId}', '${input.chatId}', 'agt_e2e_reminder');
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_user_id, content, nonce, created_at
         ) values (
           'msg_e2e_reminder_anchor', '${input.serverId}', '${input.chatId}', 1,
           (
             select user_id from server_memberships
             where server_id = '${input.serverId}' and role = 'owner'
           ),
           'Watch the deploy for me.', 'e2e-reminder-anchor',
           '2026-07-26T12:00:00.000Z'
         );
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_agent_id, content, nonce, created_at
         ) values (
           'msg_e2e_reminder_answer', '${input.serverId}', '${input.chatId}', 2,
           'agt_e2e_reminder', 'The deploy looks clean.', 'e2e-reminder-answer',
           now() - interval '2 days'
         );
         update chats set last_message_sequence = 2
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         insert into reminders (
           id, server_id, owner_agent_id, title, anchor_chat_id, anchor_message_id,
           fire_at, repeat, timezone, script, status, version, created_at, updated_at
         ) values (
           'rem_e2e_watchdog', '${input.serverId}', 'agt_e2e_reminder',
           'Local watchdog', '${input.chatId}', 'msg_e2e_reminder_anchor',
           '2099-07-27T13:00:00.000Z', 'daily@09:00', 'America/New_York',
           'check-deploy.sh', 'scheduled', 1,
           '2026-07-26T12:00:00.000Z', '2026-07-26T12:00:00.000Z'
         ), (
           'rem_e2e_deploy', '${input.serverId}', 'agt_e2e_reminder',
           'Deploy check', '${input.chatId}', 'msg_e2e_reminder_anchor',
           now() - interval '2 days', null, 'America/New_York',
           null, 'fired', 2,
           '2026-07-26T12:00:00.000Z', now() - interval '2 days'
         ), (
           'rem_e2e_standup', '${input.serverId}', 'agt_e2e_reminder',
           'Standup nudge', '${input.chatId}', 'msg_e2e_reminder_anchor',
           '2099-08-03T13:00:00.000Z', 'weekly:mon@09:00', 'America/New_York',
           null, 'scheduled', 1,
           '2026-07-26T12:00:00.000Z', '2026-07-26T12:00:00.000Z'
         ), (
           'rem_e2e_digest', '${input.serverId}', 'agt_e2e_reminder',
           'Weekly digest', '${input.chatId}', 'msg_e2e_reminder_anchor',
           '2099-12-27T13:00:00.000Z', null, 'America/New_York',
           null, 'canceled', 2,
           '2026-07-26T12:00:00.000Z', now() - interval '1 day'
         );
         insert into reminder_fires (
           id, server_id, reminder_id, fired_at, scheduled_for,
           has_script, script_exit_code, script_timed_out
         ) values (
           'fir_e2e_watchdog_new', '${input.serverId}', 'rem_e2e_watchdog',
           now() - interval '1 day', now() - interval '1 day', true, 0, false
         ), (
           'fir_e2e_standup', '${input.serverId}', 'rem_e2e_standup',
           now() - interval '36 hours', now() - interval '36 hours', false, null, false
         ), (
           'fir_e2e_deploy', '${input.serverId}', 'rem_e2e_deploy',
           now() - interval '2 days', now() - interval '2 days', false, null, false
         ), (
           'fir_e2e_watchdog_old', '${input.serverId}', 'rem_e2e_watchdog',
           now() - interval '3 days', now() - interval '3 days', true, null, true
         );
         insert into message_causes (
           message_id, server_id, kind, attribution, reminder_id, reminder_fire_id,
           title, summary, fired_at, owner_agent_id, anchor_chat_id
         ) values (
           'msg_e2e_reminder_answer', '${input.serverId}', 'reminder_fire', 'explicit',
           'rem_e2e_deploy', 'fir_e2e_deploy',
           'Deploy check', 'One time', now() - interval '2 days', 'agt_e2e_reminder',
           '${input.chatId}'
         );
         commit;`
    );
}
