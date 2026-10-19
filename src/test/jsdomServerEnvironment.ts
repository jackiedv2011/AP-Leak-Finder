import { builtinEnvironments, type Environment } from 'vitest/environments'

/**
 * jsdom for the browser half, and Vite's node pipeline (the one
 * `// @vitest-environment node` server tests run in) for the modules.
 *
 * Front-end tests that start a real server (see liveServer.ts) need this:
 * the plain jsdom pipeline only treats names in `module.builtinModules` as
 * Node built-ins, and on Node 22 that list leaves out prefix-only modules such
 * as `node:sqlite`, so loading server/db.ts fails with "Cannot bundle Node.js
 * built-in". Opt in per file with
 * `// @vitest-environment ./src/test/jsdomServerEnvironment.ts`.
 */
export default {
  ...builtinEnvironments.jsdom,
  name: 'jsdom-server',
  viteEnvironment: 'ssr',
} satisfies Environment
