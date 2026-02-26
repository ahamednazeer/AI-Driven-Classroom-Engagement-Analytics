import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
    ...nextVitals,
    ...nextTypescript,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@next/next/no-html-link-for-pages': 'off',
            'react/no-unescaped-entities': 'off',
        },
    },
];

export default eslintConfig;
