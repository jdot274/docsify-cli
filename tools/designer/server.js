const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.DOCS_DESIGNER_PORT || 4173;
const docsDir = path.resolve(process.env.DOCS_DESIGN_DIR || 'docs-new');
const stateFile = path.join(docsDir, '.designer-state.json');
const THEMES = ['vue', 'dark', 'buble', 'pure'];

app.use(express.json({limit: '10mb'}));

app.use((req, res, next) => {
  res.header('Cache-Control', 'no-store');
  next();
});

const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

function ensureDocsDir() {
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Docs directory "${docsDir}" not found. Set DOCS_DESIGN_DIR to the docs folder you want to edit.`);
  }
}

function resolveDocsPath(relativePath) {
  const cleaned = String(relativePath || '').replaceAll('\\', '/');
  const resolved = path.resolve(docsDir, cleaned);
  if (!resolved.startsWith(docsDir + path.sep) && resolved !== docsDir) {
    throw new Error('Invalid path');
  }
  return resolved;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function parseIndexDefaults(indexHtml) {
  const defaults = {
    title: 'Document',
    description: 'Description',
    docsifyName: '',
    theme: 'vue',
    loadSidebar: false,
  };

  if (!indexHtml) {
    return defaults;
  }

  const titleMatch = indexHtml.match(/<title>([^<]*)<\/title>/i);
  const descriptionMatch = indexHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
  const nameMatch = indexHtml.match(/name:\s*['"]([^'"]*)['"]/i);
  const themeMatch = indexHtml.match(/addons\/([a-z0-9-]+)\.min\.css/i);
  const sidebarMatch = indexHtml.match(/loadSidebar:\s*(true|false)/i);

  return {
    title: titleMatch ? titleMatch[1] : defaults.title,
    description: descriptionMatch ? descriptionMatch[1] : defaults.description,
    docsifyName: nameMatch ? nameMatch[1] : defaults.docsifyName,
    theme: themeMatch ? themeMatch[1] : defaults.theme,
    loadSidebar: sidebarMatch ? sidebarMatch[1] === 'true' : defaults.loadSidebar,
  };
}

function renderIndexHtml({title, description, docsifyName, theme, loadSidebar}) {
  const safeTheme = THEMES.includes(theme) ? theme : 'vue';
  const safeTitle = title || 'Document';
  const safeDescription = description || 'Description';
  const safeName = docsifyName || '';
  const sidebarLine = `      loadSidebar: ${Boolean(loadSidebar)},`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@5.0.0-rc.1/dist/themes/core.min.css">
  <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@5.0.0-rc.1/dist/themes/addons/${safeTheme}.min.css">
</head>
<body>
  <div id="app"></div>
  <script>
    window.$docsify = {
      name: '${safeName.replace(/'/g, "\\'")}',
${sidebarLine}
      repo: ''
    }
  </script>
  <script src="//cdn.jsdelivr.net/npm/docsify@5.0.0-rc.1"></script>
</body>
</html>`;
}

async function writeFileEnsured(targetPath, content) {
  await fs.promises.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.promises.writeFile(targetPath, content, 'utf8');
}

async function listMarkdownFiles() {
  ensureDocsDir();
  const results = [];
  const stack = ['.'];
  while (stack.length) {
    const dir = stack.pop();
    const dirPath = resolveDocsPath(dir);
    const entries = await fs.promises.readdir(dirPath, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'media' && entry.isDirectory()) continue;
      const rel = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.toLowerCase().endsWith('.md')) {
        results.push(rel);
      }
    }
  }
  results.sort((a, b) => a.localeCompare(b));
  if (!results.includes('README.md') && fs.existsSync(resolveDocsPath('README.md'))) {
    results.unshift('README.md');
  }
  return results;
}

