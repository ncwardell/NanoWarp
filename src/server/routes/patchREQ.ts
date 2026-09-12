import { createMethodHandler } from "./handler";

const { handle, clearCache } = createMethodHandler('PATCH');

export const patchReq = handle;
export const clearAllModuleCache = clearCache;
