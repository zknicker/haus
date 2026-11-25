import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTurnTraceView } from '../../turn-trace/turn-trace-view.ts';
import { TurnSteps } from './agent-activity-log-turn.tsx';
import { unreadableTurnJournal } from './agent-activity-model.ts';

const outcome = 'Read 6 files · sent 1 message';
const view = buildTurnTraceView(null, [], 0);

test('an open turn titled by its outcome does not repeat it', () => {
    const markup = steps({ access: 'journal', headerSaysOutcome: true });
    expect(markup).toContain('Detailed activity unavailable');
    expect(markup).not.toContain(outcome);
    const summary = steps({ access: 'summary', headerSaysOutcome: true });
    expect(summary).toContain('Step details are visible to owners and admins.');
    expect(summary).not.toContain(outcome);
});

test('an open turn titled by its request still says what it did', () => {
    expect(steps({ access: 'journal', headerSaysOutcome: false })).toContain(
        `${outcome} · Detailed activity unavailable`
    );
    expect(steps({ access: 'summary', headerSaysOutcome: false })).toContain(outcome);
});

function steps(props: { access: 'journal' | 'summary'; headerSaysOutcome: boolean }) {
    return renderToStaticMarkup(
        <TurnSteps {...props} outcome={outcome} presentation={unreadableTurnJournal} view={view} />
    );
}
