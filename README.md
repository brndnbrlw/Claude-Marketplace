# Claude MCP Marketplace

A browser-based marketplace for discovering and installing official [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers into Claude Desktop or Claude Code.

## Live Demo

Open `index.html` in any modern browser, or host the three static files on GitHub Pages.

## Featured Servers

| Server | Source |
|--------|--------|
| **GitHub MCP Server** | `github/github-mcp-server` |
| **Salesforce MCP Server** | `salesforcecli/mcp` |
| **Atlassian MCP Server** | `atlassian/atlassian-mcp-server` |
| **Datadog MCP Server** | `datadog-labs/mcp-server` |
| **GitLab MCP Server** | GitLab official |
| **Microsoft 365 MCP Server** | `microsoft/mcp` |

## How It Works

Server metadata is fetched live from the official [MCP Registry API](https://registry.modelcontextprotocol.io):

```
GET https://registry.modelcontextprotocol.io/v0.1/servers?search=<query>&version=latest
GET https://registry.modelcontextprotocol.io/v0.1/servers/<name>/versions/latest
```

The marketplace:
1. Searches the registry for each featured server on load.
2. Reads the registry's `packages` / `remotes` schema to auto-generate the correct `claude_desktop_config.json` snippet for each server.
3. Supports free-text search across the entire registry with pagination.
4. Falls back to known-good static configuration if the registry is unreachable.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure and modal template |
| `styles.css` | Responsive light/dark theme |
| `app.js` | Registry API client, config generator, UI logic |

## Install a Server

1. Click **Install** on any card.
2. Copy the generated `claude_desktop_config.json` snippet.
3. Paste it into your Claude Desktop config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
4. Restart Claude Desktop.

## GitHub Pages

Push this repository to GitHub and enable **Settings → Pages → Deploy from branch (main / root)** to publish the marketplace publicly.
