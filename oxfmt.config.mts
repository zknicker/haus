import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
    ...ultracite,
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    trailingComma: 'es5',
    ignorePatterns: [
        ...(ultracite.ignorePatterns ?? []),
        '.claude/settings.local.json',
        '.context',
        'apps/ios-swift/**/*.xcassets',
        'apps/ios-swift/Sources/HausUI/Resources/*-icons.json',
        'apps/ios-swift/Sources/HausUI/Resources/emoji-catalog.json',
        'apps/server/dist',
        'apps/server/drizzle/postgres/meta',
        'apps/website/dist',
        'apps/website/src-tauri/gen/schemas',
        'apps/website/src/components/charts',
        'assets/christmas-icon.icon',
        'assets/halloween-icon.icon',
        'assets/ios-icon/manifest.json',
        'assets/mac-icon.icon',
        // Biome formatted only scripts and JSON; keep the same scope.
        '**/*.css',
        '**/*.html',
        '**/*.md',
        '**/*.mdx',
        '**/*.toml',
        '**/*.yaml',
        '**/*.yml',
    ],
});
