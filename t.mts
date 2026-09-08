import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { RAPPORT_HTML } from './src/lib/prompts/index.ts'
import { extraireRapportHtml } from './src/lib/scalr/rapportHtml.ts'
const S='/private/tmp/claude-501/-Users-wedicom-Desktop/f56fd743-b32e-4265-b655-e2c116fc6264/scratchpad'
const cle=(readFileSync('.env.local','utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const consigne=`**SYSTEM IDENTITY** You are a senior performance creative strategist building a full-funnel creative strategy for a DTC brand on Meta. **YOUR TASK** **SECTION 1 — ACCOUNT DIAGNOSIS** **SECTION 2 — PERSONA ARCHITECTURE** 3–5 personas **SECTION 3 — FULL FUNNEL MAP** **SECTION 4 — 90-DAY CREATIVE ROADMAP** **SECTION 5 — CREATIVE TRACKER SETUP** **SECTION 6 — THE FIRST THREE BRIEFS**`
const contenu = `# Données du compte (30 j)\n${readFileSync(`${S}/sb.json`,'utf8')}\n\n---\n\nQuestion : ${consigne}${RAPPORT_HTML}`
const client = new Anthropic({apiKey:cle})
for (const modele of ['claude-sonnet-5', 'claude-opus-5']) {
  const t0=Date.now()
  const m=await client.messages.stream({
    model: modele, max_tokens:40000, thinking:{type:'adaptive'}, output_config:{effort:'high'},
    system:`Tu es un Creative Strategist Meta Ads senior. Tu analyses les données réelles du compte fourni.`,
    messages:[{role:'user',content:contenu}],
  } as never).finalMessage()
  const s=Math.round((Date.now()-t0)/1000)
  const t=(m.content as {type:string;text?:string}[]).filter(b=>b.type==='text').map(b=>b.text).join('')
  const html=extraireRapportHtml(t)
  writeFileSync(`public/essai-${modele.includes('sonnet')?'sonnet':'opus'}.html`, html)
  console.log(`${modele.padEnd(16)} ${String(s).padStart(3)} s | ${m.stop_reason} | ${String(m.usage.output_tokens).padStart(6)} jetons | complet: ${/<\/html>\s*$/i.test(html.trim())} | ${(html.match(/<section/g)||[]).length} sections | ${(html.match(/type="radio"/g)||[]).length} onglets`)
}
