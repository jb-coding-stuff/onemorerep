import { useState } from 'react'

const APP_URL = 'https://fitness-tracker-ten-ecru.vercel.app'
const REPO_URL = 'https://github.com/jb-coding-stuff/onemorerep'

function inviteText() {
  return [
    'Train with me in OneMoreRep 💪',
    '',
    `1. Open ${APP_URL} in Safari`,
    '2. Share → Add to Home Screen',
    '3. Open it and tap "New here? Create an account"',
    '4. Confirm the email, then sign in',
    '',
    'Shared plans show up in Me → Training Plan → From friends.'
  ].join('\n')
}

function mcpText() {
  const config = {
    mcpServers: {
      'fitness-tracker': {
        command: 'node',
        args: ['/PATH/TO/onemorerep-main/mcp-server/src/index.js'],
        env: {
          SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
          SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
          APP_EMAIL: 'YOUR APP EMAIL',
          APP_PASSWORD: 'YOUR APP PASSWORD'
        }
      }
    }
  }
  return [
    'OneMoreRep MCP setup (upload training plans with Claude Desktop)',
    '',
    '1. Create your account in the app first.',
    '2. Install Node.js (nodejs.org, LTS) and Claude Desktop.',
    `3. Download ${REPO_URL} (Code → Download ZIP), unzip it (folder onemorerep-main), then in Terminal: cd onemorerep-main/mcp-server && npm install`,
    '4. Claude Desktop → Settings → Developer → Edit Config. Paste the block below, replace /PATH/TO with where you unzipped it, and fill in your app email and password. Restart Claude Desktop.',
    '5. Ask Claude to turn your plan (PDF, Excel or a description) into a OneMoreRep program. It shows a preview and only uploads after you confirm.',
    '',
    'Keep the config private: it contains your password.',
    '',
    JSON.stringify(config, null, 2)
  ].join('\n')
}

/** Share via the iPhone share sheet, or copy when sharing isn't available. */
async function shareOrCopy(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}

export default function InviteFriends() {
  const [copied, setCopied] = useState(null)

  async function run(kind) {
    const result = kind === 'invite'
      ? await shareOrCopy('OneMoreRep', inviteText())
      : await shareOrCopy('OneMoreRep MCP setup', mcpText())
    if (result === 'copied') {
      setCopied(kind)
      setTimeout(() => setCopied(c => (c === kind ? null : c)), 2500)
    }
  }

  const row = 'w-full py-4 flex items-center justify-between text-left font-medium border-t border-white/[.06] transition-opacity active:opacity-60'
  return (
    <div>
      <button onClick={() => run('invite')} className={row}>
        Invite Friends
        <span className="text-sm text-secondary">{copied === 'invite' ? 'Copied' : ''}</span>
      </button>
      <button onClick={() => run('mcp')} className={row}>
        <span>
          Share MCP Setup
          <span className="block text-xs font-normal text-secondary">For uploading plans with Claude Desktop</span>
        </span>
        <span className="text-sm text-secondary">{copied === 'mcp' ? 'Copied' : ''}</span>
      </button>
    </div>
  )
}
