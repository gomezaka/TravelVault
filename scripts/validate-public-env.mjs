import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const mode = process.env.MODE || process.env.NODE_ENV || 'production'
const env = { ...process.env }

function parseEnvFile(filePath){
  if(!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for(const rawLine of text.split(/\r?\n/)){
    const line = rawLine.trim()
    if(!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if(!match) continue
    const [, key, rawValue] = match
    if(env[key] !== undefined) continue
    env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '')
  }
}

for(const file of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]){
  parseEnvFile(path.join(root, file))
}

const authDisabled = env.VITE_ENABLE_AUTH === 'false'
const supabaseUrl = env.VITE_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''

if(supabaseKey.startsWith('sb_secret_')){
  console.error('Build stopped: a Supabase secret key is configured as a public VITE_ variable.')
  console.error('Use VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... or VITE_SUPABASE_ANON_KEY=<anon JWT> for the browser app.')
  console.error('Never expose sb_secret_... keys in Netlify Builds/Runtime or frontend .env files.')
  process.exit(1)
}

if(!authDisabled && (!supabaseUrl || !supabaseKey)){
  console.error('Build stopped: Supabase Auth is enabled, but VITE_SUPABASE_URL and a public Supabase key are required.')
  console.error('Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in the build environment.')
  process.exit(1)
}
