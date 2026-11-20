import { cloudAgentStatusWrites } from './cloud-agent-status-writes.mjs';
import { computerNoModelCalls } from './computer-no-model-calls.mjs';
import { configEnvLoader } from './config-env-loader.mjs';
import { herouiCompoundChildren } from './heroui-compound-children.mjs';
import { herouiDialogForm } from './heroui-dialog-form.mjs';
import { herouiSpacingOverride } from './heroui-spacing-override.mjs';
import { runnerBoundary } from './runner-boundary.mjs';
import { updateRequiredCode } from './update-required-code.mjs';

/** The repo's own Oxlint rules, registered as `haus/<rule>` in oxlint.config.mts. */
export default {
    meta: { name: 'haus' },
    rules: {
        'cloud-agent-status-writes': cloudAgentStatusWrites,
        'computer-no-model-calls': computerNoModelCalls,
        'config-env-loader': configEnvLoader,
        'heroui-compound-children': herouiCompoundChildren,
        'heroui-dialog-form': herouiDialogForm,
        'heroui-spacing-override': herouiSpacingOverride,
        'runner-boundary': runnerBoundary,
        'update-required-code': updateRequiredCode,
    },
};
