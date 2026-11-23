import { hugeiconsProOnly } from './hugeicons-pro-only.mjs';
import { testRule } from './rule-tester.mjs';

testRule('hugeicons-pro-only', hugeiconsProOnly, {
    valid: [
        "import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';",
        "import type { IconSvgElement } from '@hugeicons/react';",
        "export { UserIcon } from '@hugeicons-pro/core-stroke-rounded';",
    ],
    invalid: [
        {
            code: "import { Cancel01Icon } from '@hugeicons/core-free-icons';",
            errors: [{ messageId: 'freeIcons' }],
        },
        {
            code: "export { Plus } from '@hugeicons/core-free-icons';",
            errors: [{ messageId: 'freeIcons' }],
        },
        {
            code: "export * from '@hugeicons/core-free-icons';",
            errors: [{ messageId: 'freeIcons' }],
        },
        {
            code: "const icons = import('@hugeicons/core-free-icons');",
            errors: [{ messageId: 'freeIcons' }],
        },
    ],
});
