import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  // Flat-config ignores are rooted at the workspace. Generated package output
  // such as apps/admin/dist must be excluded explicitly; linting a minified
  // bundle produces false source errors and hides the real code result.
  { ignores: ['node_modules/**', '**/dist/**', '**/coverage/**', 'artifacts/**', 'design_refs/**', 'work/**', '.venv-litellm/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      globals: {
        localStorage: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
      },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/require-v-for-key': 'off',
      'vue/valid-v-for': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off'
    }
  }
];
