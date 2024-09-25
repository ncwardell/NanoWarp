//Imports
import fs from 'fs-extra';
import { readdir } from "node:fs/promises";
import { setColor } from '../helpers/colors';
import { DirectoryList } from './DirectoryList';
import type { DirectoryEntry } from './DirectoryList';
import { replacer, reviver } from '../helpers/mappingString';

//Used To Manage The Storage of the DataManager
class ManagedStorage {
    RootDirectory: string
    DataBaseFile: string
    Initialize: Function
    DirectoryList: DirectoryList

    constructor(_rootDirectory: string, _dbFile: string, _directoryList: DirectoryList) {
        this.RootDirectory = _rootDirectory;
        this.DataBaseFile = _dbFile;
        this.DirectoryList = _directoryList;
        this.Initialize = async () => {
            //Ensure Root Directory & Config File Exist
            if ((await fs.pathExists(this.RootDirectory)) == false) { await fs.ensureDir(this.RootDirectory); }
            if ((await fs.pathExists(this.DataBaseFile)) == false) { await Bun.write(this.DataBaseFile, JSON.stringify({})); }
            //Ensure Paths For Server Endpoints
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/GET')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/GET'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/POST')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/POST'); }
        }
    }
}


//Create DataManager
export class DataManager {

    //Total Database Storage
    DataTree: ManagedStorage;

    //Constructs The Object
    constructor(_rootFolder: string, _directoryEntry?: DirectoryEntry) {
        if (_directoryEntry === undefined) {
            this.DataTree = new ManagedStorage(_rootFolder, _rootFolder + '/database.lock', new DirectoryList(_rootFolder));
        } else {
            this.DataTree = new ManagedStorage(_rootFolder, _rootFolder + '/database.lock', new DirectoryList(_rootFolder, _directoryEntry));
        }
    };

    //Initialize Storage
    async initialize() {
        //Makes Sure Root Directory and database.lock File Exists
        await this.DataTree.Initialize();
        //Loads & Reads The Database File
        let databaseFile = await Bun.file(this.DataTree.DataBaseFile).json();
        //If Database File is Not Empty
        if (JSON.stringify(databaseFile) !== '{}') {
            await this.loadDataBase(this.DataTree.DataBaseFile);
        } else { //Save DataTree to database.lock
            await this.scanDatabase();
        }
        console.log(setColor('| Database Initialized |', 'magenta') + '\n');
    };

    async retrieveData(_path: string) {
        console.log(setColor(' • Retrieving Data', 'yellow'));
        if (await fs.pathExists(_path) == true) {
            const stats = await fs.stat(_path);
            if (stats.isDirectory()) {
                console.log(setColor(` ➛ Returning Directory List (${_path})`, 'orange'));
                return await readdir(_path);
            } else if ((_path.endsWith('.json')) || (_path.endsWith('.lock'))) {
                console.log(setColor(` ➛ Returning JSON (${_path})`, 'orange'));
                return await Bun.file(_path).json();
            } else {
                console.log(setColor(` ➛ Returning File (${_path})`, 'orange'));
                return await Bun.file(_path).arrayBuffer();
            }
        } else {
            console.log(setColor(` ➛ Retrieving Data Failed (${_path})`, 'red'));
            return false;
        }
    };

    async deleteData(_path: string) {
        console.log(setColor(' • Deleting Data', 'yellow'));
        if (await fs.pathExists(_path) == true) {
            await fs.remove(_path);
            console.log(setColor(` ➛ Data Deleted (${_path})`, 'orange'));
            return true;
        } else {
            console.log(setColor(` ➛ Deleting Data Failed (${_path})`, 'red'));
            return false;
        }
    }

    async saveData(_path: string, _data: any) {
        console.log(setColor(' • Saving Data', 'yellow'));
        let file = Bun.file(_path);
        await Bun.write(file, _data);

        if (await fs.pathExists(_path) == true) {
            console.log(setColor(` ➛ Data Saved (${_path})`, 'orange'));
            return true;
        } else {
            console.log(setColor(` ➛ Data Save Failed (${_path})`, 'red'));
            return false;
        }
    };


    async loadDataBase(_path: string) {
        const data = await this.retrieveData(_path);
        if (data) {
            try {
                const reconstructed = JSON.parse(JSON.stringify(data), reviver);
                this.DataTree = new ManagedStorage(reconstructed.RootDirectory, reconstructed.DataBaseFile, new DirectoryList(reconstructed.RootDirectory, reconstructed.DirectoryList.EntryList));
                console.log(setColor(` ➛ Database Loaded (${_path})`, 'magenta'));
            } catch (error) {
                console.log(setColor('| Database Load Failed |', 'red') + '\n');
            }
        } else {
            console.log(setColor(` ➛ Database Load Failed (${_path})`, 'red'));
        }
    }

    async saveDataBase() {
        await this.saveData(this.DataTree.DataBaseFile, JSON.stringify(this.DataTree, replacer));
    }

    async scanDatabase(){
        this.DataTree.DirectoryList.EntryList = await this.DataTree.DirectoryList.buildDirectoryMap(this.DataTree.RootDirectory);
        await this.saveDataBase();
    }

}

