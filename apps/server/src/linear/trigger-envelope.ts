import { deliveryToken } from './event-projection/fields.ts';
import type { LinearProjection } from './event-projection/types.ts';

// The Server-built lines a `linear` fire adds to the `type=trigger` envelope
// (specs/linear-triggers.md#envelope). The `Linear:` line carries only
// enumerated values, state names, and the issue identifier; titles, bodies,
// and descriptions stay in the indented, untrusted excerpt.

const summaryMaxChars = 200;
const separator = ' · ';
const identifierPattern = /^[A-Z][A-Z0-9]{0,9}-\d{1,9}$/u;

/** What `triggerEnvelope` adds for a `linear` fire. */
export interface LinearEnvelopeLines {
    /** `delivery=<id>` provenance segment value. */
    delivery: string;
    /** `linear-event=<event>.<action>` provenance segment value. */
    eventAction: string;
    /** The `Linear:` line, without its label. */
    summary: string;
}

export function linearEnvelopeLines(input: {
    deliveryId: string;
    projection: LinearProjection;
}): LinearEnvelopeLines {
    const action = enumerated(input.projection.action);
    const event = input.projection.event;
    return {
        delivery: deliveryToken(input.deliveryId),
        eventAction: action ? `${event}.${action}` : event,
        summary: linearSummary(input.projection),
    };
}

export function linearSummary(projection: LinearProjection): string {
    const action = enumerated(projection.action);
    const parts = [action ? `${projection.event} ${action}` : projection.event];
    if (projection.event === 'issue') {
        const { issue } = projection;
        parts.push(issue.changed.join(', '));
        if (issue.previousState) {
            // Linear's `updatedFrom` names only the previous state's id.
            const from = stateName(issue.previousState.name);
            const to = stateName(issue.state?.name ?? null);
            parts.push(to ? `${from ? `${from} ` : ''}→ ${to}` : '');
        }
        parts.push(identifier(issue.identifier) ?? '');
    } else if (projection.event === 'comment') {
        parts.push(identifier(projection.comment.issue.identifier) ?? '');
    } else {
        parts.push(projection.project.changed.join(', '));
    }
    const line = parts.filter((part) => part.length > 0).join(separator);
    return line.length > summaryMaxChars ? `${line.slice(0, summaryMaxChars - 1)}…` : line;
}

/** Linear's own vocabulary: lower-case words. */
function enumerated(value: string): string | null {
    return /^[a-z_]{1,40}$/u.test(value) ? value : null;
}

function identifier(value: string | null): string | null {
    return value && identifierPattern.test(value) ? value : null;
}

/** A state name keeps `[A-Za-z0-9 _.-]` up to 40 characters, or is dropped. */
function stateName(value: string | null): string | null {
    const cleaned =
        value
            ?.replace(/[^A-Za-z0-9 _.-]/gu, '')
            .trim()
            .slice(0, 40) ?? '';
    return cleaned.length > 0 ? cleaned : null;
}
