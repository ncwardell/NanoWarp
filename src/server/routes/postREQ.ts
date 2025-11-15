import type { DataManager } from "../../database/DataManager";
import { setColor } from "../../helpers/colors";
import { watch } from "fs";

//Module Cache for hot-reloading
const moduleCache = new Map<string, any>();
const moduleVersions = new Map<string, number>();
const watchers = new Map<string, any>();

//Clear specific module from cache (for hot-reloading)
function clearModuleCache(fullPath: string) {
    moduleCache.delete(fullPath);
    // Increment version to force reimport
    const currentVersion = moduleVersions.get(fullPath) || 0;
    moduleVersions.set(fullPath, currentVersion + 1);
}

//Clear all modules from cache
export function clearAllModuleCache() {
    moduleCache.clear();
    console.log(setColor('Module cache cleared', 'yellow'));
}

export const postReq = async (_pathMap: string[], _request: any, _Database: DataManager): Promise<Response> => {

    //Execute Endpoint
    let path = _pathMap.map(String).join('/');
    return await execute(path, _request, _Database.DataTree.RootDirectory, _Database);
}

//Timeout helper
function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
    );
}

//Execute Endpoint Function with Error Boundaries
const execute = async (_path: string, _request: any, _dataPath: string, _Database: DataManager) => {
    const fullPath = `${_dataPath}/Endpoints/POST/${_path}`;

    try {
        // Load module with caching and version-based hot reload
        if (!moduleCache.has(fullPath)) {
            const version = moduleVersions.get(fullPath) || 0;
            const importPath = version > 0 ? `${fullPath}?v=${version}` : fullPath;
            const module = await import(importPath);
            moduleCache.set(fullPath, module);

            // Watch file for changes (hot-reload) - only set up once
            if (!watchers.has(fullPath)) {
                try {
                    const watcher = watch(`${fullPath}.ts`, (eventType) => {
                        if (eventType === 'change') {
                            console.log(setColor(` ♻ Hot-reloading: ${_path}`, 'yellow'));
                            clearModuleCache(fullPath);
                        }
                    });
                    watchers.set(fullPath, watcher);
                } catch (watchError) {
                    // File watching failed, continue without it
                }
            }
        }

        const module = moduleCache.get(fullPath);

        // Execute with timeout (30 seconds)
        const response = await Promise.race([
            module.execute(_path, _request, _Database),
            timeout(30000)
        ]);

        let debugText = setColor('Executed:', 'orange') + ' ' + setColor('POST', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
        console.log(debugText);
        return response;

    } catch (error: any) {
        // Error boundary - log but don't crash server
        if (error.message === 'Request timeout') {
            console.log(setColor(` ✗ Timeout: POST "${_path}"`, 'red'));
            return new Response('Request Timeout', { status: 504 });
        }

        // Module not found or execution error
        let debugText = setColor(' Failed Request:', 'red') + ' ' + setColor('POST', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
        console.log(debugText);

        // Log error details for debugging
        if (error.stack) {
            console.error(setColor('Error details:', 'red'), error.message);
        }

        return new Response('Request Not Found', { status: 404 });
    }
}