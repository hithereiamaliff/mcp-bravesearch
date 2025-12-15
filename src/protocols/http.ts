import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import config, { setApiKey } from '../config.js';
import createMcpServer from '../server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequest, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import pkg from '../../package.json' with { type: 'json' };

// ============================================================================
// ANALYTICS CONFIGURATION
// ============================================================================
const ANALYTICS_DATA_DIR = process.env.ANALYTICS_DIR || '/app/data';
const ANALYTICS_FILE = path.join(ANALYTICS_DATA_DIR, 'analytics.json');
const SAVE_INTERVAL_MS = 60000; // Save every 60 seconds
const MAX_RECENT_CALLS = 100;

// ============================================================================
// ANALYTICS INTERFACE
// ============================================================================
interface Analytics {
  serverStartTime: string;
  totalRequests: number;
  totalToolCalls: number;
  requestsByMethod: Record<string, number>;
  requestsByEndpoint: Record<string, number>;
  toolCalls: Record<string, number>;
  recentToolCalls: Array<{
    tool: string;
    timestamp: string;
    clientIp: string;
    userAgent: string;
  }>;
  clientsByIp: Record<string, number>;
  clientsByUserAgent: Record<string, number>;
  hourlyRequests: Record<string, number>;
}

// ============================================================================
// ANALYTICS STATE
// ============================================================================
let analytics: Analytics = {
  serverStartTime: new Date().toISOString(),
  totalRequests: 0,
  totalToolCalls: 0,
  requestsByMethod: {},
  requestsByEndpoint: {},
  toolCalls: {},
  recentToolCalls: [],
  clientsByIp: {},
  clientsByUserAgent: {},
  hourlyRequests: {},
};

// ============================================================================
// ANALYTICS PERSISTENCE FUNCTIONS
// ============================================================================
function ensureDataDir(): void {
  if (!fs.existsSync(ANALYTICS_DATA_DIR)) {
    fs.mkdirSync(ANALYTICS_DATA_DIR, { recursive: true });
    console.log(`📁 Created analytics data directory: ${ANALYTICS_DATA_DIR}`);
  }
}

function loadAnalytics(): void {
  try {
    ensureDataDir();
    if (fs.existsSync(ANALYTICS_FILE)) {
      const data = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      const loaded = JSON.parse(data) as Analytics;

      analytics = {
        ...loaded,
        serverStartTime: loaded.serverStartTime || new Date().toISOString(),
      };

      console.log(`📊 Loaded analytics from ${ANALYTICS_FILE}`);
      console.log(`   Total requests: ${analytics.totalRequests}`);
    } else {
      console.log(`📊 No existing analytics file, starting fresh`);
    }
  } catch (error) {
    console.error(`⚠️ Failed to load analytics:`, error);
  }
}

function saveAnalytics(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
    console.log(`💾 Saved analytics to ${ANALYTICS_FILE}`);
  } catch (error) {
    console.error(`⚠️ Failed to save analytics:`, error);
  }
}

// ============================================================================
// ANALYTICS TRACKING FUNCTIONS
// ============================================================================
function trackRequest(req: Request, endpoint: string): void {
  analytics.totalRequests++;

  // Track by method
  const method = req.method;
  analytics.requestsByMethod[method] = (analytics.requestsByMethod[method] || 0) + 1;

  // Track by endpoint
  analytics.requestsByEndpoint[endpoint] = (analytics.requestsByEndpoint[endpoint] || 0) + 1;

  // Track by client IP
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';
  analytics.clientsByIp[clientIp] = (analytics.clientsByIp[clientIp] || 0) + 1;

  // Track by user agent
  const userAgent = (req.headers['user-agent'] || 'unknown').substring(0, 50);
  analytics.clientsByUserAgent[userAgent] = (analytics.clientsByUserAgent[userAgent] || 0) + 1;

  // Track hourly
  const hour = new Date().toISOString().substring(0, 13);
  analytics.hourlyRequests[hour] = (analytics.hourlyRequests[hour] || 0) + 1;
}

function trackToolCall(toolName: string, req: Request): void {
  analytics.totalToolCalls++;
  analytics.toolCalls[toolName] = (analytics.toolCalls[toolName] || 0) + 1;

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  const toolCall = {
    tool: toolName,
    timestamp: new Date().toISOString(),
    clientIp,
    userAgent: (req.headers['user-agent'] || 'unknown').substring(0, 50),
  };

  analytics.recentToolCalls.unshift(toolCall);
  if (analytics.recentToolCalls.length > MAX_RECENT_CALLS) {
    analytics.recentToolCalls.pop();
  }
}

