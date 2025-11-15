/**
 * LRU Cache with O(1) operations
 *
 * @module helpers/LRUCache
 * @description Implements a Least Recently Used (LRU) cache using a doubly-linked list
 * and a Map for O(1) get, set, and eviction operations.
 */

/**
 * Node in the doubly-linked list
 */
class LRUNode<K, V> {
    constructor(
        public key: K,
        public value: V,
        public prev: LRUNode<K, V> | null = null,
        public next: LRUNode<K, V> | null = null
    ) {}
}

/**
 * LRU Cache with automatic eviction
 *
 * Uses a doubly-linked list for maintaining access order and a Map for O(1) lookups.
 * Most recently used items are at the head, least recently used at the tail.
 *
 * @template K - Key type
 * @template V - Value type
 */
export class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, LRUNode<K, V>>;
    private head: LRUNode<K, V> | null = null;
    private tail: LRUNode<K, V> | null = null;
    private evictionCallback?: (key: K, value: V) => void;

    /**
     * Create a new LRU cache
     *
     * @param capacity - Maximum number of items to cache
     * @param evictionCallback - Optional callback when an item is evicted
     */
    constructor(capacity: number, evictionCallback?: (key: K, value: V) => void) {
        this.capacity = capacity;
        this.cache = new Map();
        this.evictionCallback = evictionCallback;
    }

    /**
     * Get the current size of the cache
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get a value from the cache (marks it as recently used)
     *
     * @param key - The key to look up
     * @returns The cached value, or undefined if not found
     */
    get(key: K): V | undefined {
        const node = this.cache.get(key);
        if (!node) return undefined;

        // Move to head (most recently used)
        this.moveToHead(node);
        return node.value;
    }

    /**
     * Set a value in the cache
     *
     * If the key already exists, updates the value and marks it as recently used.
     * If the cache is full, evicts the least recently used item.
     *
     * @param key - The key to store
     * @param value - The value to store
     */
    set(key: K, value: V): void {
        const existingNode = this.cache.get(key);

        if (existingNode) {
            // Update existing node
            existingNode.value = value;
            this.moveToHead(existingNode);
        } else {
            // Create new node
            const newNode = new LRUNode(key, value);
            this.cache.set(key, newNode);
            this.addToHead(newNode);

            // Evict if over capacity
            if (this.cache.size > this.capacity) {
                this.evictLRU();
            }
        }
    }

    /**
     * Check if a key exists in the cache (without marking as recently used)
     *
     * @param key - The key to check
     * @returns true if the key exists, false otherwise
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete a specific key from the cache
     *
     * @param key - The key to delete
     * @returns true if the key was found and deleted, false otherwise
     */
    delete(key: K): boolean {
        const node = this.cache.get(key);
        if (!node) return false;

        this.removeNode(node);
        this.cache.delete(key);

        // Call eviction callback
        if (this.evictionCallback) {
            this.evictionCallback(key, node.value);
        }

        return true;
    }

    /**
     * Clear all items from the cache
     *
     * @param callEvictionCallback - If true, calls the eviction callback for each item
     */
    clear(callEvictionCallback: boolean = false): void {
        if (callEvictionCallback && this.evictionCallback) {
            for (const [key, node] of this.cache.entries()) {
                this.evictionCallback(key, node.value);
            }
        }

        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * Update the cache capacity (may trigger evictions)
     *
     * @param newCapacity - The new capacity
     */
    setCapacity(newCapacity: number): void {
        this.capacity = newCapacity;

        // Evict excess items
        while (this.cache.size > this.capacity) {
            this.evictLRU();
        }
    }

    /**
     * Get all keys in order from most to least recently used
     *
     * @returns Array of keys
     */
    keys(): K[] {
        const keys: K[] = [];
        let current = this.head;
        while (current) {
            keys.push(current.key);
            current = current.next;
        }
        return keys;
    }

    /**
     * Move a node to the head (most recently used)
     *
     * @private
     */
    private moveToHead(node: LRUNode<K, V>): void {
        if (node === this.head) return;

        this.removeNode(node);
        this.addToHead(node);
    }

    /**
     * Add a node to the head of the list
     *
     * @private
     */
    private addToHead(node: LRUNode<K, V>): void {
        node.next = this.head;
        node.prev = null;

        if (this.head) {
            this.head.prev = node;
        }

        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    /**
     * Remove a node from the list (doesn't delete from cache)
     *
     * @private
     */
    private removeNode(node: LRUNode<K, V>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    /**
     * Evict the least recently used item (tail)
     *
     * @private
     */
    private evictLRU(): void {
        if (!this.tail) return;

        const evictedKey = this.tail.key;
        const evictedValue = this.tail.value;

        this.removeNode(this.tail);
        this.cache.delete(evictedKey);

        // Call eviction callback
        if (this.evictionCallback) {
            this.evictionCallback(evictedKey, evictedValue);
        }
    }
}
