import { createMethodHandler } from "./handler";

const { handle, clearCache } = createMethodHandler('GET');

export const getReq = handle;
export const clearAllModuleCache = clearCache;
