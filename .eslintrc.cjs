module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  // vue-eslint-parser handles .vue files and delegates <script> blocks to the TypeScript
  // parser. Without this, every `<script setup lang="ts">` block fails to parse and the
  // whole lint run collapses into "Parsing error" noise that hides real findings.
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
    extraFileExtensions: ['.vue']
  },
  ignorePatterns: [
    'node_modules/',
    '.nuxt/',
    'dist/',
    '.output/',
    'android/',
    'ios/',
    'static/',
    'assets/ebooks/**',
    'strings/generated/**'
  ],
  plugins: ['vue', '@typescript-eslint'],
  // Correctness, not layout: Prettier owns formatting, so the Vue and TypeScript style presets
  // (attribute order, line breaks, self-closing tags) stay off. Every rule here is an error, and
  // scripts/lint.mjs fails on any finding that is not in scripts/lint-baseline.json.
  extends: ['eslint:recommended', 'plugin:vue/vue3-essential', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // TypeScript reports an undefined name, and knows Nuxt's auto-imports; this rule does not
    // and would flag every one of them.
    'no-undef': 'off',
    // .prettierrc sets "semi": false, which makes Prettier emit a leading `;(` on lines
    // that start with a parenthesis. eslint:recommended's no-extra-semi flags exactly that,
    // so the two tools would undo each other on every save.
    'no-extra-semi': 'off',
    'no-console': 'off',
    // The TypeScript version understands types and `_` for a deliberately unused argument.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    // Nuxt names pages by route (pages/index.vue), not by component.
    'vue/multi-word-component-names': 'off'
  },
  overrides: [
    {
      // Rules that need the type checker. The bugs in this app have mostly been in async
      // decision logic - a pause discarded inside a callback, a request nobody waited for -
      // which is exactly what these see and nothing else does.
      files: ['*.ts', '*.vue'],
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        extraFileExtensions: ['.vue']
      },
      rules: {
        // A promise nobody awaits or catches: its failure vanishes, and its result arrives in
        // whatever order it likes. `void promise` marks the deliberate ones.
        '@typescript-eslint/no-floating-promises': 'error',
        // An async function where a plain callback is expected - an event handler, forEach -
        // whose rejection nothing will ever see.
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        // A switch over a union that forgets a member.
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        // A check the types say can never be false: either dead code, or types that are wrong
        // about what the server sends.
        '@typescript-eslint/no-unnecessary-condition': 'error'
      }
    },
    {
      files: ['*.js', '*.cjs', '*.mjs'],
      rules: { '@typescript-eslint/no-var-requires': 'off' }
    }
  ]
}
