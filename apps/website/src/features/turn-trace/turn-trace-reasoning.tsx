import type { AgentExecutionJournalReasoning } from '@haus/api';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';

/** Reasoning is readable in place; only tool evidence needs disclosure. */
export function TurnTraceReasoning({ reasoning }: { reasoning: AgentExecutionJournalReasoning }) {
    return (
        <div className="min-w-0 py-2">
            <ReferenceMarkdown className="text-muted text-sm" content={reasoning.text} />
            {reasoning.truncated ? <p className="text-muted text-xs">(truncated)</p> : null}
        </div>
    );
}
