import { serve } from 'bun';
import { postReq } from './routes/postREQ';
import { getReq } from './routes/getREQ';
import { setColor } from '../helpers/colors';
import { DataManager } from "../database/DataManager";

//Server Class
export class Server {
    
    Port: number;
    DataManager: DataManager;
    
    constructor(_dataManager: DataManager, _port: number) {
        this.Port = _port;
        this.DataManager = _dataManager;
    }

    async start() {
        let that = this;
        const api = serve({
            port: this.Port,
            fetch: (request) => {
        
                let path:string = "";
                const match = request.url.match(/^.*:\d+\//);
                if (match) { path = request.url.replace(match[0], '/'); }
                function pathMap(): string[] {return path.split('/').filter(part => part !== '');}
                
                //Debugging
                console.log(setColor('Request: ', 'green') + setColor(request.method, 'blue') + ' "' + setColor(path, 'cyan') + '"');
                
                switch (request.method) {
                    case 'GET':
                        switch (pathMap()[0]) {
                            case 'api': return getReq(pathMap().slice(1), request, that.DataManager);
                            default: return new Response('Get Method Not Found', { status: 404 });
                        }
        
                    case 'POST':
                        switch (pathMap()[0]) {
                            case 'api': return postReq(pathMap().slice(1), request, that.DataManager);
                            default: return new Response('Post Method Not Found', { status: 404 });
                        }
        
                    default:
                        return new Response('Request Method Not Found', { status: 404 });
                }
            },
        });
        console.log(setColor('API listening on port ' + this.Port, 'yellow'));
        console.log('--------------------------' + '\n');
    }
}









