import type { DataManager } from "../../../../src/database/DataManager";
import { replacer } from "../../../../src/helpers/mappingString";

export const execute = async (_path: string, _request: any, _Database: DataManager) => {
    await _Database.scanDatabase();
    return new Response(JSON.stringify(_Database, replacer), {status: 200, headers: { 'Content-Type': 'application/json' },});
}