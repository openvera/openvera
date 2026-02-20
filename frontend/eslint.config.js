import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { includeIgnoreFile } from '@eslint/compat'
import js from '@eslint/js'
import stylisticPlugin from '@stylistic/eslint-plugin'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importXPlugin from 'eslint-plugin-import-x'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gitignorePath = path.resolve(__dirname, '..', '.gitignore')

export default tseslint.config([
  includeIgnoreFile(gitignorePath),
  { ignores: ['dist/'] },

  // Base
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'sort-imports': 'off',
    },
  },

  // TypeScript
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // React
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ...reactPlugin.configs.recommended.parserOptions,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // Not needed with React 19 automatic JSX runtime
      'react/react-in-jsx-scope': 'off',
      'react/jsx-tag-spacing': 'off',
    },
  },

  // Stylistic
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      '@stylistic': stylisticPlugin,
    },
    rules: {
      ...stylisticPlugin.configs.recommended.rules,
      '@stylistic/semi': 'off',
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'none',
            requireLast: true,
          },
          singleline: {
            delimiter: 'semi',
            requireLast: false,
          },
          overrides: {
            interface: {
              multiline: {
                delimiter: 'semi',
                requireLast: true,
              },
            },
            typeLiteral: {
              multiline: {
                delimiter: 'semi',
                requireLast: true,
              },
            },
          },
        },
      ],
      '@stylistic/no-multiple-empty-lines': 'off',
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/array-bracket-spacing': 'off',
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
      '@stylistic/jsx-tag-spacing': 'off',
      '@stylistic/jsx-one-expression-per-line': 'off',
      '@stylistic/jsx-curly-newline': 'off',
      '@stylistic/jsx-wrap-multilines': [
        'error',
        {
          declaration: 'parens-new-line',
          assignment: 'parens-new-line',
          return: 'parens-new-line',
          arrow: 'ignore',
          condition: 'ignore',
          logical: 'parens-new-line',
          prop: 'ignore',
        },
      ],
      '@stylistic/padded-blocks': 'off',
      '@stylistic/block-spacing': 'off',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/object-curly-newline': ['error', {
        ImportDeclaration: { multiline: true, consistent: true },
      }],
      '@stylistic/arrow-parens': 'off',
      '@stylistic/brace-style': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/operator-linebreak': [
        'error',
        'before',
        {
          overrides: {
            '&&': 'after',
            '||': 'after',
          },
        },
      ],
      '@stylistic/comma-dangle': [
        'warn',
        {
          arrays: 'ignore',
          objects: 'ignore',
          enums: 'ignore',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'ignore',
        },
      ],
    },
  },

  // Import-x
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      'import-x': importXPlugin,
    },
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      ...importXPlugin.configs.recommended.rules,
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-extraneous-dependencies': ['error', {
        devDependencies: [
          '**/*.test.{js,ts,tsx}',
          '**/*.spec.{js,ts,tsx}',
          '**/vite.config.{js,ts}',
          '**/eslint.config.{js,ts}',
        ],
        optionalDependencies: false,
        peerDependencies: true,
        includeTypes: false,
      }],
    },
  },

  // Simple import sort
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Node built-ins
            ['^node:'],
            // React, then third-party packages
            ['^react', '^@?\\w'],
            // Internal aliases (src/)
            ['^@/'],
            // Parent imports
            ['^\\.\\.'],
            // Sibling imports
            ['^\\.'],
            // Style imports last
            ['\\.css$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
])
