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

function cleanText(value: unknown){
  return String(value || '').trim()
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
    self: 'deg selv',
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

function randomToken(){
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string){
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromHeader({ smtpUser }: { smtpUser: string }){
  const configured = cleanText(Deno.env.get('SMTP_FROM') || Deno.env.get('INVITE_FROM') || Deno.env.get('INVITE_FROM_EMAIL') || Deno.env.get('FROM_EMAIL'))
  if(!configured) return `Travelvault <${smtpUser}>`
  if(configured.includes('<')) return configured
  const email = cleanEmail(configured)
  return isEmail(email) ? `Travelvault <${email}>` : configured
}

function appBaseUrl(){
  return (Deno.env.get('PUBLIC_APP_URL') || 'https://travelvault.notools.no').replace(/\/$/, '')
}

function buildInviteUrl(token: string){
  return `${appBaseUrl()}/?householdInvite=${encodeURIComponent(token)}`
}

function buildMail({ displayName, invitedByName, relation, inviteUrl }: { displayName: string; invitedByName: string; relation: string; inviteUrl: string }){
  const safeName = displayName || 'du'
  const relationText = relationLabel(relation)
  const text = `Hei ${safeName}!

Du er invitert til å bruke Travelvault Family sammen med ${invitedByName}.

Travelvault Family samler familiekalender, handleliste, chat, oppgaver og reiseplaner på ett sted.

Åpne invitasjonen her:
${inviteUrl}

Logg inn med samme e-postadresse som invitasjonen ble sendt til. Da får du tilgang til familiens felles oversikt.

Hilsen Travelvault`

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933;max-width:560px">
      <h2>Hei ${escapeHtml(safeName)}!</h2>
      <p>Du er invitert til å bruke <strong>Travelvault Family</strong> sammen med ${escapeHtml(invitedByName)}.</p>
      <p>Travelvault Family samler familiekalender, handleliste, chat, oppgaver og reiseplaner på ett sted.</p>
      <p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#b4532f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Godta invitasjon</a></p>
      <p>Logg inn med samme e-postadresse som invitasjonen ble sendt til. Da får du tilgang til familiens felles oversikt.</p>
      <p style="color:#667085;font-size:13px">Du er lagt inn som ${escapeHtml(relationText)} i familiens Travelvault.</p>
      <p>Hilsen<br/>Travelvault</p>
    </div>`

  return { text, html }
}

function missingHouseholdTables(error: unknown){
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return text.includes('household_') || text.includes('households') || text.includes('schema cache') || text.includes('pgrst205') || (text.includes('relation') && text.includes('does not exist'))
}

async function ensureProfile(client: ReturnType<typeof createClient>, user: Record<string, unknown>){
  await client.from('profiles').upsert({
    id: user.id,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Travelvault-bruker'
  }, { onConflict: 'id' })
}

async function ensureOwnedHousehold(client: ReturnType<typeof createClient>, user: Record<string, unknown>, requestedHouseholdId: string | null){
  if(requestedHouseholdId){
    const { data, error } = await client
      .from('households')
      .select('id,name,owner_id')
      .eq('id', requestedHouseholdId)
      .maybeSingle()
    if(error) throw error
    if(!data) throw new Error('Fant ikke familiehjemmet invitasjonen skal knyttes til.')
    if(data.owner_id !== user.id) throw new Error('Bare eier kan invitere til dette familiehjemmet.')
    return data
  }

  const { data: ownedRows, error: ownedError } = await client
    .from('households')
    .select('id,name,owner_id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  if(ownedError) throw ownedError

  let household = ownedRows?.[0] || null
  if(!household){
    const { data, error } = await client
      .from('households')
      .insert({ owner_id: user.id, name: 'Min familie' })
      .select('id,name,owner_id')
      .single()
    if(error) throw error
    household = data
  }

  const { error: membershipError } = await client
    .from('household_members')
    .upsert({
      household_id: household.id,
      user_id: user.id,
      role: 'owner',
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Eier',
      email: user.email || null,
      status: 'active'
    }, { onConflict: 'household_id,user_id' })
  if(membershipError) throw membershipError

  return household
}

async function upsertFamilyMember(client: ReturnType<typeof createClient>, { familyMemberId, email, displayName, relation }: { familyMemberId?: string | null; email: string; displayName: string; relation: string }){
  let familyRow = null

  if(familyMemberId){
    const { data, error } = await client
      .from('family_members')
      .update({ email, display_name: displayName, relation, invite_status: 'pending' })
      .eq('id', familyMemberId)
      .select('id')
      .maybeSingle()
    if(error) throw error
    familyRow = data
  }

  if(!familyRow){
    const { data: existing, error: existingError } = await client
      .from('family_members')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if(existingError) throw existingError

    if(existing){
      const { data, error } = await client
        .from('family_members')
        .update({ display_name: displayName, relation, invite_status: 'pending' })
        .eq('id', existing.id)
        .select('id')
        .single()
      if(error) throw error
      familyRow = data
    }else{
      const { data, error } = await client
        .from('family_members')
        .insert({ email, display_name: displayName, relation, invite_status: 'pending' })
        .select('id')
        .single()
      if(error) throw error
      familyRow = data
    }
  }

  return familyRow?.id || null
}

async function createHouseholdInvite(client: ReturnType<typeof createClient>, { householdId, email, displayName, relation, familyMemberId, tripId, memberId, userId }: Record<string, unknown>){
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await client
    .from('household_invites')
    .insert({
      household_id: householdId,
      email,
      display_name: displayName,
      relation,
      role: 'member',
      token_hash: tokenHash,
      status: 'pending',
      family_member_id: familyMemberId || null,
      trip_id: tripId || null,
      member_id: memberId || null,
      invited_by: userId,
      expires_at: expiresAt
    })
    .select('id,expires_at')
    .single()

  if(error) throw error
  return { token, inviteId: data.id, expiresAt: data.expires_at }
}

async function updateInviteStatus(client: ReturnType<typeof createClient>, { familyMemberId, memberId, inviteId, status, invitedAt }: { familyMemberId?: string | null; memberId?: string | null; inviteId?: string | null; status: string; invitedAt?: string | null }){
  const patch: Record<string, unknown> = { invite_status: status }
  if(invitedAt) patch.invited_at = invitedAt
  if(familyMemberId){
    await client.from('family_members').update(patch).eq('id', familyMemberId)
  }
  if(memberId){
    await client.from('trip_members').update(patch).eq('id', memberId)
  }
  if(inviteId){
    const invitePatch: Record<string, unknown> = { status }
    if(invitedAt) invitePatch.invited_at = invitedAt
    await client.from('household_invites').update(invitePatch).eq('id', inviteId)
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
  const displayName = cleanText(body.displayName || body.name || email.split('@')[0] || 'Familiemedlem')
  const relation = cleanText(body.relation || 'family')
  const tripId = body.tripId ? String(body.tripId) : null
  const memberId = body.memberId ? String(body.memberId) : null
  const requestedHouseholdId = body.householdId ? String(body.householdId) : null
  let familyMemberId = body.familyMemberId ? String(body.familyMemberId) : null

  if(!isEmail(email)) return json(400, { error: 'Ugyldig e-postadresse.' })

  let supabaseUrl = ''
  let anonKey = ''
  try{
    supabaseUrl = requiredSecret('SUPABASE_URL')
    anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
    if(!anonKey) throw new Error('Mangler SUPABASE_ANON_KEY eller SUPABASE_PUBLISHABLE_KEY i Supabase Function secrets.')
  }catch(error){
    return json(500, { error: error.message })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if(!authHeader) return json(401, { error: 'Du må være innlogget for å sende invitasjoner.' })

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: userData, error: userError } = await client.auth.getUser()
  const user = userData?.user
  if(userError || !user) return json(401, { error: 'Ugyldig eller utløpt innlogging.' })

  try{
    await ensureProfile(client, user)
  }catch(error){
    return json(500, { error: error?.message || 'Klarte ikke å klargjøre brukerprofil.' })
  }

  if(tripId){
    const { data: trip, error: tripError } = await client
      .from('trips')
      .select('id,owner_id')
      .eq('id', tripId)
      .single()
    if(tripError || !trip) return json(404, { error: 'Fant ikke turen.' })
    if(trip.owner_id !== user.id) return json(403, { error: 'Bare eier kan invitere til denne turen.' })
  }

  let household = null
  let inviteId = null
  let inviteUrl = appBaseUrl()

  try{
    household = await ensureOwnedHousehold(client, user, requestedHouseholdId)
    familyMemberId = await upsertFamilyMember(client, { familyMemberId, email, displayName, relation })
    if(memberId && familyMemberId){
      await client
        .from('trip_members')
        .update({ family_member_id: familyMemberId, email, invite_status: 'pending' })
        .eq('id', memberId)
    }
    const invite = await createHouseholdInvite(client, {
      householdId: household.id,
      email,
      displayName,
      relation,
      familyMemberId,
      tripId,
      memberId,
      userId: user.id
    })
    inviteId = invite.inviteId
    inviteUrl = buildInviteUrl(invite.token)
  }catch(error){
    if(missingHouseholdTables(error)){
      return json(500, { error: 'Kjør Supabase-migrasjonene 13 og 14 før familieinvitasjoner kan gi tilgang til felles familiehjem.' })
    }
    return json(500, { error: error?.message || 'Klarte ikke å opprette familieinvitasjon.' })
  }

  let smtpHost = ''
  let smtpUser = ''
  let smtpPass = ''
  try{
    smtpHost = requiredSecret('SMTP_HOST')
    smtpUser = requiredSecret('SMTP_USER')
    smtpPass = requiredSecret('SMTP_PASS')
  }catch(error){
    await updateInviteStatus(client, { familyMemberId, memberId, inviteId, status: 'failed' })
    return json(500, { error: error.message })
  }

  const smtpPort = Number(Deno.env.get('SMTP_PORT') || '465')
  const smtpSecureValue = Deno.env.get('SMTP_SECURE')
  const smtpSecure = smtpSecureValue ? smtpSecureValue !== 'false' : smtpPort === 465
  const smtpFrom = fromHeader({ smtpUser })
  const replyTo = cleanEmail(Deno.env.get('REPLY_TO_EMAIL') || '')
  const invitedByName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'familien din'

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  })

  const mail = buildMail({ displayName, invitedByName, relation, inviteUrl })

  try{
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      replyTo: replyTo || undefined,
      subject: 'Du er invitert til Travelvault Family',
      text: mail.text,
      html: mail.html
    })
  }catch(error){
    await updateInviteStatus(client, { familyMemberId, memberId, inviteId, status: 'failed' })
    return json(502, { error: error?.message || 'Klarte ikke å sende e-post via SMTP.' })
  }

  const invitedAt = new Date().toISOString()
  await updateInviteStatus(client, { familyMemberId, memberId, inviteId, status: 'sent', invitedAt })

  return json(200, { ok: true, householdId: household?.id || null, familyMemberId, inviteId, invitedAt })
})
