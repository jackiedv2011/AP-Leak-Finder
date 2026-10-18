// Lets plain `node` load the app's src/ modules: maps the `@/` alias to src/
// and adds the `.ts` extension that Vite resolves implicitly.
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const src = fileURLToPath(new URL('../../src/', import.meta.url))

registerHooks({
  resolve(specifier, context, next) {
    let target = null
    if (specifier.startsWith('@/')) target = path.join(src, specifier.slice(2))
    else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !path.extname(specifier))
      target = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier)
    if (target) {
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')])
        if (path.extname(candidate) && existsSync(candidate)) return next(pathToFileURL(candidate).href, context)
    }
    return next(specifier, context)
  },
})
