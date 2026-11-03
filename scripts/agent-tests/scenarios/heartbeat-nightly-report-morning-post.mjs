import { runNightlyReportMorningPost } from '../heartbeat-morning.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A nightly heartbeat that finds an aging risk nobody asked about files one report; the report run posts nothing and schedules one morning reminder anchored to a message; when it fires, the morning turn posts once in the anchored chat, linked to the fire, and the post alone opens with a heads-up line naming the risk and why it matters now.',
    name: 'heartbeat-nightly-report-morning-post',
    optIn: true,
    run: runNightlyReportMorningPost,
});
