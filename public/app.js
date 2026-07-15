const form = document.querySelector('#test-form');
const button = document.querySelector('#run');
const result = document.querySelector('#result');
const empty = document.querySelector('#empty');
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
form.addEventListener('submit', async (event) => {
  event.preventDefault(); button.disabled = true; button.innerHTML = 'Testing…';
  try {
    const response = await fetch('/api/test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({url: document.querySelector('#url').value, code: document.querySelector('#code').value}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    document.querySelector('#summary').textContent = data.summary;
    document.querySelector('#score').textContent = data.score;
    const link = document.querySelector('#tested-url'); link.href = data.url; link.textContent = data.url;
    document.querySelector('#stats').innerHTML = `<span>HTTP ${data.status}</span><span>${data.stats.responseMs} ms response</span><span>${data.stats.images} images</span><span>${data.stats.forms} forms</span>`;
    const issues = document.querySelector('#issues');
    issues.innerHTML = data.issues.length ? data.issues.map((issue, index) => `<article class="issue ${issue.severity}"><div class="issue-top"><h3>${escapeHtml(issue.title)}</h3><span class="pill">${escapeHtml(issue.severity)}</span></div><p>${escapeHtml(issue.detail)}</p><div class="fix"><strong>Suggested fix:</strong> ${escapeHtml(issue.fix)}</div><button class="ai-button" data-issue="${index}">Ask AI for exact fix</button><div class="ai-answer" id="ai-answer-${index}" hidden></div><span class="issue-source">${escapeHtml(issue.source)}</span></article>`).join('') : '<article class="issue"><h3>Nothing critical found</h3><p>This first scan found no common quality problems.</p></article>';
    issues.querySelectorAll('.ai-button').forEach((aiButton) => aiButton.addEventListener('click', async () => {
      const index = Number(aiButton.dataset.issue); const answer = document.querySelector(`#ai-answer-${index}`);
      aiButton.disabled = true; aiButton.textContent = 'AI is preparing a fix...'; answer.hidden = true;
      try {
        const response = await fetch('/api/ai-fix', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url: data.url, issue: data.issues[index], code: document.querySelector('#code').value }) });
        const aiData = await response.json(); if (!response.ok) throw new Error(aiData.error);
        answer.innerHTML = formatAiAnswer(aiData.answer); answer.hidden = false; aiButton.textContent = 'AI fix created';
      } catch (error) { answer.textContent = error.message || 'AI could not create a fix.'; answer.hidden = false; aiButton.textContent = 'Try AI fix again'; aiButton.disabled = false; }
    }));
    empty.hidden = true; result.hidden = false; result.scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) { alert(error.message || 'The test failed. Please try again.'); }
  finally { button.disabled = false; button.innerHTML = 'Run test <span>→</span>'; }
});
function formatAiAnswer(text) {
  return escapeHtml(text).replace(/^## (.+)$/gm, '<h4>$1</h4>').replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>').replace(/\n/g, '<br>');
}
