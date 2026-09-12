import { createMethodHandler } from "./handler";

const { handle, clearCache } = createMethodHandler('DELETE');

export const deleteReq = handle;
export const clearAllModuleCache = clearCache;
