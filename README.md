# SiteCheck AI

An early, local prototype of an AI-assisted website tester. Enter a public website address and optionally paste code to receive a prioritized quality report.

## What it checks now

- page title, description, main heading and mobile viewport
- placeholder links, image alt text, forms and placeholder copy
- initial server response time
- pasted-code risks: exposed secrets, debug logs, unfinished TODOs, unsafe HTML insertion and fetch calls without nearby error handling
- AI-powered issue explanations and code examples through the Gemini API

## Run it

This prototype uses only Node.js and has no dependencies to install.

```powershell
node --preserve-symlinks-main server.js
```

Then visit `http://localhost:3000`.

## Connect real AI fixes

Set your Gemini key only in the Windows Terminal session that starts the app. Never paste a key into the website or commit it to code.

```powershell
$env:GEMINI_API_KEY="your_api_key_here"
node --preserve-symlinks-main server.js
```

After you run a test, click **Ask AI for exact fix** under a finding. The AI receives that finding and the optional code you pasted, then generates an explanation, a code example, and a verification step.

## Next features for launch

1. Real browser testing with Playwright: click buttons, submit test forms, test mobile layouts, and collect screenshots.
2. GitHub connection and ZIP upload so the report can link to the exact file and line.
3. AI-powered issue explanations and safe patch suggestions.
4. Accounts, test history, subscriptions and cloud deployment.

Only test websites you own or are authorized to test.
