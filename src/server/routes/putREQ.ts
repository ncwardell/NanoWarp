import { createMethodHandler } from "./handler";

const { handle, clearCache } = createMethodHandler('PUT');

export const putReq = handle;
export const clearAllModuleCache = clearCache;
