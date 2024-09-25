import { DataManager } from "./database/DataManager";
import { Server } from "./server/server";
import path from 'path';

export class NanoWarp {
    
    Database: DataManager;
    APIServer: Server;
    DataPath: string;
    
    
    constructor(port = 3000, _dataPath = './data') {
        this.DataPath = path.resolve(_dataPath);
        this.Database = new DataManager(this.DataPath);
        this.APIServer = new Server(this.Database, port);
    }

    async start() {
        await this.Database.initialize();
        await this.APIServer.start();
    }
}