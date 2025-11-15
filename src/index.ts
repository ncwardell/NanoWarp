/**
 * NanoWarp - Lightning-fast API framework with hot-swappable file-based endpoints
 *
 * @module NanoWarp
 * @description Main entry point for the NanoWarp framework. Provides a simple interface
 * for creating high-performance API servers with file-based routing and hot-reload capabilities.
 *
 * @example
 * ```typescript
 * import { NanoWarp } from 'nanowarp';
 *
 * const server = new NanoWarp(3000, './data');
 * await server.start();
 * ```
 */

import { DataManager } from './database/DataManager';
import { Server } from './server/server';
import path from 'path';
import { setColor } from './helpers/colors';
import type { NanoWarpConfig } from './types/config';
import { mergeConfig } from './types/config';

/**
 * Main NanoWarp server class
 *
 * Orchestrates the HTTP server and database manager, providing a unified
 * interface for starting and stopping the API server with graceful shutdown support.
 */
export class NanoWarp {
    /**
     * Database manager instance for handling file-based data operations
     */
    public readonly Database: DataManager;

    /**
     * HTTP server instance for handling incoming requests
     */
    public readonly APIServer: Server;

    /**
     * Absolute path to the data directory
     */
    public readonly DataPath: string;

    /**
     * Server configuration
     */
    public readonly config: Required<NanoWarpConfig>;

    /**
     * Flag to prevent duplicate shutdown handler registration
     */
    private shutdownHandlersRegistered = false;

    /**
     * Create a new NanoWarp server instance
     *
     * @param portOrConfig - Port number (legacy) or full configuration object
     * @param dataPath - Path to the data directory (legacy, only used if first param is number)
     *
     * @example
     * ```typescript
     * // Default configuration (port 3000, ./data)
     * const server = new NanoWarp();
     *
     * // Legacy: Custom port
     * const server = new NanoWarp(8080);
     *
     * // Legacy: Custom port and data directory
     * const server = new NanoWarp(8080, './my-data');
     *
     * // New: Configuration object
     * const server = new NanoWarp({
     *   port: 8080,
     *   dataPath: './my-data',
     *   rateLimit: {
     *     maxTokens: 200,
     *     perEndpoint: {
     *       '/auth/login': { maxTokens: 5, refillRate: 1 }
     *     }
     *   },
     *   cache: {
     *     apiKeyTTL: 120000
     *   },
     *   openapi: {
     *     enabled: true,
     *     info: {
     *       title: 'My API',
     *       version: '2.0.0'
     *     }
     *   }
     * });
     * ```
     */
    constructor(portOrConfig?: number | NanoWarpConfig, dataPath?: string) {
        // Handle both legacy (port, dataPath) and new (config object) constructor signatures
        if (typeof portOrConfig === 'number') {
            // Legacy constructor: NanoWarp(port, dataPath)
            this.config = mergeConfig({
                port: portOrConfig,
                dataPath: dataPath,
            });
        } else {
            // New constructor: NanoWarp(config)
            this.config = mergeConfig(portOrConfig);
        }

        this.DataPath = path.resolve(this.config.dataPath);
        this.Database = new DataManager(this.DataPath);
        this.APIServer = new Server(this.Database, this.config);
    }

    /**
     * Start the NanoWarp server
     *
     * Initializes the database, starts the HTTP server, and registers
     * graceful shutdown handlers for SIGTERM, SIGINT, and uncaught exceptions.
     *
     * @returns Promise that resolves when the server is fully started
     *
     * @example
     * ```typescript
     * const server = new NanoWarp();
     * await server.start();
     * console.log('Server is running!');
     * ```
     */
    async start(): Promise<void> {
        await this.Database.initialize();
        await this.APIServer.start();

        // Register graceful shutdown handlers (only once)
        if (!this.shutdownHandlersRegistered) {
            this.registerShutdownHandlers();
            this.shutdownHandlersRegistered = true;
        }
    }

    /**
     * Stop the NanoWarp server gracefully
     *
     * Waits for in-flight requests to complete, flushes pending database writes,
     * and closes the HTTP server.
     *
     * @returns Promise that resolves when the server is fully stopped
     *
     * @example
     * ```typescript
     * await server.stop();
     * console.log('Server stopped');
     * ```
     */
    async stop(): Promise<void> {
        await this.APIServer.stop();
    }

    /**
     * Register signal handlers for graceful shutdown
     *
     * Handles:
     * - SIGTERM: Kubernetes, Docker, systemd shutdowns
     * - SIGINT: Ctrl+C in terminal
     * - uncaughtException: Unhandled errors
     * - unhandledRejection: Unhandled promise rejections
     *
     * @private
     */
    private registerShutdownHandlers(): void {
        /**
         * Generic shutdown handler for signals
         */
        const shutdown = async (signal: string): Promise<void> => {
            console.log(setColor(`\n\n📡 Received ${signal}`, 'cyan'));
            await this.stop();
            process.exit(0);
        };

        // Handle SIGTERM (docker stop, kubernetes, systemd)
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Handle SIGINT (Ctrl+C in terminal)
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error: Error) => {
            console.error(setColor('❌ Uncaught Exception:', 'red'), error);
            await this.stop();
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
            console.error(setColor('❌ Unhandled Rejection at:', 'red'), promise, 'reason:', reason);
            await this.stop();
            process.exit(1);
        });
    }
}

// Export types for user consumption
export type { NanoWarpConfig, EndpointRateLimitConfig, EndpointSchema, CacheConfig, TimeoutConfig, OpenAPIConfig } from './types/config';