import { createMethodHandler } from "./handler";

const { handle, clearCache } = createMethodHandler('POST');

export const postReq = handle;
export const clearAllModuleCache = clearCache;
