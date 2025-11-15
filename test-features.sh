#!/bin/bash

echo "🧪 Testing NanoWarp New Features"
echo "=================================="
echo ""

# Start the server in the background
echo "Starting server..."
bun examples/advanced-config.ts &
SERVER_PID=$!

# Wait for server to start
sleep 2

echo ""
echo "Testing endpoints..."
echo ""

# Test GET endpoint
echo "1. Testing GET /hello"
curl -s http://localhost:8080/hello
echo ""
echo ""

# Test GET /users
echo "2. Testing GET /users"
curl -s http://localhost:8080/users | jq '.' || curl -s http://localhost:8080/users
echo ""
echo ""

# Test POST /users
echo "3. Testing POST /users"
curl -s -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}' | jq '.' || curl -s -X POST http://localhost:8080/users -H "Content-Type: application/json" -d '{"name":"John Doe","email":"john@example.com"}'
echo ""
echo ""

# Test PUT /users
echo "4. Testing PUT /users"
curl -s -X PUT http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"id":1,"name":"Jane Doe","email":"jane@example.com"}' | jq '.' || curl -s -X PUT http://localhost:8080/users -H "Content-Type: application/json" -d '{"id":1,"name":"Jane Doe","email":"jane@example.com"}'
echo ""
echo ""

# Test PATCH /users
echo "5. Testing PATCH /users"
curl -s -X PATCH http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"id":1,"name":"Updated Name"}' | jq '.' || curl -s -X PATCH http://localhost:8080/users -H "Content-Type: application/json" -d '{"id":1,"name":"Updated Name"}'
echo ""
echo ""

# Test DELETE /users
echo "6. Testing DELETE /users?id=1"
curl -s -X DELETE "http://localhost:8080/users?id=1" | jq '.' || curl -s -X DELETE "http://localhost:8080/users?id=1"
echo ""
echo ""

# Test OpenAPI spec
echo "7. Testing OpenAPI Spec"
curl -s http://localhost:8080/openapi.json | jq '.info' || curl -s http://localhost:8080/openapi.json | head -20
echo ""
echo ""

# Test Swagger UI
echo "8. Testing Swagger UI"
curl -s http://localhost:8080/docs | head -5
echo ""
echo ""

# Test rate limiting (should work)
echo "9. Testing rate limiting (normal request)"
curl -s http://localhost:8080/hello
echo ""
echo ""

echo "✅ All tests completed!"
echo ""

# Kill the server
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo "Server stopped."
