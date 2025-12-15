# Brave Search MCP Server

An MCP server implementation that integrates the Brave Search API, providing comprehensive search capabilities including web search, local business search, image search, video search, news search, and AI-powered summarization. This project supports both STDIO and HTTP transports, with STDIO as the default mode.

## Fork Information

This project is a **direct fork** of the official [Brave Search MCP Server](https://github.com/brave/brave-search-mcp-server) by Brave Software, Inc.

### Improvements & Additions

The following enhancements have been made to the original codebase:

#### VPS Deployment Support
- **HTTP Server Enhancements**: Added `/health` endpoint for container health checks and monitoring
- **CORS Support**: Added CORS middleware for cross-origin requests in VPS deployments
- **Flexible API Key Authentication**: API key can now be provided via:
  - Query parameter (`?apiKey=YOUR_KEY` or `?api_key=YOUR_KEY`)
  - HTTP header (`x-api-key` or `Authorization: Bearer YOUR_KEY`)
  - Environment variable (`BRAVE_API_KEY`)
- **Docker Compose**: Enhanced configuration with proper container naming, networking, logging, and health checks
- **Nginx Configuration**: Included reverse proxy configuration for VPS deployment
- **GitHub Actions Workflow**: Added auto-deployment workflow for CI/CD to VPS

#### Infrastructure
- **Health Check Endpoint**: Returns server status, version, transport type, and timestamp for monitoring
- **Multi-stage Docker Build**: Optimized Dockerfile with health check and proper environment defaults
- **Production-Ready Configuration**: Container runs with security best practices (non-root user, capability drops)

#### Analytics & Monitoring
- **Analytics Dashboard**: Real-time visual dashboard with Chart.js charts at `/analytics/dashboard`
- **Analytics API**: JSON endpoint at `/analytics` for programmatic access to usage statistics
- **Persistent Storage**: Analytics data persists across container restarts via Docker volumes
- **Request Tracking**: Tracks requests by method, endpoint, client IP, and user agent
- **Tool Call Tracking**: Monitors which Brave Search tools are used most frequently
- **Hourly Metrics**: Time-series data for the last 24 hours of requests
- **Backup/Restore**: Import endpoint for restoring analytics from backups

## Tools

### Web Search (`brave_web_search`)
Performs comprehensive web searches with rich result types and advanced filtering options.

**Parameters:**
- `query` (string, required): Search terms (max 400 chars, 50 words)
- `country` (string, optional): Country code (default: "US")
- `search_lang` (string, optional): Search language (default: "en")
- `ui_lang` (string, optional): UI language (default: "en-US")
- `count` (number, optional): Results per page (1-20, default: 10)
- `offset` (number, optional): Pagination offset (max 9, default: 0)
- `safesearch` (string, optional): Content filtering ("off", "moderate", "strict", default: "moderate")
- `freshness` (string, optional): Time filter ("pd", "pw", "pm", "py", or date range)
- `text_decorations` (boolean, optional): Include highlighting markers (default: true)
- `spellcheck` (boolean, optional): Enable spell checking (default: true)
- `result_filter` (array, optional): Filter result types (default: ["web", "query"])
- `goggles` (array, optional): Custom re-ranking definitions
- `units` (string, optional): Measurement units ("metric" or "imperial")
- `extra_snippets` (boolean, optional): Get additional excerpts (Pro plans only)
- `summary` (boolean, optional): Enable summary key generation for AI summarization

### Local Search (`brave_local_search`)
Searches for local businesses and places with detailed information including ratings, hours, and AI-generated descriptions.

**Parameters:**
- Same as `brave_web_search` with automatic location filtering
- Automatically includes "web" and "locations" in result_filter

**Note:** Requires Pro plan for full local search capabilities. Falls back to web search otherwise.

### Video Search (`brave_video_search`)
Searches for videos with comprehensive metadata and thumbnail information.

**Parameters:**
- `query` (string, required): Search terms (max 400 chars, 50 words)
- `country` (string, optional): Country code (default: "US")
- `search_lang` (string, optional): Search language (default: "en")
- `ui_lang` (string, optional): UI language (default: "en-US")
- `count` (number, optional): Results per page (1-50, default: 20)
- `offset` (number, optional): Pagination offset (max 9, default: 0)
- `spellcheck` (boolean, optional): Enable spell checking (default: true)
- `safesearch` (string, optional): Content filtering ("off", "moderate", "strict", default: "moderate")
- `freshness` (string, optional): Time filter ("pd", "pw", "pm", "py", or date range)

### Image Search (`brave_image_search`)
Searches for images with automatic fetching and base64 encoding for direct display.

**Parameters:**
- `query` (string, required): Search terms (max 400 chars, 50 words)
- `country` (string, optional): Country code (default: "US")
- `search_lang` (string, optional): Search language (default: "en")
- `count` (number, optional): Results per page (1-200, default: 50)
- `safesearch` (string, optional): Content filtering ("off", "strict", default: "strict")
- `spellcheck` (boolean, optional): Enable spell checking (default: true)

### News Search (`brave_news_search`)
Searches for current news articles with freshness controls and breaking news indicators.

**Parameters:**
- `query` (string, required): Search terms (max 400 chars, 50 words)
- `country` (string, optional): Country code (default: "US")
- `search_lang` (string, optional): Search language (default: "en")
- `ui_lang` (string, optional): UI language (default: "en-US")
- `count` (number, optional): Results per page (1-50, default: 20)
- `offset` (number, optional): Pagination offset (max 9, default: 0)
- `spellcheck` (boolean, optional): Enable spell checking (default: true)
- `safesearch` (string, optional): Content filtering ("off", "moderate", "strict", default: "moderate")
- `freshness` (string, optional): Time filter (default: "pd" for last 24 hours)
- `extra_snippets` (boolean, optional): Get additional excerpts (Pro plans only)
- `goggles` (array, optional): Custom re-ranking definitions

### Summarizer Search (`brave_summarizer`)
Generates AI-powered summaries from web search results using Brave's summarization API.

**Parameters:**
- `key` (string, required): Summary key from web search results (use `summary: true` in web search)
- `entity_info` (boolean, optional): Include entity information (default: false)
- `inline_references` (boolean, optional): Add source URL references (default: false)

**Usage:** First perform a web search with `summary: true`, then use the returned summary key with this tool.

## Configuration

### Getting an API Key

1. Sign up for a [Brave Search API account](https://brave.com/search/api/)
2. Choose a plan:
   - **Free**: 2,000 queries/month, basic web search
   - **Pro**: Enhanced features including local search, AI summaries, extra snippets
3. Generate your API key from the [developer dashboard](https://api-dashboard.search.brave.com/app/keys)

### Environment Variables

The server supports the following environment variables:

- `BRAVE_API_KEY`: Your Brave Search API key (required)
- `BRAVE_MCP_TRANSPORT`: Transport mode ("http" or "stdio", default: "stdio")
- `BRAVE_MCP_PORT`: HTTP server port (default: 8080)
- `BRAVE_MCP_HOST`: HTTP server host (default: "0.0.0.0")
- `BRAVE_MCP_LOG_LEVEL`: Desired logging level("debug", "info", "notice", "warning", "error", "critical", "alert", or "emergency", default: "info")
- `BRAVE_MCP_ENABLED_TOOLS`: When used, specifies a whitelist for supported tools
- `BRAVE_MCP_DISABLED_TOOLS`: When used, specifies a blacklist for supported tools

### Command Line Options

```bash
node dist/index.js [options]

Options:
  --brave-api-key <string>    Brave API key
  --transport <stdio|http>    Transport type (default: stdio)
  --port <number>             HTTP server port (default: 8080)
  --host <string>             HTTP server host (default: 0.0.0.0)
  --logging-level <string>    Desired logging level (one of _debug_, _info_, _notice_, _warning_, _error_, _critical_, _alert_, or _emergency_)
  --enabled-tools             Tools whitelist (only the specified tools will be enabled)
  --disabled-tools            Tools blacklist (included tools will be disabled)
```

## Installation

### Installing via Smithery

To install Brave Search automatically via [Smithery](https://smithery.ai/server/brave):

```bash
npx -y @smithery/cli install brave
```

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "BRAVE_API_KEY", "docker.io/mcp/brave-search"],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

#### NPX

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@brave/brave-search-mcp-server", "--transport", "http"],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Usage with VS Code

For quick installation, use the one-click installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave-search&inputs=%5B%7B%22password%22%3Atrue%2C%22id%22%3A%22brave-api-key%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Brave+Search+API+Key%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40brave%2Fbrave-search-mcp-server%22%2C%22--transport%22%2C%22stdio%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave-api-key%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave-search&inputs=%5B%7B%22password%22%3Atrue%2C%22id%22%3A%22brave-api-key%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Brave+Search+API+Key%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40brave%2Fbrave-search-mcp-server%22%2C%22--transport%22%2C%22stdio%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave-api-key%7D%22%7D%7D&quality=insiders)  
[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave-search&inputs=%5B%7B%22password%22%3Atrue%2C%22id%22%3A%22brave-api-key%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Brave+Search+API+Key%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22BRAVE_API_KEY%22%2C%22mcp%2Fbrave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave-api-key%7D%22%7D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave-search&inputs=%5B%7B%22password%22%3Atrue%2C%22id%22%3A%22brave-api-key%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Brave+Search+API+Key%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22BRAVE_API_KEY%22%2C%22mcp%2Fbrave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave-api-key%7D%22%7D%7D&quality=insiders)

For manual installation, add the following to your User Settings (JSON) or `.vscode/mcp.json`:

#### Docker

```json
{
  "inputs": [
    {
      "password": true,
      "id": "brave-api-key",
      "type": "promptString",
      "description": "Brave Search API Key",
    }
  ],
  "servers": {
    "brave-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "BRAVE_API_KEY", "mcp/brave-search"],
      "env": {
        "BRAVE_API_KEY": "${input:brave-api-key}"
      }
    }
  }
}
```

#### NPX

```json
{
  "inputs": [
    {
      "password": true,
      "id": "brave-api-key",
      "type": "promptString",
      "description": "Brave Search API Key",
    }
  ],
  "servers": {
    "brave-search-mcp-server": {
      "command": "npx",
      "args": ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"],
      "env": {
        "BRAVE_API_KEY": "${input:brave-api-key}"
      }
    }
  }
}
```

## Build

### Docker

```bash
docker build -t mcp/brave-search:latest .
```

### Local Build

```bash
npm install
npm run build
```

## Development

### Prerequisites

- Node.js 22.x or higher
- npm
- Brave Search API key

### Setup

1. Clone the repository:
```bash
git clone https://github.com/brave/brave-search-mcp-server.git
cd brave-search-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Testing via Claude Desktop

Add a reference to your local build in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brave-search-dev": {
      "command": "node",
      "args": ["C:\\GitHub\\brave-search-mcp-server\\dist\\index.js"], // Verify your path
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Testing via MCP Inspector

1. Build and start the server:
```bash
npm run build
node dist/index.js
```

2. In another terminal, start the MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

STDIO is the default mode. For HTTP mode testing, add `--transport http` to the arguments in the Inspector UI.

### Testing via Smithery.AI

1. Establish and acquire a smithery.ai account and API key
2. Run `npm run install`, `npm run smithery:build`, and lastly `npm run smithery:dev` to begin testing

### Available Scripts

- `npm run build`: Build the TypeScript project
- `npm run watch`: Watch for changes and rebuild
- `npm run format`: Format code with Prettier
- `npm run format:check`: Check code formatting
- `npm run prepare`: Format and build (runs automatically on npm install)

- `npm run inspector`: Launch an instance of MCP Inspector
- `npm run inspector:stdio`: Launch a instance of MCP Inspector, configured for STDIO
- `npm run smithery:build`: Build the project for smithery.ai
- `npm run smithery:dev`: Launch the development environment for smithery.ai

### Docker Compose

For local development with Docker:

```bash
docker-compose up --build
```

## VPS Deployment

This server supports deployment to a VPS with Docker, Nginx reverse proxy, and GitHub Actions auto-deployment.

### Architecture

```
Client (Claude, Cursor, Windsurf, etc.)
    ↓ HTTPS
https://mcp.yourdomain.com/bravesearch/mcp
    ↓
Nginx (SSL termination + reverse proxy)
    ↓ HTTP
Docker Container (port 8088 → 8080)
    ↓
MCP Server (Streamable HTTP Transport)
    ↓
Brave Search API
```

### API Key Options

For HTTP transport, the API key can be provided via multiple methods (in priority order):

1. **Query parameter**: `?apiKey=YOUR_KEY` or `?api_key=YOUR_KEY`
2. **HTTP header**: `x-api-key: YOUR_KEY` or `Authorization: Bearer YOUR_KEY`
3. **Environment variable**: `BRAVE_API_KEY`

### Client Configuration

```json
{
  "mcpServers": {
    "brave-search": {
      "transport": "streamable-http",
      "url": "https://mcp.yourdomain.com/bravesearch/mcp?apiKey=YOUR_BRAVE_API_KEY"
    }
  }
}
```

### Deployment Files

The following files are included for VPS deployment:

- **`Dockerfile`** - Multi-stage Docker build with health check
- **`docker-compose.yml`** - Docker orchestration with networking and logging
- **`deploy/nginx-mcp.conf`** - Nginx reverse proxy configuration
- **`.github/workflows/deploy-vps.yml`** - GitHub Actions auto-deployment workflow

### First-Time VPS Setup

1. **Clone the repository on your VPS:**
   ```bash
   mkdir -p /opt/mcp-servers/mcp-bravesearch
   cd /opt/mcp-servers/mcp-bravesearch
   git clone https://github.com/your-username/mcp-bravesearch.git .
   ```

2. **(Optional) Create `.env` file for default API key:**
   ```bash
   echo "BRAVE_API_KEY=your-api-key-here" > .env
   ```

3. **Build and start the container:**
   ```bash
   docker compose up -d --build
   ```

4. **Configure Nginx** - Add the location block from `deploy/nginx-mcp.conf` to your Nginx server config:
   ```bash
   sudo nano /etc/nginx/sites-available/your-domain
   # Add the location block inside the server { } block
   sudo nginx -t
   sudo systemctl reload nginx
   ```

### GitHub Actions Secrets

Configure these secrets in your GitHub repository for auto-deployment:

- `VPS_HOST` - Your VPS IP address
- `VPS_USERNAME` - SSH username (e.g., `root`)
- `VPS_SSH_KEY` - Private SSH key
- `VPS_PORT` - SSH port (usually `22`)

### Verify Deployment

```bash
# Test health endpoint
curl https://mcp.yourdomain.com/bravesearch/health

# Test MCP endpoint (list tools)
curl -X POST "https://mcp.yourdomain.com/bravesearch/mcp?apiKey=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Analytics

The server includes a comprehensive analytics system for monitoring usage.

#### Analytics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics` | GET | JSON analytics summary |
| `/analytics/tools` | GET | Detailed tool usage statistics |
| `/analytics/dashboard` | GET | Visual HTML dashboard with charts |
| `/analytics/import` | POST | Import backup data (requires key) |

#### Access Analytics

```bash
# View analytics JSON
curl https://mcp.yourdomain.com/bravesearch/analytics

# View dashboard in browser
https://mcp.yourdomain.com/bravesearch/analytics/dashboard

# Import backup (if ANALYTICS_IMPORT_KEY is set)
curl -X POST "https://mcp.yourdomain.com/bravesearch/analytics/import?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d @backup.json
```

#### Analytics Data Location

- **Container path**: `/app/data/analytics.json`
- **Host volume**: `/var/lib/docker/volumes/mcp-bravesearch_analytics-data/_data/`

### Useful Commands

```bash
# View running containers
docker ps

# View logs
docker compose logs -f

# Restart container
docker compose restart

# Rebuild and restart
docker compose up -d --build

# Stop container
docker compose down
```

## License

This MCP server is licensed under the [MIT License](LICENSE).
