import type { FactCopyBook } from './fact-copy.ts';
import { clock, count, duration, hour, monthDay, monthName, plural } from './format.ts';
import { b, line } from './line.ts';

type RhythmFact =
    | 'busiest-day'
    | 'busiest-hour'
    | 'early-bird'
    | 'longest-streak'
    | 'messages-sent'
    | 'night-owl'
    | 'quickest-reply'
    | 'quiet-month'
    | 'weekends-off';

/** When the member wrote. */
export const rhythmCopy: FactCopyBook<RhythmFact> = {
    'longest-streak': {
        empty: [line('No run of days to speak of. The door was always open.')],
        lines: (stat) => {
            const run = b(`${count(stat.days)} ${plural(stat.days, 'day')}`);
            if (stat.days === 1) {
                return [
                    line('Your longest run was ', run, '. One good day at a time.'),
                    line(run, ' at a stretch, tops. You pace yourself. We respect that.'),
                ];
            }
            return [
                line(
                    'You showed up ',
                    run,
                    ' in a row, through ',
                    b(monthDay(stat.endedOn)),
                    '. The fire never went out.'
                ),
                line(
                    'Your longest run was ',
                    run,
                    ' straight, ending ',
                    b(monthDay(stat.endedOn)),
                    '. Not one night off.'
                ),
                line(run, ' in a row without missing one. The regulars tip their hats.'),
            ];
        },
        title: 'The long run',
    },
    'messages-sent': {
        empty: [
            line('Not a word from you this year. Mysterious. We like that.'),
            line("The ledger's blank. Some guests just come for the fire."),
        ],
        lines: ({ count: sent }) => [
            line(
                'You sent ',
                b(count(sent)),
                ` ${plural(sent, 'message')} this year. The ink held up.`
            ),
            line(
                b(count(sent)),
                ` ${plural(sent, 'message')} from you this year. Somebody kept the lamps lit.`
            ),
            line(
                'You wrote ',
                b(count(sent)),
                ` ${plural(sent, 'message')}. The quill has earned a rest.`
            ),
        ],
        title: 'Messages sent',
    },
    'busiest-hour': {
        empty: [line('No busiest hour to speak of. You kept your own time.')],
        lines: (stat) => [
            line(
                'Your busiest hour was ',
                b(hour(stat.hour)),
                ', with ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')}. Same time, same chair.`
            ),
            line(
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')} landed in the `,
                b(hour(stat.hour)),
                ' hour. Like clockwork.'
            ),
        ],
        title: 'Your busiest hour',
    },
    'early-bird': {
        empty: [line("No early mornings on record. Sensible. It's cold out.")],
        lines: (stat) => [
            line(
                'On a typical morning your first message landed at ',
                b(clock(stat.minuteOfDay)),
                '. The kettle had barely boiled.'
            ),
            line(
                'Most mornings you were up and typing by ',
                b(clock(stat.minuteOfDay)),
                ". The rooster's jealous."
            ),
        ],
        title: 'The early bird',
    },
    'night-owl': {
        empty: [
            line('Not one message between midnight and 5am. Sleep is underrated.'),
            line('Lights out by midnight, every night. The owls ask after you.'),
        ],
        lines: ({ count: sent }) => [
            line(
                b(count(sent)),
                ` ${plural(sent, 'message')} between midnight and 5am. The fire was out. You weren't.`
            ),
            line(
                'You wrote ',
                b(count(sent)),
                ` ${plural(sent, 'message')} after midnight and before 5am. We left a lamp on.`
            ),
        ],
        title: 'The night owl',
    },
    'busiest-day': {
        empty: [line('No busiest day to speak of. Steady as she goes.')],
        lines: (stat) => [
            line(
                b(monthDay(stat.date)),
                ' was your busiest day: ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')}. Hope you ate lunch.`
            ),
            line(
                'You sent ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')} on `,
                b(monthDay(stat.date)),
                ". What happened? Don't tell us."
            ),
        ],
        title: 'Your busiest day',
    },
    'quiet-month': {
        empty: [line('Not enough months on the books to pick a quiet one. Next year, then.')],
        lines: (stat) =>
            stat.count === 0
                ? [
                      line(
                          b(monthName(stat.month)),
                          ' was your quiet month: not a single message. Gone fishing?'
                      ),
                      line(
                          'You went silent in ',
                          b(monthName(stat.month)),
                          '. Hope it was somewhere warm.'
                      ),
                  ]
                : [
                      line(
                          b(monthName(stat.month)),
                          ' was your quietest month, with just ',
                          b(count(stat.count)),
                          ` ${plural(stat.count, 'message')}. Everyone needs a lie-in.`
                      ),
                      line(
                          'You went quiet in ',
                          b(monthName(stat.month)),
                          ': only ',
                          b(count(stat.count)),
                          ` ${plural(stat.count, 'message')}. Hope it was somewhere warm.`
                      ),
                  ],
        title: 'The quiet month',
    },
    'weekends-off': {
        empty: [line('No messages, so no weekends to speak of. Rest well.')],
        lines: (stat) => {
            if (stat.weekend === 0) {
                return [
                    line('Not one message on a weekend. Weekends off, as it should be.'),
                    line('Saturdays and Sundays, not a peep. The inn approves.'),
                ];
            }
            const share = b(`${stat.percent}%`);
            return stat.percent <= 15
                ? [
                      line(
                          'Just ',
                          share,
                          ' of your messages went out on weekends. Mostly off, then.'
                      ),
                      line('Only ', share, ' of your messages landed on a weekend. Good habits.'),
                  ]
                : [
                      line(
                          share,
                          ' of your messages landed on a Saturday or Sunday. The inn never really closes.'
                      ),
                      line('You did ', share, ' of your writing on weekends. Who needs a day off?'),
                  ];
        },
        title: 'Weekends off',
    },
    'quickest-reply': {
        empty: [line('No quick replies on record. Some things deserve a think.')],
        lines: (stat) => [
            line(
                'Your quickest reply came ',
                b(duration(stat.seconds)),
                ' after ',
                b(stat.name),
                ' spoke. Were you hovering?'
            ),
            line(
                'You answered ',
                b(stat.name),
                ' in ',
                b(duration(stat.seconds)),
                ' flat. Fastest draw in the house.'
            ),
        ],
        title: 'The quickest reply',
    },
};
