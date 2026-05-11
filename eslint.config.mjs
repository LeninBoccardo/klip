import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // TS already validates props at compile time — runtime PropTypes are redundant.
      'react/prop-types': 'off',
      // Honor the `_` prefix as an explicit "intentionally unused" marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  // Auto-generated shadcn primitives intentionally co-export hooks/variants
  // alongside components; rewriting them would diverge from upstream and
  // re-break on every `npx shadcn add`. The `explicit-function-return-type`
  // rule is also disabled here — these files are regenerated, so hand-
  // annotating return types fights the generator.
  {
    files: ['src/renderer/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  // TanStack Router file routes export `Route = createFileRoute(...)(...)`
  // alongside the route component. The plugin doesn't recognise the router's
  // function-call factory as a constant, so allowExportNames/allowConstantExport
  // don't help — disabling the rule for the routes directory is the cleanest
  // fit for this codebase's one-file-per-route pattern.
  {
    files: ['src/renderer/src/routes/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  // Test files: prioritise readability over return-type annotations. Tests
  // are read top-to-bottom and the assertion vocabulary makes return shapes
  // obvious; explicit annotations would just be noise.
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  // Playwright fixture callbacks receive a `use` argument that the
  // react-hooks rule misreads as React's `use()` hook. The fixture files
  // are not React code, so the rule does not apply.
  {
    files: ['tests/e2e/fixtures/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off'
    }
  },
  eslintConfigPrettier
)
