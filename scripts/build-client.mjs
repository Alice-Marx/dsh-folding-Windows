import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const source = readFileSync(join(root, 'src/client.js'), 'utf8').replace(/\r\n/g, '\n')
const output = `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {\n`
  + `var module = { exports: {} }; var exports = module.exports;\n${source}\nreturn module.exports;\n} });\n`
const target = join(root, 'lib/client.js')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output) {
    throw new Error('Client bundle is stale. Run npm run build.')
  }
  console.log('Client bundle matches source.')
} else {
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(target, output)
  console.log(`Built lib/client.js (${Buffer.byteLength(output)} bytes).`)
}
