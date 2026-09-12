import { describe, it, expect } from 'bun:test';
import { LRUCache } from '../src/helpers/LRUCache';

describe('LRUCache', () => {
    it('returns undefined for missing keys', () => {
        const c = new LRUCache<string, number>(3);
        expect(c.get('x')).toBeUndefined();
    });

    it('stores and retrieves values', () => {
        const c = new LRUCache<string, number>(3);
        c.set('a', 1);
        expect(c.get('a')).toBe(1);
        expect(c.size).toBe(1);
    });

    it('evicts least recently used when capacity exceeded', () => {
        const c = new LRUCache<string, number>(2);
        c.set('a', 1);
        c.set('b', 2);
        c.set('c', 3); // should evict 'a'
        expect(c.has('a')).toBe(false);
        expect(c.get('b')).toBe(2);
        expect(c.get('c')).toBe(3);
    });

    it('marks accessed keys as recently used', () => {
        const c = new LRUCache<string, number>(2);
        c.set('a', 1);
        c.set('b', 2);
        c.get('a'); // 'a' is now MRU
        c.set('c', 3); // should evict 'b', not 'a'
        expect(c.has('a')).toBe(true);
        expect(c.has('b')).toBe(false);
    });

    it('updating an existing key does not grow size', () => {
        const c = new LRUCache<string, number>(2);
        c.set('a', 1);
        c.set('a', 2);
        expect(c.size).toBe(1);
        expect(c.get('a')).toBe(2);
    });

    it('fires eviction callback on capacity overflow', () => {
        const evicted: Array<[string, number]> = [];
        const c = new LRUCache<string, number>(2, (k, v) => evicted.push([k, v]));
        c.set('a', 1);
        c.set('b', 2);
        c.set('c', 3);
        expect(evicted).toEqual([['a', 1]]);
    });

    it('delete removes key, fires callback, and returns true; false on miss', () => {
        const evicted: Array<[string, number]> = [];
        const c = new LRUCache<string, number>(3, (k, v) => evicted.push([k, v]));
        c.set('a', 1);
        expect(c.delete('a')).toBe(true);
        expect(c.has('a')).toBe(false);
        expect(evicted).toEqual([['a', 1]]);
        expect(c.delete('a')).toBe(false);
    });

    it('clear() does not fire eviction callback by default', () => {
        const evicted: string[] = [];
        const c = new LRUCache<string, number>(3, (k) => evicted.push(k));
        c.set('a', 1);
        c.set('b', 2);
        c.clear();
        expect(c.size).toBe(0);
        expect(evicted).toEqual([]);
    });

    it('clear(true) fires eviction callback for each item', () => {
        const evicted: string[] = [];
        const c = new LRUCache<string, number>(3, (k) => evicted.push(k));
        c.set('a', 1);
        c.set('b', 2);
        c.clear(true);
        expect(evicted.sort()).toEqual(['a', 'b']);
    });

    it('setCapacity shrink triggers evictions', () => {
        const evicted: string[] = [];
        const c = new LRUCache<string, number>(5, (k) => evicted.push(k));
        c.set('a', 1);
        c.set('b', 2);
        c.set('c', 3);
        c.setCapacity(1);
        expect(c.size).toBe(1);
        expect(c.has('c')).toBe(true);
        expect(evicted.sort()).toEqual(['a', 'b']);
    });

    it('keys() returns MRU to LRU order', () => {
        const c = new LRUCache<string, number>(3);
        c.set('a', 1);
        c.set('b', 2);
        c.set('c', 3);
        c.get('a'); // 'a' becomes MRU
        expect(c.keys()).toEqual(['a', 'c', 'b']);
    });
});
