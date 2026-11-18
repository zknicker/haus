import { cloudAgentStatusWrites } from './cloud-agent-status-writes.mjs';
import { herouiCompoundChildren } from './heroui-compound-children.mjs';
import { herouiDialogForm } from './heroui-dialog-form.mjs';
import { herouiSpacingOverride } from './heroui-spacing-override.mjs';

/** The repo's own Oxlint rules, registered as `haus/<rule>` in oxlint.config.mts. */
export default {
    meta: { name: 'haus' },
    rules: {
        'cloud-agent-status-writes': cloudAgentStatusWrites,
        'heroui-compound-children': herouiCompoundChildren,
        'heroui-dialog-form': herouiDialogForm,
        'heroui-spacing-override': herouiSpacingOverride,
    },
};
