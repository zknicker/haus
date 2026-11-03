// Grades eval runs out of band, from saved run reports and routing evidence.
// Scenarios gate structure only; a grader profile adds what the eval's spec
// says about length, tails, questions, placement, and the finished flag.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    classifyPlacement,
    isThreadTarget,
    refersTo,
    wordCount,
} from '../agent-tests/placement.mjs';
import {
    buildTimeline,
    doneSendsFrom,
    evidenceMessages,
    readScenarioRun,
    runsDirectory,
    sentWithDone,
} from './evidence.mjs';
import { judgeEnabled, judgeRun } from './judge.mjs';
import { tailPhrases } from './profiles.mjs';

/** Failures that are the stack's or the provider's, not the Agent's behavior. */
const infraPatterns = [
    /never became ready/iu,
    /No attached Computer/iu,
    /could not reach the dev stack/iu,
    /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up/iu,
    /Execution journal for run \S+ stayed/iu,
    /failed \(5\d\d\)/u,
    /Dev Haus sign-in|Local Haus session|Haus session (?:failed|unavailable)/iu,
];

export function isInfraFailure(error) {
    return Boolean(error) && infraPatterns.some((pattern) => pattern.test(String(error)));
}

/**
 * Grades every registered scenario in a build's runs. `runs` is
 * `[{ stamp, pass }]`; `root` is the checkout whose `.context/agent-tests` holds them.
 */
export async function gradeBuild({ judge = null, names, profiles = {}, root, runs }) {
    const grades = [];
    const judging = judgeEnabled(judge);
    for (const { pass, stamp } of runs) {
        const summaryFile = path.join(path.resolve(root), runsDirectory, stamp, 'summary.json');
        if (!existsSync(summaryFile)) {
            continue;
        }
        const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
        for (const entry of summary.scenarios.filter((scenario) => names.includes(scenario.name))) {
            const run = await readScenarioRun(root, stamp, entry.name);
            const grade = gradeScenario({
                entry,
                evidence: run.evidence,
                profile: profiles[entry.name] ?? null,
                stamp,
            });
            grade.pass = pass;
            // Graded posts keep the label the grader judged them by.
            grade.timeline = buildTimeline(run, {
                labels: new Map(grade.posts.map((post) => [post.id, post.label])),
            });
            grade.judge = judging && grade.posts.length > 0 ? await judgeRun(grade, judge) : null;
            grades.push(grade);
        }
    }
    return grades;
}

