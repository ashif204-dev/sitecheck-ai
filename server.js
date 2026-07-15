const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

function send(res, status, data, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(contentType === 'application/json' ? JSON.stringify(data) : data);
}

function finding(severity, title, detail, fix, source = 'Website scan') {
  return { severity, title, detail, fix, source };
}

function allowedUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
  return url;
}

function analyzePage(html, pageUrl, responseMs) {
  const issues = [];
  const lower = html.toLowerCase();
  const count = (pattern) => (html.match(pattern) || []).length;
  if (!/<title[^>]*>[^<]{2,}</i.test(html)) issues.push(finding('high', 'Missing page title', 'Search engines and browser tabs cannot identify this page clearly.', 'Add a unique <title> that describes this page.'));
  if (!/<meta[^>]+name=["']description["']/i.test(html)) issues.push(finding('medium', 'Missing meta description', 'The page has no short search-result description.', 'Add a meta description with a clear summary of the page.'));
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push(finding('high', 'Mobile viewport is missing', 'The page may render too small or zoomed-out on phones.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head>.'));
  if (!/<h1\b/i.test(html)) issues.push(finding('medium', 'No main heading found', 'Visitors and screen readers may struggle to understand the page purpose.', 'Add one meaningful <h1> heading near the top of the page.'));
  if (/href=["'](?:#|javascript:void\(0\)|javascript:;?)["']/i.test(html)) issues.push(finding('medium', 'Possible non-working link or button', 'A link points to a placeholder instead of a real destination.', 'Replace placeholder href values with a real URL, or use a semantic <button> with a click handler.'));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)];
  const missingAlt = images.filter((m) => !/\balt\s*=/i.test(m[0])).length;
  if (missingAlt) issues.push(finding('low', `${missingAlt} image${missingAlt > 1 ? 's are' : ' is'} missing alt text`, 'People using screen readers will not get a description of these images.', 'Add useful alt text; use alt="" only for decorative images.'));
  const forms = count(/<form\b/gi);
  if (forms && !/<button\b[^>]*type=["']submit["']/i.test(html) && !/<input\b[^>]*type=["']submit["']/i.test(html)) issues.push(finding('medium', 'Form may not have a submit control', 'A form was found but no standard submit button was detected.', 'Use <button type="submit"> and test that it sends data to your backend.'));
  if (responseMs > 2500) issues.push(finding('medium', 'Slow initial response', `The server took ${responseMs} ms to respond.`, 'Optimize server work, caching, images, and third-party scripts.'));
  if (lower.includes('lorem ipsum')) issues.push(finding('low', 'Placeholder text is published', 'Lorem ipsum text is visible on the page.', 'Replace placeholder copy before launch.'));
  return { issues, stats: { images: images.length, forms, responseMs } };
}

function analyzeCode(code) {
  const issues = [];
  if (!code.trim()) return issues;
  const lines = code.split(/\r?\n/);
  const lineOf = (term) => lines.findIndex((line) => line.includes(term)) + 1;
  if (/console\.log\(/.test(code)) issues.push(finding('low', 'Debug logging found', 'Console logging may expose noisy or sensitive information in production.', 'Remove debug console.log statements before launch.', `Code line ${lineOf('console.log')}`));
  if (/TODO|FIXME/.test(code)) issues.push(finding('medium', 'Unfinished code marker found', 'The pasted code still contains TODO or FIXME notes.', 'Finish or remove the marked work before publishing.', `Code line ${lineOf('TODO') || lineOf('FIXME')}`));
  if (/password\s*[:=]\s*["'][^"']+["']/i.test(code) || /api[_-]?key\s*[:=]\s*["'][^"']+["']/i.test(code)) issues.push(finding('high', 'Possible secret in code', 'A password or API key appears to be written directly into the code.', 'Move secrets to environment variables and replace this value immediately.', 'Code scan'));
  if (/fetch\([^)]*\)(?![\s\S]{0,160}catch)/.test(code)) issues.push(finding('medium', 'Network request may lack error handling', 'A fetch call was found without nearby error handling.', 'Use try/catch or .catch() and show a useful message when the request fails.', `Code line ${lineOf('fetch(')}`));
  if (/innerHTML\s*=/.test(code)) issues.push(finding('medium', 'Unsafe HTML insertion may be present', 'Writing untrusted content with innerHTML can create a security problem.', 'Use textContent or sanitize any HTML before inserting it.', `Code line ${lineOf('innerHTML')}`));
  return issues;
}

async function testSite(input) {
  const url = allowedUrl(input.url);
  if (!url) throw new Error('Please enter a public http or https website URL.');
  const started = Date.now();
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SiteCheckAI/0.1 (website quality checker)' } });
  const responseMs = Date.now() - started;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new Error('This address did not return an HTML website.');
  const html = await response.text();
  const site = analyzePage(html, response.url, responseMs);
  const issues = [...site.issues, ...analyzeCode(input.code || '')];
  const high = issues.filter((x) => x.severity === 'high').length;
  const medium = issues.filter((x) => x.severity === 'medium').length;
  const score = Math.max(0, 100 - high * 22 - medium * 9 - issues.filter((x) => x.severity === 'low').length * 3);
  return { url: response.url, status: response.status, score, summary: high ? 'Your website has important issues to fix before launch.' : medium ? 'Your website is working, but needs a few improvements.' : 'Your website passed the checks we ran.', issues, stats: site.stats, checkedAt: new Date().toISOString() };
}

async function getAiFix(input) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('AI fixes are not connected yet. Add your GEMINI_API_KEY in Windows Terminal, restart the server, then try again.');
    error.statusCode = 503;
    throw error;
  }
  if (!input.issue?.title || !input.issue?.detail) throw new Error('Select a valid report issue first.');
  const code = String(input.code || '').slice(0, 12000);
  const prompt = `You are SiteCheck AI, a careful senior web developer. Help fix one website issue.\n\nWebsite: ${input.url || 'not provided'}\nIssue: ${input.issue.title}\nDetails: ${input.issue.detail}\nSuggested fix: ${input.issue.fix || 'not provided'}\n\nRelevant developer code:\n${code || '(No code supplied. Give a clearly labelled generic example.)'}\n\nUse exactly these Markdown headings: ## Why this matters, ## What to change, ## Code example, ## How to verify. Do not invent file names or line numbers. Keep the code safe and concise.`;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 900, temperature: 0.2 } }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'The Gemini AI service could not create a fix.');
  const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n');
  if (!answer) throw new Error('Gemini returned no fix. Please try again.');
  return { answer };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/test') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', async () => {
      try { send(res, 200, await testSite(JSON.parse(body))); }
      catch (error) { send(res, 400, { error: error.message || 'The test could not be completed.' }); }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/ai-fix') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', async () => {
      try { send(res, 200, await getAiFix(JSON.parse(body))); }
      catch (error) { send(res, error.statusCode || 400, { error: error.message || 'The AI fix could not be created.' }); }
    });
    return;
  }
  const requested = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  const filePath = path.join(publicDir, requested);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  send(res, 200, fs.readFileSync(filePath), types[ext] || 'application/octet-stream');
});
server.listen(PORT, () => console.log(`SiteCheck AI is running at http://localhost:${PORT}`));
