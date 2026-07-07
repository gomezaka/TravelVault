// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(status: number, body: Record<string, unknown>){
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function cleanEmail(email: unknown){
  return String(email || '').trim().toLowerCase()
}

function isEmail(email: string){
  return /^\S+@\S+\.\S+$/.test(email)
}

function requiredSecret(name: string){
  const value = Deno.env.get(name)
  if(!value) throw new Error(`Mangler ${name} i Supabase Function secrets.`)
  return value
}

function escapeHtml(value: string){
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function relationLabel(value: string){
  const labels: Record<string, string> = {
    adult: 'voksen',
    child: 'barn',
    teen: 'ungdom',
    grandparent: 'besteforelder',
    family: 'familie',
    friend: 'venn',
    other: 'familiemedlem'
  }
  return labels[value] || 'familiemedlem'
}

function buildMail({ displayName, invitedByName, relation, appUrl }: { displayName: string; invitedByName: string; relation: string; appUrl: string }){
  const safeName = displayName || 'du'
  const relationText = relationLabel(relation)
  const text = `Hei ${safeName}!

Du er invitert til å bruke Travelvault sammen med ${invitedByName}.

Travelvault samler reiseplaner, dokumenter, pakkelister, bilder og minner på ett sted.

Åpne appen her:
${appUrl}

Du kan installere den på mobilen ved å åpne lenken og velge «Legg til på hjemskjerm».

Logg inn med Google når du åpner appen. Da kan familien dele turer og planer med deg.

Hilsen Travelvault`

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933;max-width:560px">
      <h2>Hei ${escapeHtml(safeName)}!</h2>
      <p>Du er invitert til å bruke <strong>Travelvault</strong> sammen med ${escapeHtml(invitedByName)}.</p>
      <p>Travelvault samler reiseplaner, dokumenter, pakkelister, bilder og minner på ett sted.</p>
      <p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#b4532f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Åpne Travelvault</a></p>
      <p>Du kan installere appen på mobilen ved å åpne lenken og velge <strong>Legg til på hjemskjerm</strong>.</p>
      <p>Logg inn med Google når du åpner appen. Da kan familien dele turer og planer med deg.</p>
      <p style="color:#667085;font-size:13px">Du er lagt inn som ${escapeHtml(relationText)} i familiens Travelvault.</p>
      <p>Hilsen<br/>Travelvault</p>
    </div>`

  return { text, html }
}

async function updateInviteStatus(client: ReturnType<typeof createClient>, { familyMemberId, memberId, status, invitedAt }: { familyMemberId?: string | null; memberId?: string | null; status: string; invitedAt?: string | null }){
  const patch: Record<string, unknown> = { invite_status: status }
  if(invitedAt) patch.invited_at = invitedAt
  if(familyMemberId){
    await client.from('family_members').update(patch).eq('id', familyMemberId)
  }
  if(memberId){
    await client.from('trip_members').update(patch).eq('id', memberId)
  }
}

serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if(req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let body: Record<string, unknown>
  try{
    body = await req.json()
  }catch{
    return json(400, { error: 'Ugyldig JSON.' })
  }

  const email = cleanEmail(body.email)
  const displayName = String(body.displayName || body.name || email.split('@')[0] || 'Familiemedlem').trim()
  const relation = String(body.relation || 'family').trim()
  const tripId = body.tripId ? String(body.tripId) : null
  const memberId = body.memberId ? String(body.memberId) : null
  let familyMemberId = body.familyMemberId ? String(body.familyMemberId) : null

  if(!isEmail(email)) return json(400, { error: 'Ugyldig e-postadresse.' })

  const supabaseUrl = requiredSecret('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if(!anonKey) return json(500, { error: 'Mangler SUPABASE_ANON_KEY eller SUPABASE_PUBLISHABLE_KEY i Supabase Function secrets.' })

  const authHeader = req.headers.get('Authorization') || ''
  if(!authHeader) return json(401, { error: 'Du må være innlogget for å sende invitasjoner.' })

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: userData, error: userError } = await client.auth.getUser()
  const user = userData?.user
  if(userError || !user) return json(401, { error: 'Ugyldig eller utløpt innlogging.' })

  if(tripId){
    const { data: trip, error: tripError } = await client
      .from('trips')
      .select('id,owner_id')
      .eq('id', tripId)
      .single()
    if(tripError || !trip) return json(404, { error: 'Fant ikke turen.' })
    if(trip.owner_id !== user.id) return json(403, { error: 'Bare eier kan invitere til denne turen.' })
  }

  let familyRow = null
  if(familyMemberId){
    const { data, error } = await client
      .from('family_members')
      .update({ email, display_name: displayName, relation, invite_status: 'pending' })
      .eq('id', familyMemberId)
      .select('id')
      .maybeSingle()
    if(error) return json(500, { error: error.message })
    familyRow = data
  }

  if(!familyRow){
    const { data: existing, error: existingError } = await client
      .from('family_members')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if(existingError) return json(500, { error: existingError.message })

    if(existing){
      const { data, error } = await client
        .from('family_members')
        .update({ display_name: displayName, relation, invite_status: 'pending' })
        .eq('id', existing.id)
        .select('id')
        .single()
      if(error) return json(500, { error: error.message })
      familyRow = data
    }else{
      const { data, error } = await client
        .from('family_members')
        .insert({ email, display_name: displayName, relation, invite_status: 'pending' })
        .select('id')
        .single()
      if(error) return json(500, { error: error.message })
      familyRow = data
    }
    familyMemberId = familyRow?.id || null
  }

  if(memberId && familyMemberId){
    await client
      .from('trip_members')
      .update({ family_member_id: familyMemberId, email, invite_status: 'pending' })
      .eq('id', memberId)
  }

  const smtpHost = requiredSecret('SMTP_HOST')
  const smtpPort = Number(Deno.env.get('SMTP_PORT') || '465')
  const smtpSecureValue = Deno.env.get('SMTP_SECURE')
  const smtpSecure = smtpSecureValue ? smtpSecureValue !== 'false' : smtpPort === 465
  const smtpUser = requiredSecret('SMTP_USER')
  const smtpPass = requiredSecret('SMTP_PASS')
  const smtpFrom = Deno.env.get('SMTP_FROM') || `Travelvault <${smtpUser}>`
  const appUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://travelvault.notools.no').replace(/\/$/, '')
  const invitedByName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'familien din'

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  })

  const mail = buildMail({ displayName, invitedByName, relation, appUrl })

  try{
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'Du er invitert til Travelvault',
      text: mail.text,
      html: mail.html
    })
  }catch(error){
    await updateInviteStatus(client, { familyMemberId, memberId, status: 'failed' })
    return json(502, { error: error?.message || 'Klarte ikke å sende e-post via SMTP.' })
  }

  const invitedAt = new Date().toISOString()
  await updateInviteStatus(client, { familyMemberId, memberId, status: 'sent', invitedAt })

  return json(200, { ok: true, familyMemberId, invitedAt })
})
