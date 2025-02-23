import { serve } from 'bun';
import { postReq } from './routes/postREQ';
import { getReq } from './routes/getREQ';
import { setColor } from '../helpers/colors';
import { DataManager } from "../database/DataManager";

// Server Class
export class Server {
    Port: number;
    DataManager: DataManager;
    Keys: Record<string, string>;
    Whitelist: string[];

    constructor(_dataManager: DataManager, _port: number) {
        this.Port = _port;
        this.DataManager = _dataManager;
        this.Keys = {};
        this.Whitelist = [];
    }

    async getAPIKeys() {
        const file = Bun.file(`${this.DataManager.DataTree.RootDirectory}/apikeys.json`);
        if (await file.exists()) {
            const data = await file.json();
            this.Keys = data.keys || {};
            this.Whitelist = data.whitelist || [];
        } else {
            // Reset to defaults if file doesn't exist
            this.Keys = {};
            this.Whitelist = [];
        }
    }

    async start() {
        let that = this;
        const api = serve({
            port: this.Port,
            fetch: async (request) => {
                try {
                    // Efficient path extraction using URL API
                    const url = new URL(request.url);
                    const path = url.pathname;
                    function pathMap() {
                        return path.split('/').filter(part => part !== '');
                    }
                    const pathParts = pathMap();

                    // Logging request details
                    console.log(
                        `${setColor('Request: ', 'green')}${setColor(request.method, 'blue')} "${setColor(path, 'cyan')}"`
                    );

                    await this.getAPIKeys();

                    // API key check only if keys are defined and path is not whitelisted
                    if (Object.keys(this.Keys).length > 0 && !this.Whitelist.includes(path)) {
                        const apiKey = request.headers.get('X-API-Key');
                        if (!apiKey || !this.Keys.hasOwnProperty(apiKey)) {
                            console.log(setColor('Unauthorized: Invalid or missing API key', 'red'));
                            return new Response('Unauthorized: Invalid or missing API key', { status: 401 });
                        }
                        const expirationDateStr = this.Keys[apiKey];
                        const expirationDate = new Date(expirationDateStr);
                        if (isNaN(expirationDate.getTime())) {
                            console.log(setColor('Invalid expiration date for API key', 'red'));
                            return new Response('Internal Server Error', { status: 500 });
                        }
                        const currentDate = new Date();
                        if (currentDate > expirationDate) {
                            console.log(setColor('Unauthorized: API key expired', 'red'));
                            return new Response('Unauthorized: API key expired', { status: 401 });
                        }
                    }

                    // Handle empty paths
                    if (pathParts.length === 0) {
                        return new Response('Invalid Path', { status: 400 });
                    }

                    // Route requests
                    switch (request.method) {
                        case 'GET':
                            if (pathParts[0] === 'api') {
                                return await getReq(pathParts.slice(1), request, that.DataManager);
                            } else {
                                return await getReq(pathParts, request, that.DataManager);
                            }

                        case 'POST':
                            if (pathParts[0] === 'api') {
                                return await postReq(pathParts.slice(1), request, that.DataManager);
                            } else {
                                return await postReq(pathParts, request, that.DataManager);
                            }

                        default:
                            return new Response('Request Method Not Found', { status: 404 });
                    }
                } catch (error) {
                    console.error(setColor('Error processing request:', 'red'), error);
                    return new Response('Internal Server Error', { status: 500 });
                }
            },
        });

        console.log(setColor('API listening on port ' + this.Port, 'yellow'));
        console.log('--------------------------' + '\n');
    }
}