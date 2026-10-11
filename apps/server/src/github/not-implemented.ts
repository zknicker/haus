/**
 * A GitHub App seam whose implementation has not landed. Stubs throw this
 * rather than succeed silently, so a caller wired early fails loudly.
 */
export class GithubNotImplementedError extends Error {
    constructor(what: string) {
        super(`${what} is not implemented yet.`);
        this.name = 'GithubNotImplementedError';
    }
}
