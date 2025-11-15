import type { DataManager } from "../../database/DataManager";
import type { NanoWarpConfig, EndpointRateLimitConfig } from "../../types/config";
import { setColor } from "../../helpers/colors";
import { watch } from "fs";
import { checkRateLimit } from "../rate-limiter";

//Module Cache for hot-reloading with LRU eviction
const moduleCache = new Map<string, any>();
const moduleVersions = new Map<string, number>();
const watchers = new Map<string, any>();
const moduleLastAccess = new Map<string, number>();
let MAX_CACHE_SIZE = 100; // Will be set from config

//Clear specific module from cache (for hot-reloading)
function clearModuleCache(fullPath: string) {
    moduleCache.delete(fullPath);
    moduleLastAccess.delete(fullPath);
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

//Evict least recently used module
function evictLRU() {
    if (moduleCache.size < MAX_CACHE_SIZE) return;

    let oldestPath: string | null = null;
    let oldestTime = Date.now();

    for (const [path, lastAccess] of moduleLastAccess.entries()) {
        if (lastAccess < oldestTime) {
            oldestTime = lastAccess;
            oldestPath = path;
        }
    }

    if (oldestPath) {
        console.log(setColor(` ♻ Evicting LRU module: ${oldestPath}`, 'yellow'));
        closeWatcher(oldestPath);
        moduleCache.delete(oldestPath);
        moduleVersions.delete(oldestPath);
        moduleLastAccess.delete(oldestPath);
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
    moduleCache.clear();
    moduleVersions.clear();
    moduleLastAccess.clear();
    console.log(setColor('Module cache cleared', 'yellow'));
}

export const deleteReq = async (_pathMap: string[], _request: any, _Database: DataManager, _config: Required<NanoWarpConfig>): Promise<Response> => {

    // Update cache size from config
    MAX_CACHE_SIZE = _config.cache.moduleCacheSize!;

    //Execute Endpoint
    let path = _pathMap.map(String).join('/');
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
    const fullPath = `${_dataPath}/Endpoints/DELETE/${_path}`;

    try {
        // Load module with caching and version-based hot reload
        if (!moduleCache.has(fullPath)) {
            // Evict LRU module if cache is full
            evictLRU();

            const version = moduleVersions.get(fullPath) || 0;
            const importPath = version > 0 ? `${fullPath}?v=${version}` : fullPath;

            // Blue-green deployment: Load new module before clearing old
            const module = await import(importPath);
            moduleCache.set(fullPath, module);
            moduleLastAccess.set(fullPath, Date.now());

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
        } else {
            // Update last access time for LRU tracking
            moduleLastAccess.set(fullPath, Date.now());
        }

        const module = moduleCache.get(fullPath);

        // Check rate limiting (if configured in endpoint)
        const rateLimitConfig: EndpointRateLimitConfig | undefined = module.rateLimit;
        const clientIP = _request.headers.get('x-forwarded-for') ||
                        _request.headers.get('x-real-ip') ||
                        'unknown';

        if (!checkRateLimit(clientIP, `/${_path}`, rateLimitConfig)) {
            if (_config.logging) {
                console.log(setColor(`Rate limit exceeded for ${clientIP} on DELETE /${_path}`, 'red'));
            }
            return new Response('Too Many Requests', { status: 429 });
        }

        // Execute with configurable timeout
        const response = await Promise.race([
            module.execute(_path, _request, _Database),
            timeout(_config.timeout.request!)
        ]);

        if (_config.logging) {
            let debugText = setColor('Executed:', 'orange') + ' ' + setColor('DELETE', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
            console.log(debugText);
        }
        return response;

    } catch (error: any) {
        // Error boundary - log but don't crash server
        if (error.message === 'Request timeout') {
            if (_config.logging) {
                console.log(setColor(` ✗ Timeout: DELETE "${_path}"`, 'red'));
            }
            return new Response('Request Timeout', { status: 504 });
        }

        // Module not found or execution error
        if (_config.logging) {
            let debugText = setColor(' Failed Request:', 'red') + ' ' + setColor('DELETE', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
            console.log(debugText);

            // Log error details for debugging
            if (error.stack) {
                console.error(setColor('Error details:', 'red'), error.message);
            }
        }

        return new Response('Request Not Found', { status: 404 });
    }
}
