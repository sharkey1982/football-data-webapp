import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'games']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The server-render entry for the static build (scripts/generate-static.mjs)
    // exports render functions by design and is never hot-reloaded, so the
    // fast-refresh rule has nothing to protect there.
    files: ['src/entry-server.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
