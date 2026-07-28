/**
 * Claude MCP Marketplace
 * Fetches server metadata live from https://registry.modelcontextprotocol.io
 */

'use strict';

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1';

/**
 * The six featured servers.  `search` is sent to the registry's ?search= param;
 * `nameFallback` is used to recognise the best matching result from the list.
 * `fallback` is shown if the registry is unreachable.
 */
const FEATURED = [
  {
    search: 'github-mcp-server',
    nameFallback: 'github-mcp-server',
    iconClass: 'icon-github',
    iconEmoji: '',
    fallback: {
      title: 'GitHub MCP Server',
      description: 'Interact with GitHub repositories, issues, pull requests, and more directly from Claude.',
      version: 'latest',
      repository: { url: 'https://github.com/github/github-mcp-server', source: 'github' },
      packages: [{
        registryType: 'oci',
        identifier: 'ghcr.io/github/github-mcp-server',
        runtimeHint: 'docker',
        transport: { type: 'stdio' },
        environmentVariables: [
          { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub PAT with repo scope', isRequired: true, isSecret: true },
        ],
      }],
    },
  },
  {
    search: 'salesforce',
    nameFallback: 'salesforce',
    iconClass: 'icon-salesforce',
    iconEmoji: '☁',
    fallback: {
      title: 'Salesforce MCP Server',
      description: 'Connect Claude to your Salesforce org to manage metadata, data, users, and run tests.',
      version: 'latest',
      repository: { url: 'https://github.com/salesforcecli/mcp', source: 'github' },
      packages: [{
        registryType: 'npm',
        identifier: '@salesforce/mcp',
        runtimeHint: 'npx',
        transport: { type: 'stdio' },
        packageArguments: [
          { type: 'named', name: '--toolsets', value: 'all' },
        ],
      }],
    },
  },
  {
    search: 'atlassian',
    nameFallback: 'atlassian',
    iconClass: 'icon-atlassian',
    iconEmoji: '🔷',
    fallback: {
      title: 'Atlassian MCP Server',
      description: 'Access Jira, Confluence, and other Atlassian tools via the official remote MCP server with OAuth.',
      version: 'latest',
      repository: { url: 'https://github.com/atlassian/atlassian-mcp-server', source: 'github' },
      remotes: [{
        transport: { type: 'streamable-http', url: 'https://mcp.atlassian.com/v1/mcp/authv2' },
      }],
    },
  },
  {
    search: 'datadog',
    nameFallback: 'datadog',
    iconClass: 'icon-datadog',
    iconEmoji: '🐕',
    fallback: {
      title: 'Datadog MCP Server',
      description: 'Query Datadog logs, metrics, traces, incidents, and dashboards from Claude.',
      version: 'latest',
      repository: { url: 'https://github.com/datadog-labs/mcp-server', source: 'github' },
      remotes: [{
        transport: { type: 'streamable-http', url: 'https://mcp.datadoghq.com/v1/mcp' },
      }],
    },
  },
  {
    search: 'gitlab',
    nameFallback: 'gitlab',
    iconClass: 'icon-gitlab',
    iconEmoji: '🦊',
    fallback: {
      title: 'GitLab MCP Server',
      description: 'Manage GitLab issues, merge requests, pipelines, and repositories from Claude.',
      version: 'latest',
      repository: { url: 'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp', source: 'gitlab' },
      packages: [{
        registryType: 'npm',
        identifier: 'gitlab-mcp-server',
        runtimeHint: 'npx',
        transport: { type: 'stdio' },
        environmentVariables: [
          { name: 'GITLAB_TOKEN', description: 'GitLab PAT with api scope', isRequired: true, isSecret: true },
          { name: 'GITLAB_URL', description: 'GitLab instance URL', isRequired: false, value: 'https://gitlab.com/api/v4' },
        ],
      }],
    },
  },
  {
    search: 'microsoft-365',
    nameFallback: 'microsoft',
    iconClass: 'icon-microsoft',
    iconEmoji: '🪟',
    fallback: {
      title: 'Microsoft 365 MCP Server',
      description: 'Access Outlook, OneDrive, SharePoint, Teams, and other Microsoft 365 services from Claude.',
      version: 'latest',
      repository: { url: 'https://github.com/microsoft/mcp', source: 'github' },
      packages: [{
        registryType: 'npm',
        identifier: '@pnp/cli-microsoft365-mcp-server',
        runtimeHint: 'npx',
        transport: { type: 'stdio' },
      }],
    },
  },
];

/* ═══════════════════════ Registry helpers ═══════════════════════ */

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Registry responded ${res.status}: ${url}`);
  return res.json();
}

/** Search the registry and return a ServerList response */
async function registrySearch(query, cursor = '') {
  const url = new URL(`${REGISTRY}/servers`);
  if (query) url.searchParams.set('search', query);
  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', '30');
  if (cursor) url.searchParams.set('cursor', cursor);
  return fetchJSON(url.toString());
}

/** Fetch full detail for one server */
async function registryDetail(serverName) {
  const encoded = encodeURIComponent(serverName);
  return fetchJSON(`${REGISTRY}/servers/${encoded}/versions/latest`);
}

/* Pick the best match from a search result list */
function bestMatch(results, nameFallback) {
  if (!results || results.length === 0) return null;
  const kw = nameFallback.toLowerCase();
  return (
    results.find(r => {
      const n = (r.name || r.server?.name || '').toLowerCase();
      return n.includes(kw);
    }) ||
    results[0]
  );
}

/* Normalise: the list endpoint wraps in { server: {...}, _meta: {...} }
   while the detail endpoint might return the object directly */
function normalise(raw) {
  if (!raw) return null;
  return raw.server ?? raw;
}

/* ═══════════════════════ Config generation ══════════════════════ */

/**
 * Build a claude_desktop_config.json "mcpServers" entry from a server detail object.
 * Returns { key, config, prereqs[], notes[] }
 */
function buildInstallConfig(server) {
  const pkgs    = server.packages || [];
  const remotes = server.remotes  || [];
  const key     = slugify(server.title || server.name || 'mcp-server');
  const prereqs = [];
  const notes   = [];

  /* ── Remote transport (Atlassian, Datadog, etc.) ── */
  if (remotes.length > 0) {
    const remote = remotes[0];
    const transport = remote.transport || remote;
    const remoteUrl = transport.url || remote.url || '';

    /* Newer Claude Code / claude_desktop_config supports HTTP directly */
    const httpConfig = {
      type: 'http',
      url: remoteUrl,
    };

    /* mcp-remote proxy for older Claude Desktop */
    const proxyConfig = {
      command: 'npx',
      args: ['-y', 'mcp-remote@latest', remoteUrl],
    };

    prereqs.push('Node.js 18+ (for mcp-remote proxy)');

    return {
      key,
      httpConfig,
      proxyConfig,
      prereqs,
      notes: [
        `Authentication is handled via browser OAuth when first launched.`,
        `Claude Code and newer Claude Desktop versions support the <code>type: "http"</code> config directly.
         For older Claude Desktop use the <strong>mcp-remote</strong> proxy config.`,
      ],
      websiteUrl: server.websiteUrl,
      repoUrl: server.repository?.url,
    };
  }

  /* ── Package-based transport ── */
  const pkg = pkgs[0];
  if (!pkg) {
    return {
      key,
      rawConfig: { command: 'UNKNOWN', args: [] },
      prereqs: ['See documentation for installation instructions.'],
      notes: [],
      websiteUrl: server.websiteUrl,
      repoUrl: server.repository?.url,
    };
  }

  const hint       = (pkg.runtimeHint || '').toLowerCase();
  const rtype      = (pkg.registryType || '').toLowerCase();
  const identifier = pkg.identifier || '';
  const version    = pkg.version;

  let command, args = [];

  if (hint === 'docker' || rtype === 'oci') {
    /* ── Docker ── */
    command = 'docker';
    args.push('run', '-i', '--rm');

    /* Runtime arguments (e.g. -e ENV_VAR) */
    for (const arg of pkg.runtimeArguments || []) {
      if (arg.type === 'named') {
        args.push(arg.name);
        if (arg.value != null && arg.value !== '') args.push(String(arg.value));
      } else if (arg.type === 'positional' && arg.value != null) {
        args.push(String(arg.value));
      }
    }

    /* Pass env vars with -e */
    for (const ev of pkg.environmentVariables || []) {
      args.push('-e', ev.name);
    }
    args.push(version ? `${identifier}:${version}` : identifier);
    prereqs.push('Docker Desktop or Docker Engine');

  } else if (hint === 'uvx' || rtype === 'pypi') {
    /* ── uvx / PyPI ── */
    command = 'uvx';
    args.push(version ? `${identifier}@${version}` : identifier);
    for (const arg of pkg.packageArguments || []) {
      if (arg.type === 'named') {
        args.push(arg.name);
        if (arg.value != null && arg.value !== '') args.push(String(arg.value));
      } else if (arg.type === 'positional' && arg.value != null) {
        args.push(String(arg.value));
      }
    }
    prereqs.push('Python 3.10+ and uv (<a href="https://docs.astral.sh/uv/getting-started/installation/" target="_blank" rel="noopener noreferrer">install uv</a>)');

  } else {
    /* ── npx / npm (default) ── */
    command = 'npx';
    const pkgRef = version ? `${identifier}@${version}` : identifier;
    args.push('-y', pkgRef);
    for (const arg of pkg.packageArguments || []) {
      if (arg.type === 'named') {
        args.push(arg.name);
        if (arg.value != null && arg.value !== '') args.push(String(arg.value));
      } else if (arg.type === 'positional' && arg.value != null) {
        args.push(String(arg.value));
      }
    }
    prereqs.push('Node.js 18+ (<a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a>)');
  }

  /* Build env map */
  const env = {};
  for (const ev of pkg.environmentVariables || []) {
    env[ev.name] = ev.value && !ev.isSecret
      ? ev.value
      : `<your_${ev.name.toLowerCase()}>`;
  }

  const config = { command, args };
  if (Object.keys(env).length) config.env = env;

  /* Extra prereqs from env vars */
  for (const ev of pkg.environmentVariables || []) {
    if (ev.description) prereqs.push(`${ev.name}: ${ev.description}`);
  }

  return {
    key,
    rawConfig: config,
    prereqs,
    notes,
    websiteUrl: server.websiteUrl,
    repoUrl: server.repository?.url,
  };
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ═══════════════════════ Rendering ══════════════════════════════ */

function iconFor(server, featuredEntry) {
  /* Use icon from registry if present */
  const icons = server.icons || [];
  if (icons.length > 0 && icons[0].src) {
    return `<img src="${escapeAttr(icons[0].src)}" alt="${escapeAttr(server.title || server.name || '')}" loading="lazy" />`;
  }
  /* Fallback to featured emoji */
  if (featuredEntry && featuredEntry.iconEmoji) {
    return `<span aria-hidden="true">${featuredEntry.iconEmoji}</span>`;
  }
  /* Letter from title */
  const letter = (server.title || server.name || '?')[0].toUpperCase();
  return `<span aria-hidden="true">${letter}</span>`;
}

function iconClass(server, featuredEntry) {
  if (featuredEntry && featuredEntry.iconClass) return featuredEntry.iconClass;
  const name = (server.name || '').toLowerCase();
  if (name.includes('github'))    return 'icon-github';
  if (name.includes('salesforce'))return 'icon-salesforce';
  if (name.includes('atlassian')) return 'icon-atlassian';
  if (name.includes('datadog'))   return 'icon-datadog';
  if (name.includes('gitlab'))    return 'icon-gitlab';
  if (name.includes('microsoft')) return 'icon-microsoft';
  return 'icon-default';
}

function tagsFor(server) {
  const tags = new Set();
  for (const pkg of server.packages || []) {
    if (pkg.registryType) tags.add(pkg.registryType.toUpperCase());
    if (pkg.runtimeHint)  tags.add(pkg.runtimeHint);
  }
  for (const r of server.remotes || []) {
    const t = r.transport?.type || r.type;
    if (t) tags.add(t === 'streamable-http' ? 'HTTP' : t.toUpperCase());
  }
  return [...tags].slice(0, 4);
}

function repoLabel(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\//, '').replace(/\/$/, '');
    return path || u.hostname;
  } catch {
    return url;
  }
}

function buildCard(server, featuredEntry = null, isLoading = false) {
  const card = document.createElement('article');
  card.className = 'mcp-card';
  card.dataset.name = server.name || '';

  const title   = server.title || server.name || 'MCP Server';
  const desc    = server.description || 'No description available.';
  const version = server.version;
  const repoUrl = server.repository?.url || server.websiteUrl || '';
  const tags    = tagsFor(server);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon ${escapeAttr(iconClass(server, featuredEntry))}">${iconFor(server, featuredEntry)}</div>
      <div class="card-title-group">
        <h3 class="card-title">${escapeHTML(title)}</h3>
        <div class="card-meta">
          <span class="official-badge">Official</span>
          ${version ? `<span class="version-tag">v${escapeHTML(version)}</span>` : ''}
        </div>
      </div>
    </div>
    <p class="card-description">${escapeHTML(desc)}</p>
    ${tags.length ? `<div class="card-tags">${tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
    <div class="card-footer">
      ${repoUrl
        ? `<a class="card-registry-link" href="${escapeAttr(repoUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(repoLabel(repoUrl) || '')} ↗</a>`
        : '<span></span>'}
      <button class="btn-install" data-server-name="${escapeAttr(server.name || '')}" ${isLoading ? 'disabled' : ''}>Install</button>
    </div>`;

  card.querySelector('.btn-install').addEventListener('click', () => openInstallModal(server));
  return card;
}

function buildSkeletonCard() {
  const div = document.createElement('div');
  div.className = 'skeleton-card';
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = `
    <div class="skeleton-header">
      <div class="skeleton-block skeleton-icon"></div>
      <div class="skeleton-header-text">
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line shorter"></div>
      </div>
    </div>
    <div class="skeleton-lines">
      <div class="skeleton-block skeleton-line"></div>
      <div class="skeleton-block skeleton-line short"></div>
    </div>`;
  return div;
}

function buildErrorCard(message) {
  const div = document.createElement('div');
  div.className = 'error-card';
  div.innerHTML = `<strong>Could not load from registry</strong><br>${escapeHTML(message)}<br>
    <small>Check your connection or visit <a href="https://registry.modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">registry.modelcontextprotocol.io</a> directly.</small>`;
  return div;
}

/* ═══════════════════════ Install Modal ══════════════════════════ */

function openInstallModal(server) {
  const overlay = document.getElementById('modalOverlay');
  const title   = document.getElementById('modalTitle');
  const body    = document.getElementById('modalBody');

  title.textContent = `Install · ${server.title || server.name || 'MCP Server'}`;
  body.innerHTML = '';

  /* Show skeleton while fetching full detail */
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-lines';
  skeleton.innerHTML = '<div class="skeleton-block skeleton-line"></div><div class="skeleton-block skeleton-line short"></div><div class="skeleton-block skeleton-line"></div>';
  body.appendChild(skeleton);

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  /* Fetch full detail from registry (packages/remotes may be missing from list response) */
  const fetchDetail = server.name
    ? registryDetail(server.name).then(normalise).catch(() => server)
    : Promise.resolve(server);

  fetchDetail.then(detail => {
    if (overlay.classList.contains('hidden')) return; // modal closed
    const merged = { ...server, ...(detail || {}) };
    renderModalBody(body, merged);
  });
}

function renderModalBody(body, server) {
  body.innerHTML = '';
  const cfg = buildInstallConfig(server);

  /* ── Prerequisites ── */
  if (cfg.prereqs.length) {
    const block = document.createElement('div');
    block.className = 'install-block';
    block.innerHTML = `<h3>Prerequisites</h3>
      <ul class="prereq-list">
        ${cfg.prereqs.map(p => `<li>${p}</li>`).join('')}
      </ul>`;
    body.appendChild(block);
  }

  /* ── Config for Claude Desktop / Claude Code ── */
  if (cfg.httpConfig) {
    /* Remote server: show two options */
    addCodeBlock(body,
      'claude_desktop_config.json (via mcp-remote proxy)',
      buildFullConfig(cfg.key, cfg.proxyConfig));

    addCodeBlock(body,
      'Claude Code / newer Claude Desktop (HTTP)',
      buildFullConfig(cfg.key, cfg.httpConfig));

  } else if (cfg.rawConfig) {
    addCodeBlock(body,
      'claude_desktop_config.json',
      buildFullConfig(cfg.key, cfg.rawConfig));
  }

  /* ── Config file location ── */
  const noteBlock = document.createElement('div');
  noteBlock.className = 'install-block';
  noteBlock.innerHTML = `<h3>Config File Locations</h3>
    <div class="install-note">
      <strong>macOS:</strong> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code><br>
      <strong>Windows:</strong> <code>%APPDATA%\\Claude\\claude_desktop_config.json</code><br>
      Paste the snippet above into the <code>mcpServers</code> object, then restart Claude Desktop.
    </div>`;
  body.appendChild(noteBlock);

  /* ── Notes ── */
  for (const note of cfg.notes || []) {
    const n = document.createElement('p');
    n.className = 'install-note';
    n.innerHTML = note;
    body.appendChild(n);
  }

  /* ── Links ── */
  const links = [];
  if (cfg.repoUrl) links.push({ href: cfg.repoUrl, label: '↗ Repository', primary: true });
  if (cfg.websiteUrl) links.push({ href: cfg.websiteUrl, label: '↗ Documentation', primary: false });
  links.push({
    href: `https://registry.modelcontextprotocol.io`,
    label: '↗ MCP Registry',
    primary: false,
  });

  if (links.length) {
    const linkRow = document.createElement('div');
    linkRow.className = 'modal-links';
    linkRow.innerHTML = links.map(l =>
      `<a class="modal-link ${l.primary ? 'modal-link-primary' : 'modal-link-secondary'}"
          href="${escapeAttr(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(l.label)}</a>`
    ).join('');
    body.appendChild(linkRow);
  }
}

