import type { DataManager } from "../../../../src/database/DataManager";

export const execute = async (_path: string, _request: any, _Database: DataManager) => {
    return new Response('Hello, World!', { status: 200, headers: { 'Content-Type': 'text/plain' }, });
}