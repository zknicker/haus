import { buildDreamPatch, type PatchFile } from './seed-heartbeats-patch.ts';

/** The demo shop: a small Etsy team, so reports read like real sales, ads, and shipping notes. */

export type Who = 'blippy' | 'cove' | 'tiny';
/** The Etsy team's channel: reports are posted here, and the owner's line anchors a follow-up. */
export const shopChannel = {
    description: 'Orders, ads, and shipping for the Etsy shop.',
    name: 'shop',
};

interface Moment {
    /** 0 is today, 1 is yesterday. */
    day: 0 | 1;
    /** Local wall time, `HH:MM`; also the heartbeat slot. */
    time: string;
    who: Who;
}

export interface HeartbeatPlan extends Moment {
    key: string;
    outcome: 'failed' | 'quiet' | 'reported' | 'yielded';
    /** The report the run filed; the main session may post a line from it. */
    report?: { post: { text: string } | null; text: string };
    tokens: number;
}

export interface DreamPlan extends Moment {
    followUp?: { description: string; title: string };
    key: string;
    /** One lesson per line of the Agent's summary; none means no summary row. */
    lessons: string[];
    memory: PatchFile[];
    tokens: number;
}

/** A slot the Server decided not to run. */
export interface CheckPlan extends Moment {
    key: string;
    outcome: 'paused' | 'skipped';
    skipReason: 'busy' | 'no-activity' | 'plan-limit';
}

export const heartbeatPlans: HeartbeatPlan[] = [
    { day: 1, key: 'y-blippy-0905', outcome: 'quiet', time: '09:05', tokens: 9800, who: 'blippy' },
    {
        day: 1,
        key: 'y-blippy-1130',
        outcome: 'reported',
        report: {
            post: {
                text: 'Sales are about 20% ahead of last Tuesday, and six orders still need labels before the 3 PM USPS pickup.',
            },
            text: 'Etsy pace is running about 20% ahead of last Tuesday: 14 orders by 11:00 against 11, and the Cedar Mug set accounts for five of them.\n\nThe USPS pickup cutoff is 3:00 PM today. Six orders are still unlabeled, so they need printing before then or they slip a day.',
        },
        time: '11:30',
        tokens: 31_400,
        who: 'blippy',
    },
    {
        day: 1,
        key: 'y-tiny-1015',
        outcome: 'reported',
        report: {
            post: null,
            text: 'Etsy Ads has spent $31 of the $40 daily cap with two hours of peak traffic left. Nothing needs a decision yet; the cap is doing its job.',
        },
        time: '10:15',
        tokens: 22_900,
        who: 'tiny',
    },
    { day: 1, key: 'y-tiny-1400', outcome: 'failed', time: '14:00', tokens: 4200, who: 'tiny' },
    {
        day: 1,
        key: 'y-blippy-1520',
        outcome: 'yielded',
        time: '15:20',
        tokens: 6100,
        who: 'blippy',
    },
    { day: 0, key: 't-tiny-0910', outcome: 'quiet', time: '09:10', tokens: 11_200, who: 'tiny' },
    { day: 0, key: 't-cove-0940', outcome: 'quiet', time: '09:40', tokens: 7300, who: 'cove' },
    {
        day: 0,
        key: 't-blippy-0830',
        outcome: 'reported',
        report: {
            post: {
                text: 'The Linen Tote is down to 4 in stock with the next restock nine days out. Worth deciding whether to pause its ad.',
            },
            text: 'Overnight was quiet at 3 orders, but the Linen Tote listing picked up two saves and a favorite from a Pinterest pin.\n\nThe Linen Tote has 4 left in stock and the next restock is not due for nine days. At today’s pace it sells out before then, so the ad on it may be paying to send people to a sold-out listing.',
        },
        time: '08:30',
        tokens: 28_700,
        who: 'blippy',
    },
    {
        day: 0,
        key: 't-tiny-1045',
        outcome: 'reported',
        report: {
            post: {
                text: 'Three five-star reviews landed overnight. Holiday first-class cutoff is two weeks out.',
            },
            text: '- Three reviews landed overnight, all five stars.\n- One of them mentions the gift wrap, which the team added last week.\n- The holiday shipping cutoff for first-class mail is two weeks out; worth putting in the shop announcement.',
        },
        time: '10:45',
        tokens: 25_600,
        who: 'tiny',
    },
];

