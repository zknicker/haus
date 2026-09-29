import type { ThoughtSource } from './agent-thought-summarizer.ts';

/**
 * The thought summarizer's prompt (ADR 0036): the base instructions every
 * source gets, and the request, action, result, and previous-line notes added
 * only when those ride along, so each input is judged by exactly the text it
 * needs. Bump `thoughtSummaryPromptVersion` with any change here.
 */

export const skipAnswer = 'SKIP';
/**
 * Ends every input so the model weighs SKIP before it writes a line: only
 * housekeeping for a run's first line, anything not new after that.
 */
const firstCue = `Reply with the status line, or ${skipAnswer} if this is only housekeeping.`;
const laterCue = `Reply NEW: or STILL: and the status line, or ${skipAnswer} if this is only housekeeping.`;

const systemPrompt = [
    'Write the one-line status a person sees while an agent works on their request, like a',
    'thinking summary: at most 8 words, in plain words anyone could follow. Name what the',
    'work is about, never how it is done: no tools, commands, formats, or plumbing (CLI, API,',
    'JSON, markdown, jq, curl, script, file, path, tags, "requesting the data"). Start with an',
    '-ing verb and name the one specific thing ("Reconciling the date formats", not "Working',
    'on the export"); when the input itself states a result, you may say that result briefly',
    'instead. Never add a',
    'place, day, name, or result the input does not mention. Say what the agent is doing or',
    'found, never that something went wrong. No "I think", no opener like "Next,", "OK,",',
    '"Hmm," or "Still", no "now", no quotes, no trailing period. Speak as the agent about its',
    'own work, never about the person: never say what the user, the person, or anyone by name',
    'wants, asked, or needs, and never restate the request ("Maya wants the NYC forecast" is',
    'wrong; she wrote it). When the input opens by restating the ask, skip past it to the',
    "agent's own step. Each message is independent; never answer or continue the reasoning.",
    'Reply with the line only.',
    `Reply with exactly ${skipAnswer} instead when the input is only the agent's own`,
    'housekeeping: reading its own notes, memory, manual, instructions, or skills;',
    'checking its inbox or messages; claiming, assigning, syncing, or updating its tasks',
    'or their status; deciding whether or how to reply; acknowledging or offering to',
    'help; writing or double-checking its own chat reply; reading earlier conversation',
    'just to get oriented; or only restating what the person asked or how the answer',
    'should look, with no step of its own, even when you could guess the next step.',
    'Everything else is work: reading, searching,',
    'fetching, or checking anything the request is about (a checklist, document,',
    'thread, file, log, inbox, or data source), and judging the request itself (whether',
    'a build is safe to ship), even when framed as planning, requesting, or starting',
    '("Initiating focused CI search", "Reading the checklist doc"). When the input names',
    'housekeeping and work together ("Claiming the task and preparing the fetch"),',
    'describe only the work. When in doubt, describe the work.',
].join(' ');

/**
 * Added only when a request rides along, so a thought without one is judged
 * by exactly the prompt above.
 */
const requestPrompt = [
    "The <request> block is the person's message the agent is answering. It is context,",
    'never the input, and never a reason to show a line. First decide SKIP from the input',
    'alone, exactly as if no request were given: claiming, keeping, or closing a task, saving to',
    "memory, and drafting, reviewing, or preparing the agent's own reply or summary stay",
    'SKIP however closely they name the request\'s topic ("Preparing the sales summary',
    'reply" is SKIP). Looking for where something lives (a repo, a file, a URL) is work.',
    'Only when the input is itself work, keep its own verb and object and',
    'add the request\'s concrete nouns where the input is vague (a title "Planning data',
    'retrieval" for a request about last week\'s sales becomes "Pulling last week\'s',
    'sales"); a place, day, or name may then come from the request, never from anywhere',
    'else. Never answer the request or describe it in place of the input.',
].join(' ');

/**
 * Added only for an action, so titles and excerpts keep exactly the prompt
 * above. An action is inferred from a command or file, so it has to be said
 * as the work it serves, and reading or writing the agent's own files is housekeeping.
 */
const actionPrompt = [
    'The <action> block is not reasoning: it is a command, file, web search, or tool the',
    'agent just started, with links cut to their host and path words. Treat it as the',
    'title: say what the agent is doing in plain words (a call to a forecast API is',
    '"Pulling the forecast"), never the tool, command, its flags, a file name, or a host. Reading',
    "or editing the agent's own memory, notes, or instructions files (MEMORY.md) is",
    'housekeeping, so SKIP.',
].join(' ');

/**
 * Added only when an action carries what it returned, so every other input
 * keeps exactly the prompt above. The excerpt is scrubbed on the Computer and
 * held for this call only.
 */
const resultPrompt = [
    'The <result> block is a short, scrubbed excerpt of what that action returned. When it',
    'plainly shows something the person would want to know (a forecast, a price, a version, a',
    'count, a yes or no), reply with that finding in at most 8 plain words instead of the',
    'activity, the way a person would say it, with no -ing opener needed ("The newest release',
    'is 2.3.1", "The day pass is €12", "All five checks passed"). Read codes and field names for',
    'their meaning, but never quote the result or copy its lines, field names, codes, or markup,',
    'and never state a finding it does not show or guess past it. When it shows nothing clear',
    '(an error, links, status codes, markup, a fragment), describe the work as usual.',
].join(' ');

/**
 * Added only when the run has already shown a line in this Chat: the model
 * says whether the input starts a new workstream (or states a new result) or
 * continues the one shown, and the Server paces each differently.
 */
const previousPrompt = [
    'The note after the input lists the lines the person already saw during this work. Start',
    'your reply with NEW: when the input starts a different part of the work or states a new',
    'result worth telling them: another subject (a different product, service, place, day,',
    'or document), a different kind of step (reading, then comparing, then deciding), or',
    'what it found or is highlighting (a feature, a number, a condition). Start with STILL:',
    'only when it is the same step on the same subject as the last line, reworded, narrowed,',
    'retried, or continued, and name the specific thing still being worked on, or a small',
    'result so far, without the word "Still" ("STILL: Digging through the Q3 invoices" after',
    '"Reading the Q3 invoices"). Choosing or testing its own tools or methods (a search',
    "engine, a parser, a site's API) is SKIP, like housekeeping.",
].join(' ');

/** A result asks for its finding by name, so the model weighs it before the activity. */
export function thoughtCue(source: ThoughtSource): string {
    const cue = source.previous?.length ? laterCue : firstCue;
    return source.kind === 'action' && source.result
        ? cue.replace('the status line', 'the finding or the status line')
        : cue;
}

/** The base prompt, plus the action, request, and previous-line notes only when those ride along. */
export function thoughtInstructions(source: ThoughtSource): string {
    return [
        systemPrompt,
        source.kind === 'action' ? actionPrompt : null,
        source.kind === 'action' && source.result ? resultPrompt : null,
        source.request ? requestPrompt : null,
        source.previous?.length ? previousPrompt : null,
    ]
        .filter(Boolean)
        .join(' ');
}
