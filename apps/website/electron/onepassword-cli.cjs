'use strict';

const { execFile } = require('node:child_process');
const { existsSync } = require('node:fs');

/**
 * The local 1Password CLI as desktop main runs it: under 1Password's
 * desktop-app integration, so every call is approved in 1Password itself
 * (Touch ID). Failures map to a reason the settings UI can explain; stdout is
 * never echoed back, and anything shaped like a token is masked.
 */

/** GUI apps launched from Finder get a minimal PATH; `op` usually lives in one of these. */
const opCandidates = ['/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op'];

const approvalTimeoutMs = 120_000;

function runOp(args) {
    const opPath = opCandidates.find((candidate) => existsSync(candidate));
    if (!opPath) {
        return Promise.reject(Object.assign(new Error('op not found'), { code: 'op-missing' }));
    }
    return new Promise((resolve, reject) => {
        execFile(
            opPath,
            args,
            { maxBuffer: 4 * 1024 * 1024, timeout: approvalTimeoutMs },
            (error, stdout, stderr) => {
                if (error) {
                    reject(Object.assign(error, { stderr }));
                } else {
                    resolve(stdout);
                }
            }
        );
    });
}

/** Maps `op` failures to `{ status: 'unavailable', reason, message }`. */
function describeOpFailure(error) {
    if (error?.code === 'ENOENT' || error?.code === 'op-missing') {
        return unavailable(
            'op-missing',
            'Install the 1Password CLI (op) on this Mac, then try again.'
        );
    }
    const stderr = String(error?.stderr ?? '').toLowerCase();
    if (error?.killed) {
        return unavailable('timeout', '1Password approval timed out. Try again.');
    }
    if (stderr.includes('desktop app') || stderr.includes('integration')) {
        return unavailable(
            'integration-off',
            'Turn on 1Password → Settings → Developer → “Integrate with 1Password CLI”, then try again.'
        );
    }
    if (stderr.includes('dismissed') || stderr.includes('denied') || stderr.includes('cancel')) {
        return unavailable('denied', '1Password approval was declined.');
    }
    return unavailable(
        'op-failed',
        String(error?.stderr ?? error?.message ?? '1Password failed.')
            .replaceAll(/ops_[A-Za-z0-9+/=_-]+/g, '[token]')
            .trim()
            .slice(0, 300) || '1Password failed.'
    );
}

function unavailable(reason, message) {
    return { message, reason, status: 'unavailable' };
}

function parseJsonArray(stdout) {
    const parsed = JSON.parse(stdout || '[]');
    if (!Array.isArray(parsed)) {
        throw new Error('1Password returned an unexpected response.');
    }
    return parsed;
}

module.exports = { describeOpFailure, parseJsonArray, runOp, unavailable };
