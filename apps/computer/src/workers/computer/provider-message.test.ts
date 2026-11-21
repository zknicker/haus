import { expect, test } from 'bun:test';
import { providerMessage } from './turn-launch.ts';

test('a provider error reads as its own message, not its JSON', () => {
    expect(
        providerMessage(
            '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6.2-sol\' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}'
        )
    ).toBe("The 'gpt-6.2-sol' model is not supported when using Codex with a ChatGPT account.");
    expect(providerMessage('{"message":"Rate limited."}')).toBe('Rate limited.');
    expect(providerMessage('The harness exited with code 1.')).toBeNull();
    expect(providerMessage('{"status":500}')).toBeNull();
});
