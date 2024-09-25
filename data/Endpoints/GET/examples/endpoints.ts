import type { DataManager } from "../../../../src/database/DataManager";
import type { DirectoryEntry } from "../../../../src/database/DirectoryList";

export const execute = async (_path: string, _request: any, _Database: DataManager) => {

    //const data = JSON.stringify(_Database, replacer);
    //const stats = await fs.stat(_Database.DataTree.RootDirectory + '/Endpoints/');

    //const data = JSON.stringify(await _Database.retrieveData(_Database.DataTree.RootDirectory + '/Endpoints/GET'));


    const files = findFilesInEndpoints(_Database);

    return new Response(JSON.stringify(files), { status: 200, headers: { 'Content-Type': 'application/json' }, });
}

function findFilesInEndpoints(data: DataManager) {
    const files: string[] = [];

    function traverse(descendants: Map<string, DirectoryEntry>) {
        if (descendants) {
            descendants.forEach((entry) => {
                if (entry.Type === 'file') {
                    files.push(entry.Path);
                } else if (entry.Type === 'directory' && entry.Descendants) {
                    traverse(entry.Descendants);
                }
            });
        }
    }

    // Navigate to the Endpoints directory
    const directoryList = data?.DataTree?.DirectoryList?.EntryList?.Descendants;
    if (directoryList) {
        const endpointsEntry = directoryList.get('Endpoints');
        if (endpointsEntry && endpointsEntry.Type === 'directory' && endpointsEntry.Descendants) {
            traverse(endpointsEntry.Descendants);
        }
    }

    return files;
}