function getUptime(): string {
  const start = new Date(analytics.serverStartTime).getTime();
  const now = Date.now();
  const diff = now - start;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Load analytics on module initialization
loadAnalytics();

// Periodic save
const saveInterval = setInterval(() => {
  saveAnalytics();
}, SAVE_INTERVAL_MS);

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  clearInterval(saveInterval);
  saveAnalytics();
  console.log('Analytics saved. Goodbye!');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const yieldGenericServerError = (res: Response) => {
  res.status(500).json({
    id: null,
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
  });
};

const transports = new Map<string, StreamableHTTPServerTransport>();

const isListToolsRequest = (value: unknown): value is ListToolsRequest =>
  ListToolsRequestSchema.safeParse(value).success;

const getTransport = async (request: Request): Promise<StreamableHTTPServerTransport> => {
  // Check for an existing session
  const sessionId = request.headers['mcp-session-id'] as string;

  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  // We have a special case where we'll permit ListToolsRequest w/o a session ID
  if (!sessionId && isListToolsRequest(request.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    return transport;
  }

  // Otherwise, start a new transport/session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  return transport;
};

// Middleware to extract API key from query param, header, or env
const extractApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Priority: query param > header > environment variable
  const apiKey =
    (req.query.apiKey as string) ||
    (req.query.api_key as string) ||
    (req.headers['x-api-key'] as string) ||
    (req.headers['authorization']?.replace('Bearer ', '') as string) ||
    process.env.BRAVE_API_KEY ||
    '';

  if (apiKey) {
    setApiKey(apiKey);
  }

  next();
};

const createApp = () => {
  const app = express();

  // CORS configuration for VPS deployment
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'x-api-key'],
    })
  );

  app.use(express.json());

  // Health check endpoint for VPS deployment
  app.get('/health', (req: Request, res: Response) => {
    trackRequest(req, '/health');
    res.json({
      status: 'healthy',
      server: 'Brave Search MCP Server',
      version: pkg.version,
      transport: 'streamable-http',
      timestamp: new Date().toISOString(),
    });
  });

  // Root endpoint - server info
  app.get('/', (req: Request, res: Response) => {
    trackRequest(req, '/');
    res.json({
      name: 'Brave Search MCP Server',
      version: pkg.version,
      description: 'MCP server for Brave Search API with web, local, image, video, news search and AI summarization',
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp',
        health: '/health',
        analytics: '/analytics',
        analyticsTools: '/analytics/tools',
        analyticsDashboard: '/analytics/dashboard',
      },
      documentation: 'https://github.com/hithereiamaliff/mcp-bravesearch',
    });
  });

  // Analytics JSON endpoint
  app.get('/analytics', (req: Request, res: Response) => {
    trackRequest(req, '/analytics');

    // Sort tools by usage
    const sortedTools = Object.entries(analytics.toolCalls)
      .sort(([, a], [, b]) => b - a)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    // Get last 24 hours of hourly requests
    const last24Hours = Object.entries(analytics.hourlyRequests)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 24)
      .reverse()
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    res.json({
      server: 'Brave Search MCP Server',
      uptime: getUptime(),
      serverStartTime: analytics.serverStartTime,
      summary: {
        totalRequests: analytics.totalRequests,
        totalToolCalls: analytics.totalToolCalls,
        uniqueClients: Object.keys(analytics.clientsByIp).length,
      },
      breakdown: {
        byMethod: analytics.requestsByMethod,
        byEndpoint: analytics.requestsByEndpoint,
        byTool: sortedTools,
      },
      clients: {
        byIp: analytics.clientsByIp,
        byUserAgent: analytics.clientsByUserAgent,
      },
      hourlyRequests: last24Hours,
      recentToolCalls: analytics.recentToolCalls.slice(0, 20),
    });
  });

  // Analytics tools endpoint
  app.get('/analytics/tools', (req: Request, res: Response) => {
    trackRequest(req, '/analytics/tools');

    const sortedTools = Object.entries(analytics.toolCalls)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    res.json({
      totalToolCalls: analytics.totalToolCalls,
      tools: sortedTools,
      recentCalls: analytics.recentToolCalls.slice(0, 50),
    });
  });

  // Analytics import endpoint (for backup restoration)
  app.post('/analytics/import', (req: Request, res: Response) => {
    const importKey = req.query.key as string;

    // Security: require import key if set
    if (process.env.ANALYTICS_IMPORT_KEY && importKey !== process.env.ANALYTICS_IMPORT_KEY) {
      res.status(403).json({ error: 'Invalid import key' });
      return;
    }

    try {
      const importData = req.body;

      // Merge imported data with current analytics
      if (importData.summary) {
        analytics.totalRequests += importData.summary.totalRequests || 0;
        analytics.totalToolCalls += importData.summary.totalToolCalls || 0;
      }

      // Merge breakdown data
      if (importData.breakdown?.byMethod) {
        for (const [method, count] of Object.entries(importData.breakdown.byMethod)) {
          analytics.requestsByMethod[method] =
            (analytics.requestsByMethod[method] || 0) + (count as number);
        }
      }

      if (importData.breakdown?.byEndpoint) {
        for (const [endpoint, count] of Object.entries(importData.breakdown.byEndpoint)) {
          analytics.requestsByEndpoint[endpoint] =
            (analytics.requestsByEndpoint[endpoint] || 0) + (count as number);
        }
      }

      if (importData.breakdown?.byTool) {
        for (const [tool, count] of Object.entries(importData.breakdown.byTool)) {
          analytics.toolCalls[tool] = (analytics.toolCalls[tool] || 0) + (count as number);
        }
      }

      // Save immediately
      saveAnalytics();

      res.json({
        message: 'Analytics imported successfully',
        currentStats: {
          totalRequests: analytics.totalRequests,
          totalToolCalls: analytics.totalToolCalls,
        },
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to import analytics',
        details: String(error),
      });
    }
  });

  // Analytics dashboard endpoint (HTML)
  app.get('/analytics/dashboard', (req: Request, res: Response) => {
    trackRequest(req, '/analytics/dashboard');
    res.send(getDashboardHtml());
  });

  // Apply API key extraction middleware to MCP endpoint
  app.all('/mcp', extractApiKey, async (req: Request, res: Response) => {
    trackRequest(req, '/mcp');

    // Track tool calls
    if (req.body && req.body.method === 'tools/call' && req.body.params?.name) {
      trackToolCall(req.body.params.name, req);
    }

    try {
      const transport = await getTransport(req);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        yieldGenericServerError(res);
      }
    }
  });

  app.all('/ping', (req: Request, res: Response) => {
    trackRequest(req, '/ping');
    res.status(200).json({ message: 'pong' });
  });

  return app;
};

