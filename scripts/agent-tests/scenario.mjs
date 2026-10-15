// Scenario shape plus the dependency-free expectation helper the kit hands to
// every scenario. Assertions are recorded so a failing run can report the exact
// gate that failed alongside the observed value.

export const scenarioKind = 'agent-test-scenario';

/**
 * Declares one agent-behavior scenario.
 *
 * `agents` declares the Agents to create for this scenario by kind:
 * `{ kind: 'worker' }`. `run` receives
 * `{ agents, expect, kit, log, marker, settleTurn }`.
 */
export function defineScenario({ agents = [], contract = '', name, optIn = false, run }) {
    if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('A scenario needs a name.');
    }
    if (typeof run !== 'function') {
        throw new Error(`Scenario ${name} needs a run function.`);
    }
    return Object.freeze({
        agents: agents.map(normalizeAgentRequest),
        contract,
        kind: scenarioKind,
        name: name.trim(),
        optIn,
        run,
    });
}

export function isScenario(value) {
    return Boolean(value) && value.kind === scenarioKind;
}

export class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssertionError';
    }
}

/**
 * Builds an `expect(actual, label)` helper. Every check appends
 * `{ label, ok, message }` to `record`, so the transcript keeps the passing
 * gates too, not only the failure.
 */
export function createExpect(record = []) {
    function check(ok, label, message) {
        record.push(ok ? { label, ok: true } : { label, message, ok: false });
        if (!ok) {
            throw new AssertionError(message);
        }
    }

    return function expect(actual, label = 'value') {
        return {
            toBe(expected) {
                check(
                    Object.is(actual, expected),
                    label,
                    `${label}: expected ${format(expected)}, got ${format(actual)}`
                );
            },
            toBeGreaterThan(expected) {
                const message = `${label}: expected a number greater than ${format(expected)}, got ${format(actual)}`;
                check(typeof actual === 'number' && actual > expected, label, message);
            },
            toBeTruthy() {
                const message = `${label}: expected a truthy value, got ${format(actual)}`;
                check(Boolean(actual), label, message);
            },
            toContain(expected) {
                check(
                    containsValue(actual, expected),
                    label,
                    `${label}: expected ${describeContainer(actual)} to contain ${format(expected)}`
                );
            },
            toHaveLength(expected) {
                const length = actual?.length;
                const message = `${label}: expected length ${format(expected)}, got ${format(length)} in ${describeContainer(actual)}`;
                check(length === expected, label, message);
            },
        };
    };
}

export function format(value, limit = 240) {
    if (typeof value === 'string') {
        return truncate(JSON.stringify(value), limit);
    }
    if (value === undefined) {
        return 'undefined';
    }
    try {
        return truncate(JSON.stringify(value), limit);
    } catch {
        return truncate(String(value), limit);
    }
}

function containsValue(actual, expected) {
    if (typeof actual === 'string') {
        return actual.includes(String(expected));
    }
    if (Array.isArray(actual)) {
        return actual.some((entry) =>
            typeof entry === 'string' && typeof expected === 'string'
                ? entry.includes(expected)
                : Object.is(entry, expected)
        );
    }
    return false;
}

function describeContainer(value) {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => format(entry, 120)).join(', ')}]`;
    }
    return format(value);
}

function normalizeAgentRequest(request) {
    const normalized = typeof request === 'string' ? { kind: request } : { ...request };
    if (normalized.kind !== 'worker') {
        throw new Error(`Unknown agent kind ${format(normalized.kind)}; use worker.`);
    }
    // A provisioned Agent is new, so there is no workspace or session state a
    // scenario could ask to clear: the kind is the whole request.
    return Object.freeze({ kind: normalized.kind });
}

function truncate(value, limit) {
    const text = value ?? 'undefined';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
