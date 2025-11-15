import { DataManager } from "./database/DataManager";
import { Server } from "./server/server";
import path from 'path';
import { setColor } from "./helpers/colors";

export class NanoWarp {

    Database: DataManager;
    APIServer: Server;
    DataPath: string;
    private shutdownHandlersRegistered = false;


    constructor(port = 3000, _dataPath = './data') {
        this.DataPath = path.resolve(_dataPath);
        this.Database = new DataManager(this.DataPath);
        this.APIServer = new Server(this.Database, port);
    }

    async start() {
        await this.Database.initialize();
        await this.APIServer.start();

        // Register graceful shutdown handlers
        if (!this.shutdownHandlersRegistered) {
            this.registerShutdownHandlers();
            this.shutdownHandlersRegistered = true;
        }
    }

    async stop() {
        await this.APIServer.stop();
    }

    // Register signal handlers for graceful shutdown
    private registerShutdownHandlers() {
        const shutdown = async (signal: string) => {
            console.log(setColor(`\n\n📡 Received ${signal}`, 'cyan'));
            await this.stop();
            process.exit(0);
        };

        // Handle SIGTERM (docker stop, kubernetes, etc.)
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Handle SIGINT (Ctrl+C)
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            console.error(setColor('Uncaught Exception:', 'red'), error);
            await this.stop();
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            console.error(setColor('Unhandled Rejection at:', 'red'), promise, 'reason:', reason);
            await this.stop();
            process.exit(1);
        });
    }
}