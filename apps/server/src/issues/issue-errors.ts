export class IssueNotFoundError extends Error {
    constructor(message = 'No Issue exists with that id on this Server.') {
        super(message);
        this.name = 'IssueNotFoundError';
    }
}

export class IssueConflictError extends Error {
    constructor(current: number, expected: number) {
        super(`The Issue changed (version ${current}, expected ${expected}). Reload and retry.`);
        this.name = 'IssueConflictError';
    }
}

export class IssueInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IssueInvariantError';
    }
}

export class IssueTakenError extends Error {
    readonly holder: string;

    constructor(code: string, holder: string) {
        super(`${code} is assigned to ${holder}, not the assignee you expected.`);
        this.name = 'IssueTakenError';
        this.holder = holder;
    }
}

export class IssueAssigneeArchivedError extends Error {
    constructor(code: string | null) {
        super(
            `${code ?? 'An open Issue'} cannot be assigned to an archived Task. Assign it to someone active, or unarchive the Task first.`
        );
        this.name = 'IssueAssigneeArchivedError';
    }
}

export class IssueParentProjectError extends Error {
    constructor() {
        super('A parent Issue must be in the same Project.');
        this.name = 'IssueParentProjectError';
    }
}

export class IssueParentCycleError extends Error {
    constructor(code: string, parent: string) {
        super(`${parent} is ${code} or one of its sub-issues, so it cannot be its parent.`);
        this.name = 'IssueParentCycleError';
    }
}

export class IssueProjectNotHomeError extends Error {
    readonly nextAction: string;

    constructor(code: string | null) {
        super(
            code
                ? `${code} is in another Project and not assigned to you, so you cannot change it.`
                : 'You file Issues only in your own Project.'
        );
        this.name = 'IssueProjectNotHomeError';
        this.nextAction =
            "@mention that Project's Captain in its channel with the request; it changes the Issue.";
    }
}

export function requireIssueVersion(current: number, expected: number) {
    if (current !== expected) {
        throw new IssueConflictError(current, expected);
    }
}
