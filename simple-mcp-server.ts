/**
 * SIMPLE MCP SERVER - Petfinder API Integration
 * 
 * This is a complete, single-file example of how to wrap the Petfinder API 
 * with the Model Context Protocol (MCP).
 * 
 * Key concepts demonstrated:
 * 1. MCP Protocol Implementation - JSON-RPC over HTTP
 * 2. OAuth Token Management - Client credentials flow with caching
 * 3. Tool Registration - Exposing Petfinder API functions as MCP tools
 * 4. Input Validation - Using Zod schemas
 */

import { serve } from 'bun';
import { z } from 'zod';

// =============================================================================
// ENVIRONMENT & CONFIGURATION
// =============================================================================

// No global credentials needed - we'll pass them through the call chain

console.log('🔧 Petfinder MCP Server starting...');
console.log('🔑 Authentication required: x-petfinder-client-id and x-petfinder-client-secret headers');
console.log('🏢 Multi-client support: Each client ID gets its own token cache');
const PETFINDER_BASE = 'https://api.petfinder.com/v2';

// =============================================================================
// OAUTH TOKEN MANAGEMENT - Petfinder Client Credentials Flow
// =============================================================================

interface TokenCache {
  access_token: string;
  expires_at: number; // Unix timestamp
}

// Per-client token cache - supports multiple clients with different credentials
const tokenCache = new Map<string, TokenCache>();

