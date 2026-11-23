export const computerTargetDescription =
    'Run on another Computer, by name or id from `haus computer list`. Omit to run on your Machine.';

export const computerTargetBounds = { maxLength: 200, minLength: 1, pattern: '\\S' } as const;
