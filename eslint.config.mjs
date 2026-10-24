import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  // Flat-config ignores are rooted at the workspace. Generated package output
  // such as apps/admin/dist must be excluded explicitly; linting a minified
  // bundle produces false source errors and hides the real code result. The
  // Capacitor native projects are excluded for the same reason: `cap sync`
  // copies the built web bundle into android/app/src/main/assets/public and
  // ios/App/App/public, and those files are generated, not source.
  { ignores: ['node_modules/**', '**/dist/**', '**/coverage/**', 'artifacts/**', 'design_refs/**', 'work/**', '.venv-litellm/**', 'apps/mp/android/**', 'apps/mp/ios/**'] },
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
  },
  {
    // Plain Node ESM/CJS scripts — the migration, UI V2 and verification helpers under scripts/ and
    // apps/api/. They are not part of a tsconfig, so without this block they fall back to
    // js.configs.recommended, which reports every use of `process` and `console` as undefined.
    // Only `no-undef` is turned off: declaring the globals instead collides with the scripts that
    // already import them from `node:process`/`node:console` (`no-redeclare`).
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
];