function cleanupExpiredTokens() {
  const now = Math.floor(Date.now() / 1000);
  let cleanedCount = 0;
  
  for (const [clientId, token] of tokenCache.entries()) {
    if (token.expires_at <= now) {
      tokenCache.delete(clientId);
      cleanedCount++;
      console.log(`🧹 Cleaned up expired token for client: ${clientId}`);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired tokens. Active tokens: ${tokenCache.size}`);
  }
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing Petfinder credentials. Provide x-petfinder-client-id and x-petfinder-client-secret headers.');
  }
  
  // Clean up expired tokens periodically
  cleanupExpiredTokens();
  
  // Check if we have a valid cached token for this client
  const cachedToken = tokenCache.get(clientId);
  if (cachedToken && cachedToken.expires_at > now + 60) {
    console.log(`🔄 Using cached token for client: ${clientId}`);
    return cachedToken.access_token;
  }

  console.log('🔄 Requesting new Petfinder access token...');
  console.log(`🔑 Using Client ID: ${clientId}`);
  
  const response = await fetch(`${PETFINDER_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new PetfinderAPIError(
      response.status,
      response.statusText,
      errorText,
      `OAuth token request failed (${response.status}): ${errorText}`
    );
  }

  const tokenData = await response.json() as {
    token_type: string;
    expires_in: number;
    access_token: string;
  };

  // Cache the token for this specific client
  const newToken: TokenCache = {
    access_token: tokenData.access_token,
    expires_at: now + tokenData.expires_in,
  };
  
  tokenCache.set(clientId, newToken);

  console.log(`✅ New access token obtained for client ${clientId}, expires in ${tokenData.expires_in} seconds`);
  console.log(`📊 Total cached tokens: ${tokenCache.size}`);
  
  return newToken.access_token;
}

// =============================================================================
// INPUT VALIDATION SCHEMAS
// =============================================================================

const animalSearchSchema = z.object({
  type: z.enum(['dog', 'cat', 'small-furry', 'bird', 'scales-fins-other', 'barnyard', 'rabbit', 'horse']).optional(),
  breed: z.array(z.string()).optional(),
  size: z.array(z.enum(['small', 'medium', 'large', 'extra-large'])).optional(),
  gender: z.array(z.enum(['male', 'female', 'unknown'])).optional(),
  age: z.array(z.enum(['baby', 'young', 'adult', 'senior'])).optional(),
  color: z.array(z.string()).optional(),
  coat: z.array(z.enum(['short', 'medium', 'long', 'wire', 'hairless', 'curly'])).optional(),
  status: z.enum(['adoptable', 'adopted', 'found']).optional().default('adoptable'),
  name: z.string().optional(),
  organization: z.array(z.string()).optional(),
  location: z.string().optional(),
  distance: z.number().int().positive().optional(),
  sort: z.enum(['recent', '-recent', 'distance', '-distance', 'random']).optional().default('recent'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const animalGetSchema = z.object({
  id: z.number().int().positive(),
});

const organizationSearchSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  distance: z.number().int().positive().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  query: z.string().optional(),
  sort: z.enum(['distance', '-distance', 'name', '-name', 'country', '-country', 'state', '-state']).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const organizationGetSchema = z.object({
  id: z.string(),
});

const animalTypesSchema = z.object({});

const animalTypeSchema = z.object({
  type: z.string(),
});

const animalBreedsSchema = z.object({
  type: z.string(),
});

// =============================================================================
// PETFINDER API FUNCTIONS - Direct API Wrappers
// =============================================================================

// Context for passing credentials through the request chain
let requestContext: { clientId?: string; clientSecret?: string } = {};

async function petfinderRequest(endpoint: string, params?: Record<string, any>) {
  const { clientId, clientSecret } = requestContext;
  
  if (!clientId || !clientSecret) {
    throw new Error('Request context missing credentials');
  }
  
  const token = await getAccessToken(clientId, clientSecret);
  
  let url = `${PETFINDER_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v.toString()));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorBody;
    try {
      errorBody = JSON.parse(errorText);
    } catch {
      errorBody = errorText;
    }
    throw new PetfinderAPIError(
      response.status,
      response.statusText,
      errorBody,
      `Petfinder API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

async function searchAnimals(params: z.infer<typeof animalSearchSchema>) {
  return await petfinderRequest('/animals', params);
}

async function getAnimal(params: z.infer<typeof animalGetSchema>) {
  return await petfinderRequest(`/animals/${params.id}`);
}

async function searchOrganizations(params: z.infer<typeof organizationSearchSchema>) {
  return await petfinderRequest('/organizations', params);
}

async function getOrganization(params: z.infer<typeof organizationGetSchema>) {
  return await petfinderRequest(`/organizations/${params.id}`);
}

async function getAnimalTypes() {
  return await petfinderRequest('/types');
}

async function getAnimalType(params: z.infer<typeof animalTypeSchema>) {
  return await petfinderRequest(`/types/${params.type}`);
}

async function getAnimalBreeds(params: z.infer<typeof animalBreedsSchema>) {
  return await petfinderRequest(`/types/${params.type}/breeds`);
}

// =============================================================================
// JSON SCHEMA UTILITIES
// =============================================================================

function zodToMCPSchema(schema: z.ZodObject<any>) {
  const jsonSchema = z.toJSONSchema(schema) as any;
  
  // Fix the required array - remove fields that are optional or have defaults
  if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
    const shape = schema.shape;
    jsonSchema.required = jsonSchema.required.filter((fieldName: string) => {
      const field = shape[fieldName];
      // Remove from required if field is optional or has a default
      return !field.isOptional() && field._def.defaultValue === undefined;
    });
    
    // If no truly required fields, remove the required array entirely
    if (jsonSchema.required.length === 0) {
      delete jsonSchema.required;
    }
  }
  
  return jsonSchema;
}

// =============================================================================
// MCP TOOL IMPLEMENTATIONS
// =============================================================================

async function searchPets(input: any) {
  // Apply defaults before validation
  const inputWithDefaults = {
    status: 'adoptable',
    sort: 'recent',
    page: 1,
    limit: 20,
    ...input // User input overrides defaults
  };
  
  const validatedInput = animalSearchSchema.parse(inputWithDefaults);
  const result = await searchAnimals(validatedInput) as any;
  return {
    content: [
      {
        type: 'text',
        text: `Found ${result.animals?.length || 0} pets matching your search criteria.`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function getPet(input: z.infer<typeof animalGetSchema>) {
  const result = await getAnimal(input);
  return {
    content: [
      {
        type: 'text',
        text: `Pet details for ID ${input.id}:`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function searchOrgs(input: any) {
  // Apply defaults before validation
  const inputWithDefaults = {
    page: 1,
    limit: 20,
    ...input // User input overrides defaults
  };
  
  const validatedInput = organizationSearchSchema.parse(inputWithDefaults);
  const result = await searchOrganizations(validatedInput) as any;
  return {
    content: [
      {
        type: 'text',
        text: `Found ${result.organizations?.length || 0} organizations matching your search criteria.`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function getOrg(input: z.infer<typeof organizationGetSchema>) {
  const result = await getOrganization(input);
  return {
    content: [
      {
        type: 'text',
        text: `Organization details for ID ${input.id}:`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function listAnimalTypes() {
  const result = await getAnimalTypes();
  return {
    content: [
      {
        type: 'text',
        text: 'Available animal types:',
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function getAnimalTypeDetails(input: z.infer<typeof animalTypeSchema>) {
  const result = await getAnimalType(input);
  return {
    content: [
      {
        type: 'text',
        text: `Animal type details for ${input.type}:`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function listAnimalBreeds(input: z.infer<typeof animalBreedsSchema>) {
  const result = await getAnimalBreeds(input);
  return {
    content: [
      {
        type: 'text',
        text: `Available breeds for ${input.type}:`,
      },
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

// =============================================================================
// MCP PROTOCOL IMPLEMENTATION
// =============================================================================

interface MCPRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: {
      type?: string;
      status?: number;
      title?: string;
      detail?: string;
      'invalid-params'?: Array<{
        in: string;
        path: string;
        message: string;
      }>;
    };
  };
}

class PetfinderAPIError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: any,
    message?: string
  ) {
    super(message || `Petfinder API error (${status}): ${statusText}`);
    this.name = 'PetfinderAPIError';
  }
}

function mapHTTPStatusToJSONRPCError(status: number): number {
  switch (status) {
    case 400: return -32602; // Invalid params
    case 401: return -32001; // Unauthorized (custom code)
    case 403: return -32002; // Forbidden (custom code)
    case 404: return -32003; // Not found (custom code)
    case 429: return -32004; // Rate limited (custom code)
    case 500:
    case 502:
    case 503:
    case 504: return -32603; // Internal error
    default: return -32603; // Internal error
  }
}

function createErrorResponse(
  id: number | string,
  error: Error | PetfinderAPIError,
  fallbackCode: number = -32603
): MCPResponse {
  if (error instanceof PetfinderAPIError) {
    const code = mapHTTPStatusToJSONRPCError(error.status);
    let errorData: any = {
      status: error.status,
      title: error.statusText,
      detail: error.message,
    };

    // Try to parse RFC 7807 error format from response body
    try {
      if (typeof error.body === 'string') {
        const parsedBody = JSON.parse(error.body);
        if (parsedBody.type) errorData.type = parsedBody.type;
        if (parsedBody.title) errorData.title = parsedBody.title;
        if (parsedBody.detail) errorData.detail = parsedBody.detail;
        if (parsedBody['invalid-params']) {
          errorData['invalid-params'] = parsedBody['invalid-params'];
        }
      } else if (typeof error.body === 'object' && error.body !== null) {
        errorData = { ...errorData, ...error.body };
      }
    } catch {
      // Keep original error data if parsing fails
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message: getErrorMessage(error.status),
        data: errorData,
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: fallbackCode,
      message: error.message,
    },
  };
}

function getErrorMessage(status: number): string {
  switch (status) {
    case 400: return 'Invalid request parameters';
    case 401: return 'Authentication failed - invalid credentials';
    case 403: return 'Access denied - insufficient permissions';
    case 404: return 'Resource not found';
    case 429: return 'Rate limit exceeded';
    case 500: return 'Internal server error';
    case 502: return 'Bad gateway';
    case 503: return 'Service unavailable';
    case 504: return 'Gateway timeout';
    default: return 'Unknown error';
  }
}

const serverInfo = {
  name: 'petfinder-mcp',
  version: '1.0.0',
};

const tools = [
  {
    name: 'pets.search',
    title: 'Search for adoptable pets',
    description: 'Search for adoptable pets by type, breed, size, location, and other criteria. Optional parameters: status (default: "adoptable"), sort (default: "recent"), page (default: 1), limit (default: 20).',
    inputSchema: zodToMCPSchema(animalSearchSchema),
  },
  {
    name: 'pets.get',
    title: 'Get pet details',
    description: 'Get detailed information about a specific pet by ID.',
    inputSchema: zodToMCPSchema(animalGetSchema),
  },
  {
    name: 'organizations.search',
    title: 'Search for animal welfare organizations',
    description: 'Search for animal welfare organizations by name, location, and other criteria. Optional parameters: sort, page (default: 1), limit (default: 20).',
    inputSchema: zodToMCPSchema(organizationSearchSchema),
  },
  {
    name: 'organizations.get',
    title: 'Get organization details',
    description: 'Get detailed information about a specific organization by ID.',
    inputSchema: zodToMCPSchema(organizationGetSchema),
  },
  {
    name: 'types.list',
    title: 'List animal types',
    description: 'Get a list of all available animal types.',
    inputSchema: zodToMCPSchema(animalTypesSchema),
  },
  {
    name: 'types.get',
    title: 'Get animal type details',
    description: 'Get detailed information about a specific animal type.',
    inputSchema: zodToMCPSchema(animalTypeSchema),
  },
  {
    name: 'breeds.list',
    title: 'List animal breeds',
    description: 'Get a list of breeds for a specific animal type.',
    inputSchema: zodToMCPSchema(animalBreedsSchema),
  },
];

const allTools = {
  'pets.search': searchPets,
  'pets.get': getPet,
  'organizations.search': searchOrgs,
  'organizations.get': getOrg,
  'types.list': listAnimalTypes,
  'types.get': getAnimalTypeDetails,
  'breeds.list': listAnimalBreeds,
};

function extractCredentialsFromHeaders(headers: Headers): { clientId?: string; clientSecret?: string } {
  const clientId = headers.get('x-petfinder-client-id');
  const clientSecret = headers.get('x-petfinder-client-secret');

  if (clientId) {
    console.log(`🔑 Found Client ID in header: x-petfinder-client-id`);
  }

  if (clientSecret) {
    console.log(`🔐 Found Client Secret in header: x-petfinder-client-secret`);
  }

  return { clientId, clientSecret };
}

async function handleMCPRequest(
  request: MCPRequest,
  headers: Headers
): Promise<MCPResponse | null> {
  switch (request.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: request.id!,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo,
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: request.id!,
        result: { tools },
      };

    case 'tools/call':
      const { name, arguments: args } = request.params;
      const handler = allTools[name as keyof typeof allTools];
      const { clientId, clientSecret } = extractCredentialsFromHeaders(headers);

      if (!handler) {
        return {
          jsonrpc: '2.0',
          id: request.id!,
          error: {
            code: -32601,
            message: `Tool ${name} not found`,
          },
        };
      }

      // Check for required authentication headers
      if (!clientId || !clientSecret) {
        return {
          jsonrpc: '2.0',
          id: request.id!,
          error: {
            code: -32001,
            message: 'Authentication required - you need to pass both x-petfinder-client-id and x-petfinder-client-secret headers',
          },
        };
      }

      try {
        // Set credentials in request context for this request
        requestContext = { clientId, clientSecret };
        
        // Call the handler - it will use the request context credentials
        const result = await handler(args);

        return {
          jsonrpc: '2.0',
          id: request.id!,
          result: (typeof result === 'object' && result !== null && 'content' in result) ? result : {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      } catch (error) {
        console.error(
          `❌ Tool error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return createErrorResponse(request.id!, error as Error);
      } finally {
        // Clear credentials after request
        requestContext = {};
      }

    default:
      return {
        jsonrpc: '2.0',
        id: request.id || 'unknown',
        error: {
          code: -32601,
          message: `Method ${request.method} not found`,
        },
      };
  }
}

// =============================================================================
// HTTP SERVER
// =============================================================================

const port = parseInt(process.env.PORT ?? '3000', 10);

serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Comprehensive request logging
    console.log('\n🔍 === INCOMING REQUEST ===');
    console.log(`📍 ${req.method} ${url.pathname}${url.search}`);
    console.log(`🌐 Origin: ${req.headers.get('origin') || 'none'}`);
    console.log(`🔗 Referer: ${req.headers.get('referer') || 'none'}`);
    console.log(`👤 User-Agent: ${req.headers.get('user-agent') || 'none'}`);
    
    // Log all headers
    console.log('📋 All Headers:');
    for (const [key, value] of req.headers.entries()) {
      // Mask potential secrets but show the header exists
      if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
        console.log(`   ${key}: [REDACTED - ${value.length} chars]`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    }

    if (req.method === 'OPTIONS') {
      console.log('✅ Handling CORS preflight request');
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (url.pathname === '/healthz') {
      console.log('💚 Health check request');
      return new Response('OK', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (req.method !== 'POST' || url.pathname !== '/mcp') {
      console.log(`❌ Invalid request: ${req.method} ${url.pathname}`);
      return new Response('Not found', { status: 404 });
    }

    try {
      const bodyText = await req.text();
      console.log('📦 Request Body:');
      console.log(bodyText);
      
      const body = JSON.parse(bodyText) as MCPRequest;
      console.log('🔧 Parsed MCP Request:');
      console.log(`   Method: ${body.method}`);
      console.log(`   ID: ${body.id}`);
      if (body.params) {
        console.log('   Params:', JSON.stringify(body.params, null, 2));
      }
      
      const response = await handleMCPRequest(body, req.headers);

      if (response) {
        console.log('✅ Sending MCP Response');
        return new Response(JSON.stringify(response), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        console.log('✅ Sending empty response (204)');
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('❌ Request processing error:', error);
      const errorResponse = createErrorResponse('unknown', error as Error, -32700);

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
});

console.log(`🚀 Petfinder MCP Server listening on port ${port}`);
console.log(`🐾 Ready to help find adoptable pets and organizations!`);