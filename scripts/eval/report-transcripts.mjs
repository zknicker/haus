// Representative transcripts for the HTML report: one chat pane per build per
// scenario, with a badge for where each Agent post landed and whether it went
// out with `--done`.

import { escapeHtml } from './markdown.mjs';
import { representative, runnerCause } from './summary.mjs';

const bodyLimit = 700;

/** Plain-language placement badges, worded the way the asker experiences them. */
export const placementBadges = {
    'asked-thread': { text: 'in the thread they asked in', tone: 'ok' },
    'inline-reply': { text: 'reply in channel', tone: 'ok' },
    'other-thread': { text: 'some other thread', tone: 'warn' },
    'request-thread': { text: 'thread under the request', tone: 'bad' },
    'top-level': { text: 'channel, not a reply', tone: 'bad' },
    'working-thread': { text: 'thread under its own note', tone: 'ok' },
};

const speakers = { agent: 'Agent', human: 'Human', peer: 'Peer', seeded: 'Seeded' };

export function renderTranscripts({ builds, grades, labels, scenarios }) {
    return scenarios
        .map((scenario) => {
            const panes = builds.map((build) =>
                renderPane(
                    labels[build],
                    representative(grades[build].filter((grade) => grade.scenario === scenario))
                )
            );
            return `<h3 style="margin-top:22px">${escapeHtml(scenario)}</h3>\n<div class="chat">\n${panes.join('\n')}\n</div>`;
        })
        .join('\n');
}

function renderPane(label, grade) {
    if (!grade) {
        return `<div class="pane"><div class="ph"><b>${escapeHtml(label)}</b><span>no run</span></div><p class="empty">No graded run for this build.</p></div>`;
    }
    const status = grade.infra ? 'infra failure' : grade.ok ? 'pass' : 'fail';
    const header = `<div class="ph"><b>${escapeHtml(label)}</b><span>${status} · pass ${grade.pass} · ${escapeHtml(grade.stamp)}</span></div>`;
    const rows = (grade.timeline ?? []).map((entry) => renderMessage(entry, grade));
    const body =
        rows.length > 0 ? rows.join('\n') : '<p class="empty">No messages were captured.</p>';
    return `<div class="pane">${header}\n${body}\n${renderVerdict(grade)}</div>`;
}

function renderMessage(entry, grade) {
    const tags = [];
    const badge = entry.label ? placementBadges[entry.label] : null;
    if (badge) {
        tags.push(tag(badge.text, badge.tone));
    }
    if (entry.who === 'seeded') {
        tags.push(tag('seeded by the harness'));
    }
    if (entry.finished) {
        tags.push(tag('marked finished', 'ok'));
    } else if (grade.result?.id === entry.id) {
        tags.push(tag('not marked finished', 'warn'));
    }
    for (const emoji of entry.reactions ?? []) {
        tags.push(tag(`${emoji} reaction`));
    }
    const thread = entry.where === 'thread' ? ' thread' : '';
    return `<div class="msg"><span class="who">${speakers[entry.who] ?? 'Agent'}</span><div class="body${thread}">${escapeHtml(clip(entry.content))}${tags.join('')}</div></div>`;
}

function renderVerdict(grade) {
    if (grade.infra) {
        return `<div class="verdict warn">Infra: ${escapeHtml(runnerCause(grade.error))}</div>`;
    }
    const failed = grade.checks.filter((check) => !check.ok).map((check) => check.name);
    if (grade.ok && failed.length === 0) {
        return '';
    }
    const reasons = [...(grade.ok ? [] : [`runner: ${runnerCause(grade.error)}`]), ...failed];
    const tone = grade.ok ? 'warn' : 'bad';
    return `<div class="verdict ${tone}">${escapeHtml(reasons.join(' · '))}</div>`;
}

function tag(text, tone = '') {
    return `<span class="tag${tone ? ` ${tone}` : ''}">${escapeHtml(text)}</span>`;
}

function clip(text) {
    const value = String(text ?? '').trim();
    return value.length > bodyLimit ? `${value.slice(0, bodyLimit)}…` : value;
}
