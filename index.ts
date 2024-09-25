import { NanoWarp } from "./src";

let nw = new NanoWarp();
await nw.start();

//await nw.Database.loadDataBase('./data2/database.lock');

//console.log(nw.Database.DataTree);