// ============================================================================
// ANALYTICS DASHBOARD HTML
// ============================================================================
function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brave Search MCP - Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e4e4e7;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 30px; }
    header h1 { font-size: 2rem; margin-bottom: 8px; }
    header p { color: #a1a1aa; font-size: 1rem; }
    .uptime-badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
      padding: 6px 16px;
      border-radius: 50px;
      font-size: 0.85rem;
      margin-top: 10px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: bold; color: #3b82f6; }
    .stat-label { color: #a1a1aa; font-size: 0.85rem; margin-top: 5px; }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .chart-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
    }
    .chart-card h3 { margin-bottom: 15px; font-size: 1.1rem; }
    .chart-container { height: 250px; position: relative; }
    .recent-calls {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
    }
    .recent-calls h3 { margin-bottom: 15px; }
    .call-list { max-height: 300px; overflow-y: auto; }
    .call-item {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.85rem;
    }
    .call-item:last-child { border-bottom: none; }
    .call-tool { color: #8b5cf6; font-weight: 500; }
    .call-time { color: #71717a; }
    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 50px;
      cursor: pointer;
      font-size: 1rem;
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
      transition: transform 0.2s;
    }
    .refresh-btn:hover { transform: scale(1.05); }
    .no-data { color: #71717a; text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔍 Brave Search MCP - Analytics Dashboard</h1>
      <p>Real-time usage statistics</p>
      <span class="uptime-badge" id="uptime">Loading...</span>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="totalRequests">-</div>
        <div class="stat-label">Total Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalToolCalls">-</div>
        <div class="stat-label">Total Tool Calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="uniqueClients">-</div>
        <div class="stat-label">Unique Clients</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="mostUsedTool">-</div>
        <div class="stat-label">Most Used Tool</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <h3>📊 Tool Usage Distribution</h3>
        <div class="chart-container">
          <canvas id="toolsChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3>📈 Hourly Requests (Last 24h)</h3>
        <div class="chart-container">
          <canvas id="hourlyChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3>🎯 Requests by Endpoint</h3>
        <div class="chart-container">
          <canvas id="endpointChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3>👥 Top Clients by User Agent</h3>
        <div class="chart-container">
          <canvas id="clientsChart"></canvas>
        </div>
      </div>
    </div>

    <div class="recent-calls">
      <h3>🕐 Recent Tool Calls</h3>
      <div class="call-list" id="recentCalls">
        <div class="no-data">No tool calls yet</div>
      </div>
    </div>
  </div>

  <button class="refresh-btn" onclick="loadData()">🔄 Refresh</button>

  <script>
    const chartColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'];
    let toolsChart, hourlyChart, endpointChart, clientsChart;

    async function loadData() {
      try {
        const basePath = window.location.pathname.replace(/\\/analytics\\/dashboard\\/?$/, '');
        const res = await fetch(basePath + '/analytics');
        const data = await res.json();
        updateDashboard(data);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      }
    }

    function updateDashboard(data) {
      document.getElementById('uptime').textContent = 'Uptime: ' + data.uptime;
      document.getElementById('totalRequests').textContent = data.summary.totalRequests.toLocaleString();
      document.getElementById('totalToolCalls').textContent = data.summary.totalToolCalls.toLocaleString();
      document.getElementById('uniqueClients').textContent = data.summary.uniqueClients.toLocaleString();

      const tools = Object.entries(data.breakdown.byTool);
      document.getElementById('mostUsedTool').textContent = tools.length > 0 ? tools[0][0].replace('brave_', '') : 'N/A';

      updateToolsChart(data.breakdown.byTool);
      updateHourlyChart(data.hourlyRequests);
      updateEndpointChart(data.breakdown.byEndpoint);
      updateClientsChart(data.clients.byUserAgent);
      updateRecentCalls(data.recentToolCalls);
    }

    function updateToolsChart(toolData) {
      const labels = Object.keys(toolData).map(t => t.replace('brave_', ''));
      const values = Object.values(toolData);
      const ctx = document.getElementById('toolsChart').getContext('2d');

      if (toolsChart) toolsChart.destroy();
      if (labels.length === 0) return;

      toolsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#a1a1aa', font: { size: 11 } } } }
        }
      });
    }

    function updateHourlyChart(hourlyData) {
      const labels = Object.keys(hourlyData).map(h => h.split('T')[1] + ':00');
      const values = Object.values(hourlyData);
      const ctx = document.getElementById('hourlyChart').getContext('2d');

      if (hourlyChart) hourlyChart.destroy();
      if (labels.length === 0) return;

      hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Requests',
            data: values,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
          }
        }
      });
    }

    function updateEndpointChart(endpointData) {
      const labels = Object.keys(endpointData);
      const values = Object.values(endpointData);
      const ctx = document.getElementById('endpointChart').getContext('2d');

      if (endpointChart) endpointChart.destroy();
      if (labels.length === 0) return;

      endpointChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ data: values, backgroundColor: chartColors, borderRadius: 8 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#71717a' }, grid: { display: false } },
            y: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
          }
        }
      });
    }

    function updateClientsChart(clientData) {
      const sorted = Object.entries(clientData).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const labels = sorted.map(([ua]) => ua.substring(0, 30));
      const values = sorted.map(([, count]) => count);
      const ctx = document.getElementById('clientsChart').getContext('2d');

      if (clientsChart) clientsChart.destroy();
      if (labels.length === 0) return;

      clientsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ data: values, backgroundColor: chartColors, borderRadius: 8 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
            y: { ticks: { color: '#71717a' }, grid: { display: false } }
          }
        }
      });
    }

    function updateRecentCalls(calls) {
      const container = document.getElementById('recentCalls');
      if (!calls || calls.length === 0) {
        container.innerHTML = '<div class="no-data">No tool calls yet</div>';
        return;
      }

      container.innerHTML = calls.map(call => \`
        <div class="call-item">
          <span class="call-tool">\${call.tool.replace('brave_', '')}</span>
          <span class="call-time">\${new Date(call.timestamp).toLocaleString()}</span>
        </div>
      \`).join('');
    }

    loadData();
    setInterval(loadData, 30000);
  </script>
</body>
</html>`;
}

const start = () => {
  if (!config.ready) {
    console.error('Invalid configuration');
    process.exit(1);
  }

  const app = createApp();

  app.listen(config.port, config.host, () => {
    console.log(`Server is running on http://${config.host}:${config.port}/mcp`);
  });
};

export default { start, createApp };
