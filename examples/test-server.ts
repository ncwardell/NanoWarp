import { NanoWarp } from "../src";

/**
 * Test server demonstrating NanoWarp features
 *
 * This server runs on port 3001 with a custom data directory.
 * Create endpoints in ./test-data/Endpoints/ to test them.
 *
 * Example endpoints are provided in ./endpoints/ folder.
 * Copy them to ./test-data/Endpoints/ to activate them.
 */

console.log("🚀 Starting NanoWarp test server...");
console.log("📁 Data directory: ./test-data");
console.log("🌐 Server will run on: http://localhost:3001\n");

const server = new NanoWarp(3001, './test-data');
await server.start();

console.log("\n📝 Test endpoints you can create:");
console.log("   GET  /hello     - Simple greeting");
console.log("   GET  /echo      - Echo query parameters");
console.log("   POST /data      - Store and retrieve data");
console.log("   GET  /users     - List users from database");
console.log("\n✨ Edit endpoint files and see changes instantly!");
