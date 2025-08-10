# Petfinder MCP Server

Single-file HTTP MCP Server for Petfinder's API to find adoptable pets and the organizations that care for them, powered by [Bun](https://bun.com/). 

* **OAuth token management** – automatically handles Petfinder API authentication and token refresh
* **Pet search capabilities** – find adoptable pets by characteristics, location, and status
* **Organization search** – discover animal welfare organizations by name, ID, and location
* **Single file implementation** – complete MCP server in `simple-mcp-server.ts`
* All capabilities are exposed as **MCP tools** over a Bun HTTP server

> **💡 Don't have Bun?** Install it from [https://bun.com/](https://bun.com/)

## 🏗️ Built With

This single-file MCP server uses:

- **[Bun's built-in HTTP server](https://bun.com/docs/api/http)** - Ultra-fast native HTTP handling with zero dependencies
- **[Zod](https://zod.dev/)** - TypeScript-first schema validation for bulletproof input validation
- **[Petfinder API v2](https://www.petfinder.com/developers/)** - RESTful API for accessing adoptable pets and animal welfare organizations
- **Native fetch** - Built-in HTTP client for API calls

---

## 🔐 Authentication

This MCP server handles Petfinder OAuth authentication automatically via **query parameters**:

### **Query Parameter Authentication**
Add your Petfinder credentials as query parameters to the MCP server URL:
```
http://localhost:3000/mcp?client-id=your-petfinder-client-id&client-secret=your-petfinder-client-secret
```

### **OAuth Flow Management**
- **Client credentials flow**: Exchanges your credentials for access tokens automatically
- **Multi-client token caching**: Each client ID gets its own isolated token cache
- **Automatic token management**: Caches tokens in-memory with expiration tracking per client
- **Token refresh**: Automatically requests new access tokens when expired (every 3600 seconds)
- **Bearer token authentication**: Uses access tokens in `Authorization: Bearer {token}` headers

### **MCP Client Integration**
When adding this MCP server to MCP clients (Claude.ai, MCP Inspector, etc.):
1. Use the server URL with your credentials: `http://localhost:3000/mcp?client-id=your-client-id&client-secret=your-client-secret`
2. No additional headers or configuration needed
3. The server automatically extracts credentials from the URL query parameters
4. Works seamlessly with all MCP clients that support HTTP servers

---

## ✨ Features

| Capability                         | Petfinder API endpoint                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| Search for adoptable pets         | `GET /v2/animals` with various search parameters             |
| Get specific pet details           | `GET /v2/animals/{id}` for detailed pet information          |
| Search animal welfare organizations| `GET /v2/organizations` by name, location, or ID            |
| Get organization details           | `GET /v2/organizations/{id}` for detailed organization info  |
| List all animal types              | `GET /v2/types` for available animal types                   |
| Get animal type details            | `GET /v2/types/{type}` for specific animal type info         |
| List breeds for animal type        | `GET /v2/types/{type}/breeds` for breeds of specific type    |

Typical MCP request:

```json
POST /mcp
{
  "tool": "pets.search",
  "input": {
    "type": "dog",
    "breed": "labrador",
    "size": "medium",
    "location": "90210",
    "distance": 25,
    "limit": 20
  }
}
```

---

## 🗂 Repo layout

```
.
├─ simple-mcp-server.ts    # Complete single-file MCP server
├─ package.json            # Dependencies (bun, zod)
├─ tsconfig.json          # TypeScript configuration
├─ Dockerfile             # Container deployment
└─ README.md              # This file
```

The entire MCP server is implemented in a single TypeScript file (`simple-mcp-server.ts`) that handles OAuth token management and Petfinder API integration.

---

## ⚙️ Prerequisites

1. **Petfinder API credentials**

   * Sign up for a developer account at [https://www.petfinder.com/developers/](https://www.petfinder.com/developers/)
   * Create an application to get your **API Key** (Client ID) and **Secret**
   * No additional permissions or approval needed - the API uses OAuth client credentials flow

2. **Bun ≥ 1.2.19** installed locally (or let Docker handle it).

---

## 🌍 Configuration

| Name                | Example                                | Required | Description |
| ------------------- | -------------------------------------- | -------- | ----------- |
| `PORT`              | `3000`                                | ❌ | Server port (defaults to 3000) |

**🔑 Authentication:** Credentials are provided via query parameters only - no environment variables needed!

**Getting your credentials:**
1. Create a Petfinder account at [petfinder.com](https://petfinder.com) if you don't have one
2. Get your API Key (Client ID) and Secret at [petfinder.com/user/developer-settings](https://www.petfinder.com/user/developer-settings/)
3. Use these credentials as query parameters when connecting to the MCP server

---

## 🧪 Development & Testing

You can use the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to interactively test this server.

1.  **Start the server** in one terminal:
    ```bash
    bun run simple-mcp-server.ts
    ```

2.  **Run the inspector** in another terminal with your credentials:
    ```bash
    npx @modelcontextprotocol/inspector "http://localhost:3000/mcp?client-id=your-client-id&client-secret=your-client-secret"
    ```

This will launch a web UI where you can see all available tools and manually trigger them with different parameters, making it easy to debug your tool logic.

## ▶️ Running locally

```bash
# Install deps
bun install

# Run server on port 3000 (no environment variables needed!)
bun run simple-mcp-server.ts
```

Send a request:
```bash
curl -X POST "http://localhost:3000/mcp?client-id=your-client-id&client-secret=your-client-secret" \
  -H "Content-Type: application/json" \
  -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
          "name": "pets.search",
          "arguments": {
            "type": "dog",
            "breed": "labrador",
            "location": "90210",
            "distance": 25,
            "limit": 10
          }
        }
      }'
```
You’ll get real JSON responses from the Petfinder API using your provided credentials.

### Additional endpoints
| Route | Method | Purpose |
|-------|--------|---------|
| `/healthz` | GET/HEAD | Simple health-check (returns `200 OK`) |

All responses include `Access-Control-Allow-Origin: *` so the MCP can be called from a browser without extra CORS configuration.

---

## 🐾 OAuth Token Management

The server handles Petfinder API authentication automatically:

* **Token exchange**: Uses `CLIENT_ID` and `CLIENT_SECRET` to request access tokens from `https://api.petfinder.com/v2/oauth2/token`
* **In-memory caching**: Caches access tokens in-memory with expiration tracking (tokens expire after 3600 seconds)
* **Automatic refresh**: Detects expired tokens and automatically requests new ones before making API calls
* **Bearer authentication**: Includes `Authorization: Bearer {access_token}` header in all Petfinder API requests

The OAuth flow follows Petfinder's client credentials pattern:
```bash
curl -d "grant_type=client_credentials&client_id={CLIENT-ID}&client_secret={CLIENT-SECRET}" \
  https://api.petfinder.com/v2/oauth2/token
```

Response format:
```json
{
  "token_type": "Bearer",
  "expires_in": 3600,
  "access_token": "..."
}
```


## 🛠️ MCP tool set

| Tool                    | Purpose                        | Input → Output                                                   |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `pets.search`           | find adoptable pets            | `{ type?, breed?, size?, location?, distance?, limit? }` → pets array |
| `pets.get`              | get specific pet details       | `{ id }` → detailed pet object                                   |
| `organizations.search`  | find animal welfare orgs       | `{ name?, location?, state?, country?, limit? }` → organizations array |
| `organizations.get`     | get specific org details       | `{ id }` → detailed organization object                          |
| `types.list`            | list all animal types          | `{}` → animal types array                                        |
| `types.get`             | get animal type details        | `{ type }` → detailed animal type object                         |
| `breeds.list`           | list breeds for animal type    | `{ type }` → breeds array                                        |

**🔍 Search Parameters:**
- **Pet search**: Filter by animal type (dog, cat, etc.), breed, size (small/medium/large), location (ZIP/postal code), distance radius
- **Organization search**: Filter by name, location, state/province, country
- **Pagination**: Use `limit` parameter to control result count (default: 20, max: 100)
- **Location-based**: Distance searches require a location parameter (ZIP code, city, etc.)

**📊 Response Data:**
- **Pet objects**: Include photos, description, age, gender, size, breed, contact info, and adoption status
- **Organization objects**: Include name, address, phone, email, website, and mission statement
- **Rich metadata**: Comprehensive information to help users make informed adoption decisions

---

## 🔍 MCP Client Integration & Debugging

This server includes comprehensive request logging to help you integrate with MCP clients:

**Example with query parameter authentication:**
```bash
curl -X POST "http://localhost:3000/mcp?client-id=your-client-id&client-secret=your-client-secret" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

**Debug Output:** The server logs all incoming requests, query parameters, and authentication attempts to help you see exactly what your MCP client is sending and troubleshoot any authentication issues.

### Search Examples

**Pet Search Examples:**

```bash
# Find dogs in Los Angeles area
{ "type": "dog", "location": "90210", "distance": 25 }

# Find small cats ready for adoption
{ "type": "cat", "size": "small", "limit": 10 }

# Find specific breed
{ "type": "dog", "breed": "golden retriever", "location": "New York, NY" }
```

**Organization Search Examples:**

```bash
# Find shelters by name
{ "name": "SPCA" }

# Find organizations in specific state
{ "state": "CA", "limit": 15 }

# Find organizations near location
{ "location": "Austin, TX" }
```

**Typical Pet Response includes:**
- `id` - Unique pet identifier
- `name` - Pet's name
- `photos` - Array of photo URLs
- `description` - Detailed description
- `breeds` - Primary and secondary breeds
- `age`, `gender`, `size` - Basic characteristics
- `contact` - Organization contact information
- `status` - Adoption status (adoptable, pending, etc.)