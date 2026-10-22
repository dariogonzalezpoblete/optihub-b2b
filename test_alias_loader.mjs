// test_alias_loader.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const filePath = path.resolve(process.cwd(), 'frontend', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(filePath).href, context);
  }
  return nextResolve(specifier, context);
}