app.get('/api/files', async (req, res) => {
  try {
    ensureDocsDir();
    const readmePath = path.join(docsDir, 'README.md');
    const sidebarPath = path.join(docsDir, '_sidebar.md');
    const indexPath = path.join(docsDir, 'index.html');

    const readme = readFileSafe(readmePath);
    const sidebar = readFileSafe(sidebarPath);
    const indexHtml = readFileSafe(indexPath);
    let settings = parseIndexDefaults(indexHtml);

    if (fs.existsSync(stateFile)) {
      try {
        const stored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        settings = {...settings, ...stored};
      } catch (error) {
        // Ignore malformed cache
      }
    }

    res.json({
      docsDir,
      readme,
      sidebar,
      settings,
      themes: THEMES,
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/files', async (req, res) => {
  try {
    ensureDocsDir();
    const {
      readme = '',
      sidebar = '',
      title = 'Document',
      description = 'Description',
      docsifyName = '',
      theme = 'vue',
      loadSidebar = false,
    } = req.body || {};

    const readmePath = path.join(docsDir, 'README.md');
    const sidebarPath = path.join(docsDir, '_sidebar.md');
    const indexPath = path.join(docsDir, 'index.html');

    await writeFileEnsured(readmePath, readme);

    if (sidebar.trim()) {
      await writeFileEnsured(sidebarPath, sidebar);
    } else if (fs.existsSync(sidebarPath)) {
      await fs.promises.unlink(sidebarPath);
    }

    const indexHtml = renderIndexHtml({title, description, docsifyName, theme, loadSidebar});
    await writeFileEnsured(indexPath, indexHtml);

    await writeFileEnsured(stateFile, JSON.stringify({title, description, docsifyName, theme, loadSidebar}, null, 2));

    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    ensureDocsDir();
    const indexPath = path.join(docsDir, 'index.html');
    const indexHtml = readFileSafe(indexPath);
    let settings = parseIndexDefaults(indexHtml);
    if (fs.existsSync(stateFile)) {
      try {
        const stored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        settings = {...settings, ...stored};
      } catch (error) {
        // Ignore malformed cache
      }
    }
    res.json({settings, themes: THEMES});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    ensureDocsDir();
    const {
      title = 'Document',
      description = 'Description',
      docsifyName = '',
      theme = 'vue',
      loadSidebar = false,
    } = req.body || {};
    const indexPath = path.join(docsDir, 'index.html');
    const indexHtml = renderIndexHtml({title, description, docsifyName, theme, loadSidebar});
    await writeFileEnsured(indexPath, indexHtml);
    await writeFileEnsured(stateFile, JSON.stringify({title, description, docsifyName, theme, loadSidebar}, null, 2));
    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/sidebar', async (req, res) => {
  try {
    ensureDocsDir();
    const sidebarPath = path.join(docsDir, '_sidebar.md');
    const content = readFileSafe(sidebarPath);
    res.json({content, exists: fs.existsSync(sidebarPath)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/sidebar', async (req, res) => {
  try {
    ensureDocsDir();
    const sidebarPath = path.join(docsDir, '_sidebar.md');
    const content = String(req.body?.content ?? '');
    if (content.trim()) {
      await writeFileEnsured(sidebarPath, content);
    } else if (fs.existsSync(sidebarPath)) {
      await fs.promises.unlink(sidebarPath);
    }
    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/pages', async (req, res) => {
  try {
    const pages = await listMarkdownFiles();
    res.json({pages});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/page', async (req, res) => {
  try {
    ensureDocsDir();
    const relPath = String(req.query.path || '');
    if (!relPath.toLowerCase().endsWith('.md')) {
      return res.status(400).json({error: 'Only .md files are supported'});
    }
    const fullPath = resolveDocsPath(relPath);
    const content = readFileSafe(fullPath);
    res.json({path: relPath, content});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/page', async (req, res) => {
  try {
    ensureDocsDir();
    const relPath = String(req.body?.path || '');
    const content = String(req.body?.content ?? '');
    if (!relPath.toLowerCase().endsWith('.md')) {
      return res.status(400).json({error: 'Only .md files are supported'});
    }
    const fullPath = resolveDocsPath(relPath);
    await writeFileEnsured(fullPath, content);
    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/page', async (req, res) => {
  try {
    ensureDocsDir();
    const relPath = String(req.query.path || '');
    if (!relPath.toLowerCase().endsWith('.md')) {
      return res.status(400).json({error: 'Only .md files are supported'});
    }
    if (relPath === 'README.md') {
      return res.status(400).json({error: 'Cannot delete README.md'});
    }
    const fullPath = resolveDocsPath(relPath);
    await fs.promises.unlink(fullPath);
    res.json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    ensureDocsDir();
    const filename = String(req.body?.filename || '').trim();
    const dataUrl = String(req.body?.dataUrl || '');
    if (!filename) return res.status(400).json({error: 'filename required'});
    if (!dataUrl.startsWith('data:')) return res.status(400).json({error: 'dataUrl must be a data: URL'});

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({error: 'Invalid dataUrl'});
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({error: 'File too large (max 8MB)'});

    const safeName = filename.replaceAll('\\', '/').split('/').pop().replaceAll('..', '');
    const targetDir = resolveDocsPath('media');
    await fs.promises.mkdir(targetDir, {recursive: true});
    const targetPath = path.join(targetDir, safeName);
    await fs.promises.writeFile(targetPath, buffer);
    res.json({ok: true, path: `./media/${safeName}`});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/check-preview', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({error: 'Invalid url'});
    }
    const client = url.startsWith('https://') ? https : http;
    const request = client.get(url, {timeout: 1500}, response => {
      response.resume();
      res.json({ok: response.statusCode && response.statusCode < 500, status: response.statusCode || null});
    });
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', () => {
      res.json({ok: false, status: null});
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({error: 'Unexpected error'});
});

app.listen(PORT, () => {
  console.log(`Docsify designer running on http://localhost:${PORT}`);
  console.log(`Editing docs directory: ${docsDir}`);
});
