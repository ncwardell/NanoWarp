/**
 * JSON Serialization Utilities for Complex Types
 *
 * @module helpers/mappingString
 * @description Provides custom JSON serialization/deserialization functions
 * for handling complex JavaScript types (Map, Set, etc.) that are not natively
 * supported by JSON.stringify/JSON.parse.
 */

/**
 * Internal representation of a serialized Map
 */
interface SerializedMap<K = unknown, V = unknown> {
    dataType: 'Map';
    value: Array<[K, V]>;
}

/**
 * Custom JSON replacer function for serializing Map objects
 *
 * Used with JSON.stringify() to handle Map instances by converting them
 * into a serializable format. This allows Maps to be stored in JSON files
 * or transmitted over the network.
 *
 * @param key - The property key being stringified (unused but required by JSON.stringify signature)
 * @param value - The value being stringified
 * @returns The value to be serialized (Map converted to SerializedMap, others unchanged)
 *
 * @example
 * ```typescript
 * const data = { myMap: new Map([['key1', 'value1'], ['key2', 'value2']]) };
 * const json = JSON.stringify(data, replacer);
 * ```
 */
export function replacer(_key: string, value: unknown): unknown {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()),
        } satisfies SerializedMap;
    }
    return value;
}

/**
 * Custom JSON reviver function for deserializing Map objects
 *
 * Used with JSON.parse() to reconstruct Map instances from their serialized
 * format. This is the inverse operation of the replacer function.
 *
 * @param key - The property key being parsed (unused but required by JSON.parse signature)
 * @param value - The value being parsed
 * @returns The deserialized value (SerializedMap converted back to Map, others unchanged)
 *
 * @example
 * ```typescript
 * const json = '{"myMap":{"dataType":"Map","value":[["key1","value1"],["key2","value2"]]}}';
 * const data = JSON.parse(json, reviver);
 * // data.myMap is now a Map instance
 * ```
 */
export function reviver(_key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
        const obj = value as { dataType?: string; value?: unknown };
        if (obj.dataType === 'Map' && Array.isArray(obj.value)) {
            return new Map(obj.value);
        }
    }
    return value;
}