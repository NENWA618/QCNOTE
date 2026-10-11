import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import js from '@eslint/js'
import globals from 'globals'

export default defineConfig([
  ...nextVitals,
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      // eslint-plugin-react-hooks 7 的新规则，现有代码尚未适配，先降级为警告
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/js/**']),
])
