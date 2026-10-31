'use strict';

const { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function createNativeAuthStore({
    app,
    safeStorage,
    fs = { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync },
}) {
    const filePath = path.join(app.getPath('userData'), 'app-auth.bin');
    let memory;

    function read() {
        if (memory !== undefined) {
            return copy(memory);
        }
        if (!(safeStorage.isEncryptionAvailable() && fs.existsSync(filePath))) {
            memory = null;
            return null;
        }
        try {
            const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(filePath)));
            memory = parseCredentials(value);
            if (!memory) {
                clearFile();
            }
        } catch {
            clearFile();
        }
        return copy(memory);
    }

    function write(value) {
        const credentials = parseCredentials(value);
        if (!credentials) {
            throw new TypeError('Desktop sign-in credentials are invalid.');
        }
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Haus could not securely store sign-in credentials.');
        }
        const temporaryPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
        fs.writeFileSync(temporaryPath, safeStorage.encryptString(JSON.stringify(credentials)), {
            mode: 0o600,
        });
        fs.renameSync(temporaryPath, filePath);
        memory = credentials;
    }

    function clearFile() {
        memory = null;
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    function clear() {
        clearFile();
    }

    return { clear, read, write };
}

function parseCredentials(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const { accessToken, accessExpiresAt, refreshToken, sessionToken } = value;
    if (
        (accessToken != null && typeof accessToken !== 'string') ||
        (refreshToken != null && typeof refreshToken !== 'string') ||
        (sessionToken != null && typeof sessionToken !== 'string') ||
        (accessExpiresAt != null &&
            (typeof accessExpiresAt !== 'number' || !Number.isFinite(accessExpiresAt)))
    ) {
        return null;
    }
    if (!(accessToken || refreshToken || sessionToken)) {
        return null;
    }
    return {
        accessExpiresAt: accessExpiresAt ?? null,
        accessToken: accessToken ?? null,
        refreshToken: refreshToken ?? null,
        sessionToken: sessionToken ?? null,
    };
}

function copy(value) {
    return value ? { ...value } : null;
}

module.exports = { createNativeAuthStore, parseCredentials };
