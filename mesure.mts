import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { RAPPORT_HTML } from './src/lib/prompts/index.ts'
import { extraireRapportHtml } from './src/lib/scalr/rapportHtml.ts'
const S='/private/tmp/claude-501/-Users-wedicom-Desktop/f56fd743-b32e-4265-b655-e2c116fc6264/scratchpad'
const cle=(readFileSync('.env.local','utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const consigne=`**SYSTEM IDENTITY** senior performance creative strategist, full-funnel creative strategy on Meta. **YOUR TASK** **SECTION 1 — ACCOUNT DIAGNOSIS** **SECTION 2 — PERSONA ARCHITECTURE** **SECTION 3 — FULL FUNNEL MAP** **SECTION 4 — 90-DAY CREATIVE ROADMAP** **SECTION 5 — CREATIVE TRACKER SETUP** **SECTION 6 — THE FIRST THREE BRIEFS**`
const contenu = `# Données du compte (30 j)\n${readFileSync(`${S}/sb.json`,'utf8')}\n\n---\n\nQuestion : ${consigne}${RAPPORT_HTML}`
const t0=Date.now()
const m=await new Anthropic({apiKey:cle}).messages.stream({
  model:'claude-opus-5', max_tokens:40000, thinking:{type:'adaptive'}, output_config:{effort:'high'},
  system:`Tu es un Creative Strategist Meta Ads senior. Tu analyses les données réelles du compte fourni.`,
  messages:[{role:'user',content:contenu}],
} as never).finalMessage()
const s=Math.round((Date.now()-t0)/1000)
const t=(m.content as {type:string;text?:string}[]).filter(b=>b.type==='text').map(b=>b.text).join('')
const html=extraireRapportHtml(t)
writeFileSync('public/essai-rapport.html', html)
console.log(`${s} s | ${m.stop_reason} | ${m.usage.output_tokens} jetons | complet: ${/<\/html>\s*$/i.test(html.trim())} | ${(html.match(/<section/g)||[]).length} sections | pied de page: ${/<footer/i.test(html)}`)
console.log('avant (gabarits tous injectés) : 362 s · 30 808 jetons · 8 sections pour 6 demandées')
