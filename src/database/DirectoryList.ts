//Imports
import fs from 'fs-extra';

//Creates The Template For A Directory Entry
export interface DirectoryEntry {
    Type: "file" | "directory" | "temp";
    Path: string;
    Descendants?: Map<string, DirectoryEntry>;
}

//Creates A Directory List Object
export class DirectoryList {
    //Creates A List Filled with DirectoryEntrys
    EntryList: DirectoryEntry;
    
    //Stores Directory Entries for Get Entry Function
    EntryBuffer: { [key: string]: [DirectoryEntry] } = {};
    async clearEntryBuffer() {this.EntryBuffer = {}}; //Clears Query Buffer

    //Sets Root Directory
    constructor(_rootDirectory: string, _directoryEntry?: DirectoryEntry) {
        if(_directoryEntry === undefined){
            this.EntryList = {Type: "directory", Path: _rootDirectory};
        }else{
            this.EntryList = _directoryEntry;
        }
    }

    //Ensures All Paths In Entry
    async ensurePaths(_directoryEntry: DirectoryEntry = this.EntryList) {
        if (_directoryEntry.Type === "directory") {
            if (!(await fs.pathExists(_directoryEntry.Path))) {
                await fs.ensureDir(_directoryEntry.Path);
            }
            if (!(_directoryEntry.Descendants === undefined)) {
                for (const [key, value] of _directoryEntry.Descendants.entries()) {
                    await this.ensurePaths(value);
                }
            }
        } else if (_directoryEntry.Type === "file") {
            if (!(await fs.pathExists(_directoryEntry.Path))) {
                await fs.ensureFile(_directoryEntry.Path);
            }
        }
    }

    //Querys Through Directory List for a Path "Key" and Stores Results in EntryBuffer
    async getEntry(_target: string, _entry: DirectoryEntry = this.EntryList) {
        //Pushes Temp Entry to Buffer To Initialize Array
        if (this.EntryBuffer[_target] === undefined) {
            this.EntryBuffer[_target] = [{Type: "temp", Path: ""}];
        }
        //If Entry is Found In Any Descendant Push to Buffer
        if (!(_entry.Descendants === undefined)) {
            for (const [key, value] of _entry.Descendants.entries()) {
                if (key === _target) {
                    this.EntryBuffer[_target].push(value);
                } else {
                    this.getEntry(_target, value);
                }
            }
        }
        //Removes Temp Entry From Buffer
        if (this.EntryBuffer[_target][0].Type === "temp") {
            this.EntryBuffer[_target].splice(0, 1);
        }
    }

    //Builds Directory Map from Root Directory
    async buildDirectoryMap(_path: string): Promise<DirectoryEntry> {
        //Starts To Map Directory From Here
        const rootDirectory = fs.statSync(_path);
        
        //Creates New Entry Starting From rootDirectory
        const entry: DirectoryEntry = {
            Type: rootDirectory.isFile() ? "file" : "directory",
            Path: _path
        };

        //Scours Through Directory and Adds Descendants
        if (entry.Type === "directory") {
            entry.Descendants = new Map();
            const files = fs.readdirSync(_path);
            for (const file of files) {
                const filePath = `${entry.Path}/${file}`;
                entry.Descendants.set(file, await this.buildDirectoryMap(filePath));
            }
        }
        
        //Returns Full Entry
        return entry;
    }
}