export function gradeScenario({ entry, evidence, profile, stamp }) {
    const grade = {
        checks: [],
        error: entry.error ?? null,
        infra: !entry.ok && isInfraFailure(entry.error),
        ok: entry.ok,
        posts: [],
        request: null,
        result: null,
        scenario: entry.name,
        seconds: entry.seconds ?? null,
        spec: profile?.spec ?? null,
        stamp,
    };
    if (!profile) {
        return grade;
    }
    if (!evidence) {
        grade.checks.push({ name: 'routing evidence found', ok: false });
        return grade;
    }
    const { agentId, rootChatId } = evidence;
    const messages = evidenceMessages(evidence);
    const isAgent = (message) =>
        message.author.kind === 'agent' && message.author.agentId === agentId;
    const seeded = (message) => message.runId?.startsWith('run_agenttests_');
    const humans = messages.filter((message) => message.author.kind === 'human');
    const rootHumans = humans.filter((message) => message.chatId === rootChatId);
    const wake = profile.inThread
        ? humans.findLast((message) => message.chatId !== rootChatId)
        : rootHumans.at(-1);
    if (!wake) {
        grade.checks.push({ name: 'request found', ok: false });
        return grade;
    }
    const requestIds =
        profile.requests === 'channel-humans' ? rootHumans.map((message) => message.id) : [wake.id];
    const doneSends = doneSendsFrom(evidence.journals ?? []);
    const context = {
        channelId: rootChatId,
        ownAnchors: messages.filter(isAgent).map((message) => message.id),
        requestId: requestIds,
        threads: evidence.chats.flatMap((chat) => chat.threads ?? []),
    };
    const authored = messages.filter((message) => isAgent(message) && !seeded(message));
    // A fire-answer profile grades from the first post the fire caused, not the human's anchor.
    const since = profile.since?.(authored) ?? wake.createdAt;
    const posts = authored
        .filter((message) => Date.parse(message.createdAt) >= Date.parse(since))
        .map((message) => ({
            chatId: message.chatId,
            content: message.content,
            finished: sentWithDone(message.content, doneSends),
            id: message.id,
            // A human who asked inside a Thread is looking there.
            label:
                profile.inThread && message.chatId === wake.chatId
                    ? 'asked-thread'
                    : classifyPlacement(message, context),
            replyTo: message.reply?.rootMessageId ?? null,
            words: wordCount(message.content),
        }));
    grade.request = {
        chatId: wake.chatId,
        content: wake.content,
        context: priorContext(messages, wake),
    };
    grade.posts = posts;
    const channelPosts = posts.filter((post) => post.chatId === rootChatId);
    grade.channelPosts = channelPosts.length;
    const check = (name, ok) => grade.checks.push({ name, ok });
    const [min, max] = profile.channel;
    check(`channel posts ${min}-${max}`, channelPosts.length >= min && channelPosts.length <= max);
    check('no request-thread post', !posts.some((post) => post.label === 'request-thread'));
    grade.tails = authored.flatMap((message) =>
        tailPhrases.filter((phrase) => message.content.toLowerCase().includes(phrase))
    );
    check('no tail phrase', grade.tails.length === 0);
    grade.doneSends = doneSends;
    check(
        'no --done send to a working Thread',
        profile.inThread || !doneSends.some((send) => isThreadTarget(send.target))
    );
    const ownReactions = (wake.reactions ?? []).filter((reaction) =>
        reaction.actors.some((actor) => actor.kind === 'agent' && actor.id === agentId)
    );
    if (profile.reaction) {
        grade.reactions = ownReactions.length;
        check('no sends after thanks', posts.length === 0);
        check('one reaction on thanks', ownReactions.length === 1);
        return grade;
    }
    const candidates = profile.inThread
        ? posts.filter((post) => post.chatId === wake.chatId)
        : channelPosts;
    const result = candidates.findLast((post) => profile.result?.(post) ?? true) ?? null;
    grade.result = result;
    check('result post found', Boolean(result));
    if (!result) {
        return grade;
    }
    gradeResult({ candidates, check, doneSends, grade, ownReactions, profile, result, wake });
    return grade;
}

function gradeResult({ candidates, check, doneSends, grade, ownReactions, profile, result, wake }) {
    if (profile.inThread) {
        check('result in the asked Thread', result.chatId === wake.chatId);
        check('one Thread post', candidates.length === 1);
    } else if (profile.inChat) {
        // A fire answer has no request to reply to: it only has to land in the anchor chat.
        check('result in the anchor chat', result.chatId === wake.chatId);
    } else {
        check('result is an inline reply', result.label === 'inline-reply');
    }
    // The journal is the source for both flags: `--done` ends the typing
    // indicator, and `--reply-to` (or a Thread send) is what notifies the asker.
    const send = doneSends.find((entry) => entry.body.trim() === result.content.trim());
    grade.finished = result.finished;
    grade.repliesToRequest = profile.inThread
        ? Boolean(send)
        : Boolean(send && refersTo(send.replyTo, wake.id)) || result.replyTo === wake.id;
    check(`result <= ${profile.cap} words`, result.words <= profile.cap);
    grade.questions = (result.content.match(/\?/gu) ?? []).length;
    if (profile.maxQuestions !== undefined) {
        check(`questions <= ${profile.maxQuestions}`, grade.questions <= profile.maxQuestions);
    }
    if (profile.noUrl) {
        check('no URL in the result', !/https?:\/\//iu.test(result.content));
    }
    if (profile.noReactions) {
        check('no reaction on the question', ownReactions.length === 0);
    }
    if (profile.options) {
        // The judge decides which option is the pick; naming both is worth seeing.
        grade.optionsNamed = profile.options.filter((option) => option.test(result.content)).length;
    }
}

function priorContext(messages, wake) {
    return messages
        .filter((message) => Date.parse(message.createdAt) < Date.parse(wake.createdAt))
        .slice(-4)
        .map((message) => `${message.author.kind}: ${message.content}`);
}
