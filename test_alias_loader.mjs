// test_alias_loader.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    const filePath = path.resolve(process.cwd(), 'frontend', 'node_modules', 'next', 'server.js');
    return nextResolve(pathToFileURL(filePath).href, context);
  }
  if (specifier.startsWith('@/')) {
    const filePath = path.resolve(process.cwd(), 'frontend', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(filePath).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    try {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidateTs = path.resolve(parentDir, specifier + '.ts');
      if (fs.existsSync(candidateTs)) {
        return nextResolve(pathToFileURL(candidateTs).href, context);
      }
    } catch {
      // Fall through to nextResolve
    }
  }
  return nextResolve(specifier, context);
}
