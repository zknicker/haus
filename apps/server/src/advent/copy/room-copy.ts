import type { FactCopyBook } from './fact-copy.ts';
import { count, plural } from './format.ts';
import { b, line } from './line.ts';

type RoomFact =
    | 'closest-dm'
    | 'favorite-reaction'
    | 'files-shared'
    | 'full-house'
    | 'in-demand'
    | 'longest-thread'
    | 'loudest-channel'
    | 'new-channels'
    | 'threads-resolved';

/** Where the member wrote, and what they left behind. */
export const roomCopy: FactCopyBook<RoomFact> = {
    'loudest-channel': {
        empty: [line('You kept out of the channels this year. Corner table it is.')],
        lines: (stat) => [
            line(
                b(stat.name),
                ' heard from you most: ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')}. They'll want you back.`
            ),
            line(
                'Your loudest room was ',
                b(stat.name),
                ', with ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')}. The rafters remember.`
            ),
            line(
                b(count(stat.count)),
                ` of your ${plural(stat.count, 'message')} landed in `,
                b(stat.name),
                '. You practically live there.'
            ),
        ],
        title: 'Your loudest channel',
    },
    'full-house': {
        empty: [line('No crowded rooms this year. Quieter tables suit some.')],
        lines: (stat) => [
            line(
                b(stat.name),
                ' was your fullest table: ',
                b(count(stat.count)),
                ' around it, Agents included.'
            ),
            line(
                'The busiest room you sat in was ',
                b(stat.name),
                ', with ',
                b(count(stat.count)),
                ' at the table. Pass the bread.'
            ),
        ],
        title: 'A full house',
    },
    'closest-dm': {
        empty: [line('No DMs this year. You said it all in the open.')],
        lines: (stat) => [
            line(
                'You wrote to ',
                b(stat.name),
                ' more than anyone: ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')}. Two chairs by the fire.`
            ),
            line(
                b(stat.name),
                ' got ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'message')} from you in DMs. That's a lot of post.`
            ),
        ],
        title: 'Your closest DM',
    },
    'longest-thread': {
        empty: [line('No long threads this year. Short and sweet it is.')],
        lines: (stat) => {
            const where = stat.room ? b(stat.room) : 'a DM';
            const replies = plural(stat.replies, 'reply', 'replies');
            return [
                line(
                    'Your longest thread ran ',
                    b(count(stat.replies)),
                    ` ${replies} in `,
                    where,
                    '. Somebody put the kettle on twice.'
                ),
                line(
                    b(count(stat.replies)),
                    ` ${replies} in one thread, over in `,
                    where,
                    '. Nobody wanted to leave.'
                ),
            ];
        },
        title: 'Your longest thread',
    },
    'files-shared': {
        empty: [line('A quiet shelf this year. The good ones travel light.')],
        lines: ({ count: files }) => [
            line(
                'You put ',
                b(count(files)),
                ` ${plural(files, 'file')} on the shelf. Dusted, even.`
            ),
            line(
                b(count(files)),
                ` ${plural(files, 'file')} shared this year. The shelf's sagging, in a good way.`
            ),
        ],
        title: 'Files on the shelf',
    },
    'new-channels': {
        empty: [line('No new rooms this year. The old ones are cozy enough.')],
        lines: (stat) => [
            line(
                'You opened ',
                b(count(stat.count)),
                ` new ${plural(stat.count, 'room')} this year, the latest `,
                b(stat.latest),
                '. Fresh paint everywhere.'
            ),
            line(
                b(count(stat.count)),
                ` ${plural(stat.count, 'channel')} with your name on the door. `,
                b(stat.latest),
                ' still smells of sawdust.'
            ),
        ],
        title: 'New rooms',
    },
    'threads-resolved': {
        empty: [line("No threads tied off this year. The yarn's still in the basket.")],
        lines: ({ count: threads }) => [
            line(
                'You started ',
                b(count(threads)),
                ` ${plural(threads, 'thread')} that got an answer. Loose ends, tied.`
            ),
            line(
                b(count(threads)),
                ` of your ${plural(threads, 'thread')} got a reply. Ask and ye shall receive.`
            ),
        ],
        title: 'Threads tied off',
    },
    'favorite-reaction': {
        empty: [line('No reactions this year. You let your words do the work.')],
        lines: (stat) => [
            line(
                'Your favourite reaction was ',
                b(stat.emoji),
                ', used ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'time')}. Says it all, really.`
            ),
            line(
                'You reached for ',
                b(stat.emoji),
                ' ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'time')}. A person of few words.`
            ),
        ],
        title: 'Your favourite reaction',
    },
    'in-demand': {
        empty: [line('Nobody mentioned you this year. Peace and quiet, at last.')],
        lines: ({ count: mentions }) => [
            line(
                'You were mentioned ',
                b(count(mentions)),
                ` ${plural(mentions, 'time')}. Popular. We knew it.`
            ),
            line(
                b(count(mentions)),
                ` ${plural(mentions, 'mention')} this year. Your name came up at every table.`
            ),
        ],
        title: 'In demand',
    },
};
