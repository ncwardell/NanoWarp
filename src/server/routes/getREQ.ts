//Fancy Debugging
import type { DataManager } from "../../database/DataManager";
import type { NanoWarpConfig, EndpointRateLimitConfig } from "../../types/config";
import { setColor } from "../../helpers/colors";
import { watch } from "fs";
import { checkRateLimit } from "../rate-limiter";
import { LRUCache } from "../../helpers/LRUCache";

//Module Cache for hot-reloading with LRU eviction (O(1) operations)
const moduleCache = new LRUCache<string, any>(100, (key, _value) => {
    // Eviction callback - close watcher when module is evicted
    console.log(setColor(` ♻ Evicting LRU module: ${key}`, 'yellow'));
    closeWatcher(key);
    moduleVersions.delete(key);
});
const moduleVersions = new Map<string, number>();
const watchers = new Map<string, any>();

//Clear specific module from cache (for hot-reloading)
function clearModuleCache(fullPath: string) {
    moduleCache.delete(fullPath);
    // Increment version to force reimport
    const currentVersion = moduleVersions.get(fullPath) || 0;
    moduleVersions.set(fullPath, currentVersion + 1);
}

//Close watcher for a specific module
function closeWatcher(fullPath: string) {
    const watcher = watchers.get(fullPath);
    if (watcher) {
        try {
            watcher.close();
            watchers.delete(fullPath);
        } catch (e) {
            // Ignore close errors
        }
    }
}

//Clear all modules from cache
export function clearAllModuleCache() {
    // Close all watchers first (graceful cleanup)
    for (const [path, watcher] of watchers.entries()) {
        try {
            watcher.close();
        } catch (e) {
            // Ignore close errors
        }
    }

    watchers.clear();
    moduleCache.clear(false); // Don't call eviction callback on manual clear
    moduleVersions.clear();
    console.log(setColor('Module cache cleared', 'yellow'));
}

//Endpoint Router
export const getReq = async (_pathMap: string[], _request: any, _Database: DataManager, _config: Required<NanoWarpConfig>): Promise<Response> => {

    //Add Auth Middleware Here

    // Update cache capacity from config
    moduleCache.setCapacity(_config.cache.moduleCacheSize!);

    //Execute Endpoint
    let path = _pathMap.join('/');
    return await execute(path, _request, _Database.DataTree.RootDirectory, _Database, _config);
}

//Timeout helper
function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
    );
}

//Execute Endpoint Function with Error Boundaries
const execute = async (_path: string, _request: any, _dataPath: string, _Database: DataManager, _config: Required<NanoWarpConfig>) => {
    const fullPath = `${_dataPath}/Endpoints/GET/${_path}`;

    try {
        // Load module with caching and version-based hot reload
        let module = moduleCache.get(fullPath); // Also marks as recently used

        if (!module) {
            // Module not in cache - import it (LRU cache auto-evicts if needed)
            const version = moduleVersions.get(fullPath) || 0;
            const importPath = version > 0 ? `${fullPath}?v=${version}` : fullPath;

            // Import module
            module = await import(importPath);
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

        // Check rate limiting (if configured in endpoint)
        const rateLimitConfig: EndpointRateLimitConfig | undefined = module.rateLimit;
        const clientIP = _request.headers.get('x-forwarded-for') ||
                        _request.headers.get('x-real-ip') ||
                        'unknown';

        if (!checkRateLimit(clientIP, `/${_path}`, rateLimitConfig)) {
            if (_config.logging) {
                console.log(setColor(`Rate limit exceeded for ${clientIP} on GET /${_path}`, 'red'));
            }
            return new Response('Too Many Requests', { status: 429 });
        }

        // Execute with configurable timeout
        const response = await Promise.race([
            module.execute(_path, _request, _Database),
            timeout(_config.timeout.request!)
        ]);

        if (_config.logging) {
            // Extract query string from request URL
            const url = new URL(_request.url);
            const queryString = url.search;
            const fullPath = _path + queryString;
            let debugText = setColor('Executed:', 'orange') + ' ' + setColor('GET', 'blue') + ' "' + setColor(fullPath, 'cyan') + '"\n';
            console.log(debugText);
        }
        return response;

    } catch (error: any) {
        // Error boundary - log but don't crash server
        if (error.message === 'Request timeout') {
            if (_config.logging) {
                console.log(setColor(` ✗ Timeout: GET "${_path}"`, 'red'));
            }
            return new Response('Request Timeout', { status: 504 });
        }

        // Module not found or execution error
        if (_config.logging) {
            let debugText = setColor(' Failed Request:', 'red') + ' ' + setColor('GET', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
            console.log(debugText);

            // Log error details for debugging
            if (error.stack) {
                console.error(setColor('Error details:', 'red'), error.message);
            }
        }

        return new Response('Request Not Found', { status: 404 });
    }
}
