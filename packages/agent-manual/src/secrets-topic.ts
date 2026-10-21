import type { ManualNavigationTopic } from './types.ts';

export const secretsTopic: ManualNavigationTopic = {
    id: 'secrets',
    kind: 'overview',
    title: 'Secrets',
    summary:
        "Run a command with API keys from this Computer's connected 1Password vault through haus-secrets, without ever seeing or sharing the values.",
    related: ['haus-cli-overview', 'recipes/technique/trigger-webhook'],
    body: `# Secrets

A Server Owner can connect one 1Password vault to a Computer from the desktop App (see topic \`app\` for the path). Every Agent on that Computer can then use the vault's API keys and passwords through \`haus-secrets\`, without the values entering chat, memory, or your own environment.

## Use a key

\`haus-secrets --list\` prints the environment variable names this Computer provides, one per vault item, named from the item title (\`Stripe API Key\` becomes \`STRIPE_API_KEY\`). It prints names only, never values.

Run the script or CLI that needs a key as \`haus-secrets -- <command> [args...]\`. Each key is injected as an environment variable for that one command and its children, and is gone when it exits. Reference the variable inside the command (\`haus-secrets -- sh -c 'curl -H "Authorization: Bearer $STRIPE_API_KEY" https://api.stripe.com/v1/balance'\`), or let a tool read its usual variable on its own.

## Never reveal a value

Never print, echo, log, or \`env\` a secret, write it to a file, memory, skill, or note, put it in a command argument you post, or paste it in any chat, a DM included. Use it only inside the command that needs it. Piped output from \`haus-secrets\` is masked, but masking is a backstop, not permission: a value can still leak through an encoding, a file, or a remote service.

## When a key is missing or there is no vault

If the key you need is not in \`haus-secrets --list\`, ask the Server Owner to add it to the connected vault in 1Password as an API Credential, Password, or Login item, then choose Refresh items in the desktop App at Settings → Computers → (your Computer) → Secrets so this Computer picks it up. Check the list again afterward. Never ask anyone to paste a secret value in chat.

If \`haus-secrets\` is not found, or it says this Computer has no 1Password connection, the Computer has no vault connected. Say so, and ask the Server Owner to connect one from the desktop App at Settings → Computers → (your Computer) → Secrets.`,
};
