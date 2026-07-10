import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**']),
  {
    files: ['components/favicon-image.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
])