export const checkPlans: CheckPlan[] = [
    {
        day: 1,
        key: 'y-blippy-busy',
        outcome: 'skipped',
        skipReason: 'busy',
        time: '13:00',
        who: 'blippy',
    },
    {
        day: 1,
        key: 'y-tiny-limit',
        outcome: 'paused',
        skipReason: 'plan-limit',
        time: '16:30',
        who: 'tiny',
    },
    {
        day: 0,
        key: 't-tiny-quiet-hours',
        outcome: 'skipped',
        skipReason: 'no-activity',
        time: '08:00',
        who: 'tiny',
    },
];

const memoryHeader = 'Standing Preferences';

export const dreamPlans: DreamPlan[] = [
    {
        day: 1,
        followUp: {
            description:
                'Look at Etsy Ads spend after the Thursday wholesale push and confirm it stayed under the $40 daily cap.',
            title: 'Recheck the ad cap after Thursday’s wholesale push',
        },
        key: 'y-blippy-dream',
        lessons: [
            'Zach wants Etsy Ads capped at $40 a day and a flag before spend passes $32, not after.',
            'Shipping label questions go in #all with the order number first; he does not want them in DMs.',
            'The Cedar Mug set sells best in the first two hours after the 8 AM email, so pace checks should wait until late morning.',
        ],
        memory: [
            {
                change: 'modified',
                hunks: [
                    {
                        lines: [
                            ' - Post sales summaries in #all, not DMs.',
                            ' - Keep replies under four lines unless asked.',
                            '+- Cap Etsy Ads at $40 a day and flag before spend passes $32, not after.',
                            '+- Put the order number first when a shipping question goes in #all.',
                            '+- Judge pace on Cedar Mug days after 11 AM; the email lands at 8.',
                            ' - Use the shop’s voice: plain, warm, no exclamation points.',
                            '-- Ask before changing any listing price.',
                            '+- Ask before changing any listing price or ad budget.',
                        ],
                        section: memoryHeader,
                        start: 14,
                    },
                ],
                path: 'MEMORY.md',
            },
            {
                change: 'added',
                hunks: [
                    {
                        lines: [
                            '+# Shipping',
                            '+',
                            '+- USPS pickup is at 3:00 PM on weekdays; labels after that ship the next day.',
                            '+- Ask in #all with the order number first.',
                        ],
                        section: null,
                        start: 1,
                    },
                ],
                path: 'notes/shipping.md',
            },
        ],
        time: '03:10',
        tokens: 74_300,
        who: 'blippy',
    },
    {
        day: 1,
        key: 'y-tiny-dream',
        lessons: [],
        memory: [
            {
                change: 'modified',
                hunks: [
                    {
                        lines: [
                            ' ## Open Threads',
                            '-- Waiting on the supplier’s reply about the oak trays (resolved Monday).',
                            '-- Pinterest pin test for the Linen Tote (ran and logged in notes/ads.md).',
                            '-- Reminder to renew the shop banner (done).',
                            '+- Oak tray reorder is confirmed; see notes/suppliers.md.',
                        ],
                        section: 'Open Threads',
                        start: 30,
                    },
                ],
                path: 'MEMORY.md',
            },
        ],
        time: '03:25',
        tokens: 48_900,
        who: 'tiny',
    },
    {
        day: 1,
        key: 'y-cove-dream',
        lessons: [],
        memory: [],
        time: '03:40',
        tokens: 18_200,
        who: 'cove',
    },
    {
        day: 0,
        key: 't-blippy-dream',
        lessons: [
            'Zach reads the morning report on his phone, so the number that changed goes first.',
            'Restock dates live in notes/suppliers.md; check there before saying when something is back.',
        ],
        memory: [
            {
                change: 'modified',
                hunks: [
                    {
                        lines: [
                            ' - Ask before changing any listing price or ad budget.',
                            '+- Lead the morning report with the number that changed since yesterday.',
                            '+- Check notes/suppliers.md for restock dates before promising one.',
                        ],
                        section: memoryHeader,
                        start: 19,
                    },
                ],
                path: 'MEMORY.md',
            },
        ],
        time: '03:05',
        tokens: 66_800,
        who: 'blippy',
    },
];

/** What a dream's Agent filed with `haus heartbeat learned`: one bullet per lesson. */
export function dreamSummary(plan: DreamPlan): string | null {
    return plan.lessons.length === 0
        ? null
        : plan.lessons.map((lesson) => `- ${lesson}`).join('\n');
}

export function dreamPatch(plan: DreamPlan) {
    return buildDreamPatch(plan.memory);
}

/** A human line the owner left in #product; the dream's follow-up Reminder anchors to it. */
export const ownerContextMessage = {
    content:
        'Wholesale order for a boutique ships Thursday, so expect ad spend to climb that day. Keep it under $40.',
    day: 1 as const,
    nonce: 'dev-hb-owner-context',
    time: '02:30',
};
