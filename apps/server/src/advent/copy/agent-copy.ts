import type { FactCopyBook } from './fact-copy.ts';
import { count, plural, tokens } from './format.ts';
import { b, line } from './line.ts';

type AgentFact =
    | 'agents-at-table'
    | 'hardest-worker'
    | 'most-thanked-agent'
    | 'tasks-closed'
    | 'tokens-used';

/** The member's Agents and the work they took on. */
export const agentCopy: FactCopyBook<AgentFact> = {
    'agents-at-table': {
        empty: [line("No Agents at your table yet. There's always room for one more.")],
        lines: ({ count: agents }) => [
            line(
                'You talked with ',
                b(count(agents)),
                ` ${plural(agents, 'Agent')} this year. Every one saved you a seat.`
            ),
            line(
                b(count(agents)),
                ` ${plural(agents, 'Agent')} at your table this year. Lay another place.`
            ),
        ],
        title: 'Agents at your table',
    },
    'most-thanked-agent': {
        empty: [line('No thank-yous on the books. The Agents are too polite to mention it.')],
        lines: (stat) => [
            line(
                'You thanked ',
                b(stat.name),
                ' ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'time')}. Manners like that get noticed.`
            ),
            line(
                b(stat.name),
                ' got ',
                b(count(stat.count)),
                ` ${plural(stat.count, 'thank-you')} from you. They're pretending not to be pleased.`
            ),
        ],
        title: 'The agent you thanked most',
    },
    'tokens-used': {
        empty: [line("Not a token burned. The hearth's cold, but tidy.")],
        lines: (stat) => [
            line(
                'Your Agents burned through ',
                b(tokens(stat.tokens)),
                ` ${plural(stat.tokens, 'token')}. That's a lot of firewood.`
            ),
            line(
                b(tokens(stat.tokens)),
                ` ${plural(stat.tokens, 'token')} went up the chimney for you this year. Worth every one.`
            ),
        ],
        title: 'Tokens burned',
    },
    'tasks-closed': {
        empty: [line("No tasks closed this year. They'll keep till January.")],
        lines: ({ count: tasks }) => [
            line(
                b(count(tasks)),
                ` of your ${plural(tasks, 'task')} got closed. The to-do list is shorter for it.`
            ),
            line(
                'You set ',
                b(count(tasks)),
                ` ${plural(tasks, 'task')} that saw the finish line. Somebody's been sweeping up.`
            ),
        ],
        title: 'Tasks closed',
    },
    'hardest-worker': {
        empty: [
            line("No Agent clocked in for you this year. The workshop's open when you need it."),
        ],
        lines: (stat) => [
            line(
                b(stat.name),
                ' worked hardest for you: ',
                b(count(stat.turns)),
                ` ${plural(stat.turns, 'turn')}. Give them the good chair.`
            ),
            line(
                b(count(stat.turns)),
                ` ${plural(stat.turns, 'turn')} from `,
                b(stat.name),
                ' this year. Someone get that Agent a cocoa.'
            ),
        ],
        title: 'The hardest worker',
    },
};
