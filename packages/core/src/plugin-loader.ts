import fs from 'node:fs/promises';
import path from 'node:path';
import type { Provider } from '../../sdk/src/provider-base.ts';

/**
 * Dynamically loads a provider from a .ts or .js file.
 * NOTE: This uses Bun's ability to import TS files directly.
 */
export async function loadPlugin(filePath: string): Promise<Provider> {
  const absolutePath = path.resolve(filePath);
  
  try {
    const module = await import(absolutePath);
    
    // We expect the provider to be the default export or a named export matching the filename
    const ProviderClass = module.default || Object.values(module)[0];
    
    if (typeof ProviderClass !== 'function') {
      throw new Error(`Plugin at ${filePath} does not export a valid Provider class.`);
    }

    const instance = new ProviderClass();
    
    // Basic validation that it's actually a Provider
    if (!instance.manifest || !instance.scan) {
      throw new Error(`Plugin instance at ${filePath} is missing manifest or scan method.`);
    }

    return instance as Provider;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load plugin from ${filePath}: ${msg}`);
  }
}

/**
 * Loads all providers from a directory.
 */
export async function loadPluginsFromDir(dirPath: string): Promise<Provider[]> {
  const absoluteDir = path.resolve(dirPath);
  const files = await fs.readdir(absoluteDir);
  const providers: Provider[] = [];

  for (const file of files) {
    if (file.endsWith('.ts') || file.endsWith('.js')) {
      try {
        const provider = await loadPlugin(path.join(absoluteDir, file));
        providers.push(provider);
      } catch (err) {
        console.warn(`Skipping plugin ${file}:`, (err as Error).message);
      }
    }
  }

  return providers;
}