function addCodeBlock(parent, label, jsonStr) {
  const block = document.createElement('div');
  block.className = 'install-block';
  block.innerHTML = `<h3>${escapeHTML(label)}</h3>
    <div class="code-wrapper">
      <pre class="code-block">${escapeHTML(jsonStr)}</pre>
      <button class="copy-btn" aria-label="Copy to clipboard">Copy</button>
    </div>`;
  block.querySelector('.copy-btn').addEventListener('click', function () {
    copyText(jsonStr, this);
  });
  parent.appendChild(block);
}

function buildFullConfig(key, serverConfig) {
  const wrapper = { mcpServers: { [key]: serverConfig } };
  return JSON.stringify(wrapper, null, 2);
}

/* ═══════════════════════ Search ═════════════════════════════════ */

let searchCursor = '';
let searchQuery  = '';
let searchTotal  = 0;

async function runSearch(query) {
  searchQuery  = query;
  searchCursor = '';
  searchTotal  = 0;

  const resultsSection = document.getElementById('resultsSection');
  const featuredSection= document.getElementById('featuredSection');
  const noResults      = document.getElementById('noResults');
  const resultsGrid    = document.getElementById('resultsGrid');
  const resultsCount   = document.getElementById('resultsCount');
  const loadMoreBtn    = document.getElementById('loadMoreBtn');

  if (!query.trim()) {
    /* Clear search */
    resultsSection.classList.add('hidden');
    featuredSection.classList.remove('hidden');
    noResults.classList.add('hidden');
    return;
  }

  featuredSection.classList.add('hidden');
  noResults.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  resultsCount.textContent = '';
  loadMoreBtn.classList.add('hidden');

  /* Show skeletons */
  resultsGrid.innerHTML = '';
  for (let i = 0; i < 6; i++) resultsGrid.appendChild(buildSkeletonCard());

  try {
    const data = await registrySearch(query);
    const servers = (data.servers || []).map(normalise).filter(Boolean);
    searchCursor = data.metadata?.nextCursor || '';
    searchTotal  = data.metadata?.count || servers.length;

    resultsGrid.innerHTML = '';

    if (servers.length === 0) {
      resultsSection.classList.add('hidden');
      noResults.classList.remove('hidden');
      return;
    }

    resultsCount.textContent = `${searchTotal.toLocaleString()} result${searchTotal !== 1 ? 's' : ''}`;
    for (const s of servers) resultsGrid.appendChild(buildCard(s));

    if (searchCursor) {
      loadMoreBtn.classList.remove('hidden');
      loadMoreBtn.disabled = false;
    }

  } catch (err) {
    resultsGrid.innerHTML = '';
    resultsGrid.appendChild(buildErrorCard(err.message));
  }
}

