// npm run lint — 선언하지 않은 이름(전역 공유 실수)과 기본 실수를 잡는다
import globals from 'globals';
export default [
  { ignores: ['app/**', 'dist/**', 'build/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error' },
  },
  {
    files: ['*.mjs', 'tools/**/*.mjs', 'tests/**/*.mjs', 'desktop/**/*.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
  { files: ['desktop/**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
];
