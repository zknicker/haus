import { herouiSpacingOverride } from './heroui-spacing-override.mjs';
import { testRule } from './rule-tester.mjs';

const allow = [{ allow: { 'features/onboarding/split.tsx': 'hosts a full-bleed split' } }];

testRule(
    'heroui-spacing-override',
    herouiSpacingOverride,
    {
        valid: [
            '<Card.Content className="flex flex-col">body</Card.Content>',
            '<Card className="p-0.5" />',
            '<div className="p-0" />',
            '<Button className="gap-0" />',
            {
                code: '<Card.Content className="p-0" />',
                filename: '/repo/apps/website/src/features/onboarding/split.tsx',
                options: allow,
            },
        ],
        invalid: [
            {
                code: '<Card.Content className="flex p-0">body</Card.Content>',
                errors: [{ messageId: 'cancelledSpacing' }],
            },
            {
                code: "<Modal.Body className={'gap-0'} />",
                errors: [{ messageId: 'cancelledSpacing' }],
            },
            {
                code: '<ItemCardGroup className="md:px-0" />',
                errors: [{ messageId: 'cancelledSpacing' }],
            },
            {
                code: '<Card className="p-4" />',
                filename: '/repo/apps/website/src/features/onboarding/split.tsx',
                options: allow,
                errors: [{ messageId: 'staleAllowance' }],
            },
        ],
    },
    'tsx'
);
