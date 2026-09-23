// Bun imports a pnpm patch shipped to a bridge install `with { type: 'text' }`.
declare module '*.patch' {
    const content: string;
    export default content;
}
