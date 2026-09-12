import type { DataManager } from "../../database/DataManager";
import type { NanoWarpConfig, EndpointRateLimitConfig } from "../../types/config";
import { setColor } from "../../helpers/colors";
import { watch } from "fs";
import { checkRateLimit } from "../rate-limiter";
import { LRUCache } from "../../helpers/LRUCache";

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MethodHandler {
    handle: (
        _pathMap: string[],
        _request: any,
        _Database: DataManager,
        _config: Required<NanoWarpConfig>
    ) => Promise<Response>;
    clearCache: () => void;
}

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
    );
}

/**
 * Build a per-method endpoint handler.
 *
 * Each method gets its own LRU module cache, version map, and watcher set,
 * matching the prior per-file behavior (5 independent caches of capacity 100).
 */
export function createMethodHandler(method: HttpMethod): MethodHandler {
    const moduleVersions = new Map<string, number>();
    const watchers = new Map<string, any>();

    const closeWatcher = (fullPath: string) => {
        const watcher = watchers.get(fullPath);
        if (watcher) {
            try {
                watcher.close();
                watchers.delete(fullPath);
            } catch (e) {
                // Ignore close errors
            }
        }
    };

    const moduleCache = new LRUCache<string, any>(100, (key, _value) => {
        console.log(setColor(` ♻ Evicting LRU module: ${key}`, 'yellow'));
        closeWatcher(key);
        moduleVersions.delete(key);
    });

    const clearModuleCache = (fullPath: string) => {
        moduleCache.delete(fullPath);
        const currentVersion = moduleVersions.get(fullPath) || 0;
        moduleVersions.set(fullPath, currentVersion + 1);
    };

    const clearCache = () => {
        for (const [_path, watcher] of watchers.entries()) {
            try {
                watcher.close();
            } catch (e) {
                // Ignore close errors
            }
        }
        watchers.clear();
        moduleCache.clear(false);
        moduleVersions.clear();
        console.log(setColor('Module cache cleared', 'yellow'));
    };

    const isModuleNotFoundError = (err: any): boolean => {
        if (!err) return false;
        if (err.code === 'ERR_MODULE_NOT_FOUND') return true;
        if (err.code === 'MODULE_NOT_FOUND') return true;
        if (err.code === 'ENOENT') return true;
        const msg = String(err.message ?? '');
        if (msg.includes('Cannot find module')) return true;
        if (msg.includes('no such file or directory')) return true;
        return false;
    };

    const execute = async (
        _path: string,
        _request: any,
        _dataPath: string,
        _Database: DataManager,
        _config: Required<NanoWarpConfig>
    ): Promise<Response> => {
        const fullPath = `${_dataPath}/Endpoints/${method}/${_path}`;

        let module = moduleCache.get(fullPath);

        // Phase 1: load the endpoint module. Missing module → 404.
        // Module exists but fails to load (syntax error, etc.) → 500.
        if (!module) {
            const version = moduleVersions.get(fullPath) || 0;
            const importPath = version > 0 ? `${fullPath}?v=${version}` : fullPath;

            try {
                module = await import(importPath);
            } catch (importError: any) {
                if (_config.logging) {
                    const debugText = setColor(' Failed Request:', 'red') + ' '
                        + setColor(method, 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
                    console.log(debugText);
                    if (importError?.stack) {
                        console.error(setColor('Error details:', 'red'), importError.message);
                    }
                }
                if (isModuleNotFoundError(importError)) {
                    return new Response('Not Found', { status: 404 });
                }
                return new Response('Internal Server Error', { status: 500 });
            }

            moduleCache.set(fullPath, module);

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

        // Phase 2: rate-limit + execute. Errors here are runtime errors in
        // user code → 500. Timeout → 504.
        try {
            const rateLimitConfig: EndpointRateLimitConfig | undefined = module.rateLimit;
            const clientIP = _request.headers.get('x-forwarded-for') ||
                            _request.headers.get('x-real-ip') ||
                            'unknown';

            if (!checkRateLimit(clientIP, `/${_path}`, rateLimitConfig)) {
                if (_config.logging) {
                    console.log(setColor(`Rate limit exceeded for ${clientIP} on ${method} /${_path}`, 'red'));
                }
                return new Response('Too Many Requests', { status: 429 });
            }

            const response = await Promise.race([
                module.execute(_path, _request, _Database),
                timeout(_config.timeout.request!)
            ]);

            if (_config.logging) {
                const url = new URL(_request.url);
                const queryString = url.search;
                const loggedPath = _path + queryString;
                const debugText = setColor('Executed:', 'orange') + ' ' + setColor(method, 'blue') + ' "' + setColor(loggedPath, 'cyan') + '"\n';
                console.log(debugText);
            }
            return response;

        } catch (error: any) {
            if (error?.message === 'Request timeout') {
                if (_config.logging) {
                    console.log(setColor(` ✗ Timeout: ${method} "${_path}"`, 'red'));
                }
                return new Response('Request Timeout', { status: 504 });
            }

            if (_config.logging) {
                const debugText = setColor(' Failed Request:', 'red') + ' ' + setColor(method, 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
                console.log(debugText);
                if (error?.stack) {
                    console.error(setColor('Error details:', 'red'), error.message);
                }
            }

            // Runtime error in user endpoint code.
            return new Response('Internal Server Error', { status: 500 });
        }
    };

    const handle = async (
        _pathMap: string[],
        _request: any,
        _Database: DataManager,
        _config: Required<NanoWarpConfig>
    ): Promise<Response> => {
        moduleCache.setCapacity(_config.cache.moduleCacheSize!);
        const path = _pathMap.join('/');
        return await execute(path, _request, _Database.DataTree.RootDirectory, _Database, _config);
    };

    return { handle, clearCache };
}
