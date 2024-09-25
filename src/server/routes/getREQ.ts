//Fancy Debugging
import type { DataManager } from "../../database/DataManager";
import { setColor } from "../../helpers/colors";

//Endpoint Router
export const getReq = async (_pathMap: string[], _request: any, _Database: DataManager): Promise<Response> => {
    
    //Add Auth Middleware Here
    
    //Execute Endpoint
    let path = _pathMap.map(String).join('/');
    return await execute(path, _request, _Database.DataTree.RootDirectory, _Database);  
}

//Execute Endpoint Function
const execute = async (_path: string, _request: any, _dataPath: string, _Database: DataManager) => {
    try {
        const module = await import(`${_dataPath}/Endpoints/GET/${_path}?v=${Date.now()}`);
        let response = await module.execute(_path, _request, _Database);
        let debugText = setColor('Executed:', 'orange') + ' ' + setColor('GET', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
        console.log( debugText)
        return response;
    } catch (error) {
        console.log(error)
        let debugText = setColor(' Failed:', 'red') + ' ' + setColor('GET', 'blue') + ' "' + setColor(_path, 'cyan') + '"\n';
        console.log( debugText)
        return new Response('Request Not Found', { status: 404 });
    }
}
