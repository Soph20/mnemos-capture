# Meridian Capture

Zero-friction knowledge capture. Paste anything — article, blog, research, notes, social post.
Claude extracts insights and routes them to your knowledge hub automatically.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your Anthropic API key**
   Open `.env.local` and paste your key:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Get your key at https://console.anthropic.com

3. **Run**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Access from iPhone/iPad

**Same WiFi (home or office):**
1. Find your Mac's local IP: `System Settings → Wi-Fi → Details`
2. Open `http://[your-mac-ip]:3000` in Safari on your iPhone
3. Bookmark it — or add to home screen for app-like access

**Away from home (Cloudflare Tunnel — free, no account needed):**
```bash
# Install once
brew install cloudflare/cloudflare/cloudflared

# Run alongside npm run dev
cloudflared tunnel --url http://localhost:3000
```
Copy the generated `https://...trycloudflare.com` URL. Open it on your iPhone.
Note: the URL changes each time you run it. For a permanent URL, create a free Cloudflare account.

## How it works

1. Paste any content (URL, article text, notes, transcript, social post)
2. Hit **Capture** (or ⌘↵)
3. Claude extracts: core idea, key takeaways, quotes, mode tags
4. Saved to `knowledge/inbox/YYYY-MM-DD-[slug].md`
5. `knowledge/INDEX.md` updated automatically

## Process captures in Claude Code

When you're at your Mac, say in Claude Code:
> "process inbox"

Claude Code will read the inbox, extract insights to the relevant mode memory folders, and update the status.
