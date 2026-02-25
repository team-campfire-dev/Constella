import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@google/generative-ai') {
    return {
      url: 'data:text/javascript,export class GoogleGenerativeAI { constructor() {} getGenerativeModel() { return {}; } }',
      shortCircuit: true
    };
  }
  if (specifier === 'winston') {
    return {
      url: 'data:text/javascript,export default { createLogger: () => ({ warn: () => {}, info: () => {}, error: () => {} }), format: { combine: () => {}, timestamp: () => {}, json: () => {}, colorize: () => {}, simple: () => {} }, transports: { Console: class {} } };',
      shortCircuit: true
    };
  }
  if (specifier.startsWith('@/')) {
    const path = specifier.slice(2);
    const url = pathToFileURL(process.cwd() + '/src/' + path + (path.endsWith('.ts') ? '' : '.ts')).href;
    return { url, shortCircuit: true };
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
      try {
        const url = new URL(specifier + '.ts', context.parentURL).href;
        return { url, shortCircuit: true };
      } catch { }
    }
  }
  return nextResolve(specifier, context);
}