async function loadMore() {
  if (!searchCursor) return;
  const btn = document.getElementById('loadMoreBtn');
  btn.disabled = true;
  btn.textContent = 'Loading…';

  try {
    const data = await registrySearch(searchQuery, searchCursor);
    const servers = (data.servers || []).map(normalise).filter(Boolean);
    searchCursor = data.metadata?.nextCursor || '';

    const grid = document.getElementById('resultsGrid');
    for (const s of servers) grid.appendChild(buildCard(s));

    btn.textContent = 'Load more';
    if (!searchCursor) {
      btn.classList.add('hidden');
    } else {
      btn.disabled = false;
    }
  } catch (err) {
    btn.textContent = 'Retry';
    btn.disabled = false;
  }
}

/* ═══════════════════════ Featured loading ═══════════════════════ */

async function loadFeatured() {
  const grid = document.getElementById('featuredGrid');
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = '';

  /* Show 6 skeleton cards */
  for (let i = 0; i < FEATURED.length; i++) grid.appendChild(buildSkeletonCard());

  /* Fetch all 6 in parallel */
  const results = await Promise.allSettled(
    FEATURED.map(async (entry) => {
      try {
        const data = await registrySearch(entry.search);
        const servers = (data.servers || []).map(normalise).filter(Boolean);
        const match   = bestMatch(servers, entry.nameFallback);
        return match ? { server: match, entry } : { server: entry.fallback, entry, isFallback: true };
      } catch {
        return { server: entry.fallback, entry, isFallback: true };
      }
    })
  );

  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'false');

  for (const result of results) {
    const { server, entry } = result.status === 'fulfilled' ? result.value : { server: null, entry: null };
    if (server && entry) {
      grid.appendChild(buildCard(server, entry));
    }
  }
}

/* ═══════════════════════ Utilities ══════════════════════════════ */

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    /* Fallback for non-HTTPS */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═══════════════════════ Theme ══════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem('mcp-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved ? saved === 'dark' : prefersDark;
  setTheme(dark);
}

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.getElementById('themeToggle').textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('mcp-theme', dark ? 'dark' : 'light');
}

/* ═══════════════════════ Init ═══════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  /* Theme toggle */
  document.getElementById('themeToggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme !== 'dark');
  });

  /* Modal close */
  const overlay  = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');

  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* Search */
  const searchInput = document.getElementById('searchInput');
  const clearBtn    = document.getElementById('searchClear');
  let searchTimer;

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.classList.toggle('hidden', q.length === 0);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(q), 320);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    runSearch('');
    searchInput.focus();
  });

  /* Load more */
  document.getElementById('loadMoreBtn').addEventListener('click', loadMore);

  /* Load featured on start */
  loadFeatured();
});
