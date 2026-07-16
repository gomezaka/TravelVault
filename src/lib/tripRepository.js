import { supabase } from './supabase'

function isoToday(){
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function statusForTrip(startDate, endDate){
  const today = isoToday()
  if(endDate && endDate < today) return 'Tidligere'
  if(startDate && startDate <= today && (!endDate || endDate >= today)) return 'Pågår'
  return 'Kommende'
}

function formatDate(dateString){
  if(!dateString) return ''
  const [year, month, day] = dateString.split('-')
  return `${Number(day)}.${Number(month)}.${year}`
}
function normalizeDurationDays(value){
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? Math.ceil(days) : null
}
function durationFromDateRange(startDate, endDate){
  if(!startDate || !endDate || endDate < startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const days = Math.round((end - start) / 86400000) + 1
  return days > 0 ? days : null
}
function tripDurationDays(create){
  return normalizeDurationDays(create?.durationDays || create?.duration_days) || durationFromDateRange(create?.start || create?.start_date, create?.end || create?.end_date)
}
function durationLabel(days){
  const normalized = normalizeDurationDays(days)
  if(!normalized) return ''
  return `${normalized} ${normalized === 1 ? 'dag' : 'dager'}`
}

function dateLabel(startDate, endDate, durationDays){
  if(startDate && endDate) return `${formatDate(startDate)}–${formatDate(endDate)}`
  if(startDate) return formatDate(startDate)
  return durationLabel(durationDays) || ''
}

function displayNameFromEmail(email){
  return email?.split('@')[0] || 'Familiemedlem'
}

function personName(person){
  if(typeof person === 'string') return person.trim()
  return person?.name?.trim() || person?.display_name?.trim() || displayNameFromEmail(person?.email)
}

function personEmail(person){
  return typeof person === 'string' ? '' : (person?.email || '').trim().toLowerCase()
}

function personRelation(person){
  return typeof person === 'string' ? 'family' : (person?.relation || 'family')
}

function personShouldInvite(person){
  return typeof person === 'string' ? false : Boolean(person?.invite && personEmail(person))
}

function normalizeParticipants(participants = [], session){
  const ownerName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Eier'
  const ownerEmail = session?.user?.email || ''
  const rows = Array.isArray(participants) ? participants : []
  const normalized = rows.map((person, index) => ({
    clientId: typeof person === 'string' ? `participant-${index}` : person.id,
    name: personName(person),
    email: personEmail(person),
    relation: personRelation(person),
    role: index === 0 ? 'owner' : 'participant',
    invite: index > 0 && personShouldInvite(person),
    familyMemberId: typeof person === 'string' ? null : person.familyMemberId || person.family_member_id || null
  })).filter(person => person.name || person.email)

  if(!normalized.length){
    return [{ name: ownerName, email: ownerEmail, relation: 'self', role: 'owner', invite: false, familyMemberId: null }]
  }

  return normalized.map((person, index) => index === 0 ? {
    ...person,
    name: person.name || ownerName,
    email: person.email || ownerEmail,
    relation: 'self',
    role: 'owner',
    invite: false
  } : person)
}

function mapInviteStatus(status){
  if(status === 'sent') return 'invite_sent'
  if(status === 'failed') return 'invite_failed'
  if(status === 'accepted') return 'active'
  return status || 'active'
}

function mapLocationMeta(row){
  if(!row.main_location_lat || !row.main_location_lng) return null
  return {
    id: row.main_location_osm_type && row.main_location_osm_id ? `${row.main_location_osm_type}-${row.main_location_osm_id}` : `coords-${row.main_location_lat}-${row.main_location_lng}`,
    name: row.main_location || 'Ukjent sted',
    displayName: row.main_location_address || row.main_location || 'Ukjent sted',
    shortAddress: row.main_location_address || '',
    lat: Number(row.main_location_lat),
    lon: Number(row.main_location_lng),
    osmType: row.main_location_osm_type || null,
    osmId: row.main_location_osm_id || null,
    source: row.main_location_source || 'OpenStreetMap'
  }
}

function tripLocationColumns(create){
  const location = create.locationMeta || null
  return {
    main_location: location?.name || create.location?.trim() || null,
    main_location_address: location?.displayName || null,
    main_location_lat: Number.isFinite(Number(location?.lat)) ? Number(location.lat) : null,
    main_location_lng: Number.isFinite(Number(location?.lon)) ? Number(location.lon) : null,
    main_location_osm_type: location?.osmType || null,
    main_location_osm_id: location?.osmId ? String(location.osmId) : null,
    main_location_source: location?.source || null
  }
}
function emptyAccommodation(){
  return { name: '', place: '', checkIn: '', checkOut: '', nights: '', roomType: '', notes: '' }
}
function normalizeAccommodation(accommodation = {}){
  return {
    name: (accommodation.name || '').trim(),
    place: (accommodation.place || '').trim(),
    checkIn: accommodation.checkIn || accommodation.check_in || '',
    checkOut: accommodation.checkOut || accommodation.check_out || '',
    nights: accommodation.nights || '',
    roomType: (accommodation.roomType || accommodation.room_type || '').trim(),
    notes: (accommodation.notes || '').trim()
  }
}
function normalizeTransportItem(item = {}, index = 0){
  return {
    id: item.id || `travel-${index}`,
    mode: item.mode || item.type || 'transport',
    customMode: (item.customMode || item.custom_mode || '').trim(),
    title: (item.title || '').trim(),
    date: item.date || '',
    time: item.time || '',
    place: (item.place || '').trim(),
    direction: item.direction || 'outbound',
    note: (item.note || item.notes || '').trim()
  }
}
function normalizeLogistics(logistics){
  const source = logistics || {}
  const transports = Array.isArray(source.transports)
    ? source.transports
    : Array.isArray(source.travelItems)
      ? source.travelItems
      : []
  return {
    accommodation: normalizeAccommodation(source.accommodation || source.hotel || emptyAccommodation()),
    transports: transports
      .map(normalizeTransportItem)
      .filter(item => item.title || item.place || item.date || item.time || item.customMode || item.note)
  }
}
function isMissingTravelLogisticsColumn(error){
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return message.includes('travel_logistics') || message.includes('schema cache')
}
function isMissingTripAppStateColumn(error){
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return message.includes('app_state') || message.includes('schema cache')
}
function isMissingProfileAppStateColumn(error){
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return message.includes('app_state') || message.includes('schema cache')
}
function isMissingDocumentUploadColumn(error){
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return message.includes('storage_bucket') || message.includes('original_file_name') || message.includes('mime_type') || message.includes('file_size') || message.includes('extracted_data') || message.includes('schema cache')
}
function validateTripDraft(create){
  if(!create?.type) throw new Error('Velg hva slags tur dette er.')
  if(!create?.title?.trim()) throw new Error('Legg inn navn på turen.')
  if(!tripDurationDays(create)) throw new Error('Legg inn hvor mange dager turen varer.')
  if(create.start && create.end && create.end < create.start) throw new Error('Sluttdato kan ikke være før startdato.')
}

const tripBaseSelectColumns = 'id,title,trip_type,start_date,end_date,duration_days,main_location,main_location_address,main_location_lat,main_location_lng,main_location_osm_type,main_location_osm_id,main_location_source,description,owner_id,created_at'
const tripLogisticsSelectColumns = `${tripBaseSelectColumns},travel_logistics`
const tripSelectColumns = `${tripLogisticsSelectColumns},app_state`
const documentBaseSelectColumns = 'id,title,document_type,file_url,linked_event_id,linked_member_id,created_at'
const documentSelectColumns = `${documentBaseSelectColumns},storage_bucket,original_file_name,mime_type,file_size,extracted_data`

export function mapTripRow(row){
  const memberCount = Array.isArray(row.trip_members) ? row.trip_members.length : Number(row.member_count || 1)
  return {
    id: row.id,
    title: row.title,
    type: row.trip_type,
    date: dateLabel(row.start_date, row.end_date, row.duration_days),
    location: row.main_location || 'Ukjent sted',
    locationMeta: mapLocationMeta(row),
    members: memberCount || 1,
    status: statusForTrip(row.start_date, row.end_date),
    next: 'Legg til første hendelse',
    startDate: row.start_date,
    endDate: row.end_date,
    durationDays: normalizeDurationDays(row.duration_days) || null,
    description: row.description || '',
    logistics: normalizeLogistics(row.travel_logistics),
    appState: row.app_state && typeof row.app_state === 'object' ? row.app_state : {},
    source: 'supabase'
  }
}

export function mapFamilyRow(row){
  return {
    id: row.id,
    name: row.display_name,
    email: row.email || '',
    relation: row.relation || 'family',
    inviteStatus: row.invite_status || 'not_sent',
    invitedAt: row.invited_at || null,
    createdAt: row.created_at || null,
    householdMemberId: row.household_member_id || null,
    userId: row.user_id || null,
    source: 'family_members'
  }
}

function mapHouseholdFamilyRow(row, currentUserId){
  const role = row.role || 'member'
  const isSelf = row.user_id === currentUserId
  return {
    id: row.family_member_id || `household-${row.id}`,
    householdMemberId: row.id,
    householdId: row.household_id,
    userId: row.user_id || null,
    name: row.display_name || row.email?.split('@')[0] || 'Familiemedlem',
    email: row.email || '',
    relation: isSelf ? 'self' : role === 'owner' ? 'adult' : 'family',
    role: role === 'owner' ? 'Eier' : role === 'admin' ? 'Admin' : role === 'viewer' ? 'Lesetilgang/barn' : 'Medlem',
    householdRole: role,
    inviteStatus: 'accepted',
    accessStatus: row.status || 'active',
    invitedAt: null,
    createdAt: row.created_at || null,
    source: 'household_members'
  }
}

function missingHouseholdInviteTable(error){
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return text.includes('household_') || text.includes('households') || text.includes('schema cache') || text.includes('pgrst205') || (text.includes('relation') && text.includes('does not exist'))
}

async function currentAuthUser(){
  const { data, error } = await supabase.auth.getUser()
  if(error) throw error
  return data?.user || null
}

function readPreferredHouseholdId(){
  try{
    if(typeof window === 'undefined') return ''
    return window.localStorage.getItem('travelvault-active-household-id') || ''
  }catch{
    return ''
  }
}

async function fetchActiveHouseholdIdForUser(userId){
  if(!userId) return null
  const preferredHouseholdId = readPreferredHouseholdId()
  if(preferredHouseholdId){
    const { data: preferredRows, error: preferredError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('household_id', preferredHouseholdId)
      .eq('user_id', userId)
      .limit(1)
    if(preferredError) throw preferredError
    if(preferredRows?.[0]?.household_id) return preferredRows[0].household_id
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('household_members')
    .select('household_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if(memberError) throw memberError
  if(memberRows?.[0]?.household_id) return memberRows[0].household_id

  const { data: ownedRows, error: ownedError } = await supabase
    .from('households')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if(ownedError) throw ownedError
  return ownedRows?.[0]?.id || null
}

async function fetchHouseholdFamilyRows(userId){
  try{
    const householdId = await fetchActiveHouseholdIdForUser(userId)
    if(!householdId) return []
    const { data, error } = await supabase
      .from('household_members')
      .select('id,household_id,user_id,role,display_name,email,family_member_id,status,created_at')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true })
    if(error) throw error
    return (data || []).map(row => mapHouseholdFamilyRow(row, userId))
  }catch(error){
    if(missingHouseholdInviteTable(error)) return []
    throw error
  }
}

function mergeFamilyAndHouseholdMembers(familyRows, householdRows){
  const byKey = new Map()
  const keyFor = row => row.email ? `email:${row.email.toLowerCase()}` : row.householdMemberId ? `hm:${row.householdMemberId}` : `id:${row.id}`

  householdRows.forEach(row => byKey.set(keyFor(row), row))
  familyRows.forEach(row => {
    const key = keyFor(row)
    const household = row.email ? byKey.get(`email:${row.email.toLowerCase()}`) : null
    const merged = household ? {
      ...row,
      householdMemberId: household.householdMemberId,
      householdId: household.householdId,
      userId: household.userId,
      role: household.role,
      householdRole: household.householdRole,
      inviteStatus: household.inviteStatus || row.inviteStatus,
      accessStatus: household.accessStatus || row.accessStatus,
      source: 'family_members'
    } : row
    byKey.set(key, merged)
  })

  return Array.from(byKey.values()).sort((a, b) => {
    if(a.relation === 'self' && b.relation !== 'self') return -1
    if(b.relation === 'self' && a.relation !== 'self') return 1
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  })
}

export async function fetchTripsForUser(){
  if(!supabase) return []
  let { data, error } = await supabase
    .from('trips')
    .select(`${tripSelectColumns},trip_members(id)`)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if(error && isMissingTripAppStateColumn(error)){
    const fallback = await supabase
      .from('trips')
      .select(`${tripLogisticsSelectColumns},trip_members(id)`)
      .order('start_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  }

  if(error && isMissingTravelLogisticsColumn(error)){
    const fallback = await supabase
      .from('trips')
      .select(`${tripBaseSelectColumns},trip_members(id)`)
      .order('start_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  }

  if(error) throw error
  return (data || []).map(mapTripRow)
}

export async function fetchUserAppState(){
  if(!supabase) return {}
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if(userError) throw userError
  const userId = userData?.user?.id
  if(!userId) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('app_state')
    .eq('id', userId)
    .maybeSingle()

  if(error && isMissingProfileAppStateColumn(error)) return {}
  if(error) throw error
  return data?.app_state && typeof data.app_state === 'object' ? data.app_state : {}
}

export async function updateUserAppState(appState = {}){
  if(!supabase) throw new Error('Supabase mangler.')
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if(userError) throw userError
  const user = userData?.user
  if(!user?.id) throw new Error('Supabase-innlogging mangler.')

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Travelvault-bruker',
      app_state: appState || {}
    }, { onConflict: 'id' })

  if(error && isMissingProfileAppStateColumn(error)) throw new Error('Kjør Supabase-migrasjonen for brukerlagring først.')
  if(error) throw error
  return appState || {}
}

export async function updateCurrentUserProfile(displayName){
  if(!supabase) throw new Error('Supabase mangler.')
  const name = String(displayName || '').trim()
  if(!name) throw new Error('Skriv inn et navn.')

  const { data: authData, error: authError } = await supabase.auth.updateUser({
    data: { full_name: name, name }
  })
  if(authError) throw authError

  const user = authData?.user
  if(!user?.id) throw new Error('Supabase-innlogging mangler.')
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, display_name: name }, { onConflict: 'id' })
  if(profileError) throw profileError
  return user
}

export async function fetchFamilyMembersForUser(){
  if(!supabase) return []
  const user = await currentAuthUser()

  const { data, error } = await supabase
    .from('family_members')
    .select('id,display_name,email,relation,invite_status,invited_at,created_at')
    .order('created_at', { ascending: true })

  if(error) throw error

  const familyRows = (data || []).map(mapFamilyRow)
  const householdRows = await fetchHouseholdFamilyRows(user?.id)
  return mergeFamilyAndHouseholdMembers(familyRows, householdRows)
}

export async function saveFamilyMember({ member }){
  if(!supabase) throw new Error('Supabase mangler.')
  const email = personEmail(member) || null
  const row = {
    display_name: personName(member),
    email,
    relation: personRelation(member),
    invite_status: email ? (member.inviteStatus || 'not_sent') : 'not_needed'
  }

  if(member.id && !String(member.id).startsWith('local-')){
    const { data, error } = await supabase
      .from('family_members')
      .update(row)
      .eq('id', member.id)
      .select('id,display_name,email,relation,invite_status,invited_at,created_at')
      .single()
    if(error) throw error
    return mapFamilyRow(data)
  }

  const { data, error } = await supabase
    .from('family_members')
    .insert(row)
    .select('id,display_name,email,relation,invite_status,invited_at,created_at')
    .single()

  if(error) throw error
  return mapFamilyRow(data)
}

export async function deleteFamilyMember(memberId){
  if(!supabase) throw new Error('Supabase mangler.')
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', memberId)
  if(error) throw error
}

export async function fetchMembersForTrip(tripId){
  if(!supabase) return []
  const { data, error } = await supabase
    .from('trip_members')
    .select('id,display_name,email,relation,role,status,user_id,family_member_id,invite_status,invited_at,created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if(error) throw error
  return (data || []).map(member => ({
    id: member.id,
    userId: member.user_id,
    familyMemberId: member.family_member_id,
    name: member.display_name,
    email: member.email || '',
    relation: member.relation || 'family',
    role: member.role === 'owner' ? 'Eier' : member.role === 'admin' ? 'Admin' : member.role === 'viewer' ? 'Lesetilgang/barn' : 'Deltaker',
    status: mapInviteStatus(member.invite_status || member.status),
    invitedAt: member.invited_at || null
  }))
}

function documentBucketForType(documentType){
  return documentType === 'receipt' ? 'trip-receipts' : 'trip-documents'
}

function mapDocumentRow(row){
  return {
    id: row.id,
    title: row.title,
    type: row.document_type || 'other',
    fileUrl: row.file_url,
    bucket: row.storage_bucket || documentBucketForType(row.document_type),
    fileName: row.original_file_name || row.title,
    mimeType: row.mime_type || '',
    fileSize: Number(row.file_size || 0),
    linkedEventId: row.linked_event_id || null,
    linkedMemberId: row.linked_member_id || null,
    extractedData: row.extracted_data || null,
    createdAt: row.created_at || null,
    source: 'supabase'
  }
}

export async function fetchDocumentsForTrip(tripId){
  if(!supabase) return []
  let { data, error } = await supabase
    .from('trip_documents')
    .select(documentSelectColumns)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if(error && isMissingDocumentUploadColumn(error)){
    const fallback = await supabase
      .from('trip_documents')
      .select(documentBaseSelectColumns)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  }

  if(error) throw error
  return (data || []).map(mapDocumentRow)
}

export async function createTripDocumentSignedUrl(document){
  if(!supabase) throw new Error('Supabase mangler.')
  const bucket = document.bucket || documentBucketForType(document.type)
  const path = document.fileUrl || document.file_url
  if(!path) throw new Error('Dokumentet mangler filsti.')
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10)
  if(error) throw error
  return data.signedUrl
}

export async function updateTripDocumentMetadata({ documentId, title, documentType, extractedData }){
  if(!supabase) throw new Error('Supabase mangler.')
  const row = {
    title,
    document_type: documentType,
    extracted_data: extractedData || null
  }
  let { data, error } = await supabase
    .from('trip_documents')
    .update(row)
    .eq('id', documentId)
    .select(documentSelectColumns)
    .single()

  if(error && isMissingDocumentUploadColumn(error)){
    const fallback = await supabase
      .from('trip_documents')
      .update({ title, document_type: documentType })
      .eq('id', documentId)
      .select(documentBaseSelectColumns)
      .single()
    data = fallback.data
    error = fallback.error
  }

  if(error) throw error
  return mapDocumentRow({ ...data, extracted_data: data.extracted_data || extractedData })
}

export async function deleteTripDocumentById(document){
  if(!supabase) throw new Error('Supabase mangler.')
  const { error } = await supabase
    .from('trip_documents')
    .delete()
    .eq('id', document.id)
  if(error) throw error
  if(document.fileUrl){
    await supabase.storage
      .from(document.bucket || documentBucketForType(document.type))
      .remove([document.fileUrl])
  }
}

async function readFunctionError(error){
  const fallback = error?.message || 'Klarte ikke å sende invitasjon.'
  const context = error?.context
  if(!context) return fallback
  try{
    if(typeof context.json === 'function'){
      const payload = await context.json()
      return payload?.error || fallback
    }
  }catch{}
  return fallback
}

export async function inviteFamilyMember({ email, displayName, relation, tripId, memberId, familyMemberId, householdId }){
  if(!supabase) throw new Error('Supabase mangler.')
  const { data, error } = await supabase.functions.invoke('send-family-invite', {
    body: {
      email,
      displayName,
      relation,
      tripId,
      memberId,
      familyMemberId,
      householdId
    }
  })

  if(error){
    throw new Error(await readFunctionError(error))
  }
  if(data?.error){
    throw new Error(data.error)
  }
  return data || { ok: true }
}

export async function addTripMemberToTrip({ tripId, member }){
  if(!supabase) throw new Error('Supabase mangler.')
  const email = personEmail(member) || null
  const inviteStatus = email && member.invite ? 'pending' : email ? 'not_sent' : 'not_needed'
  const { data, error } = await supabase
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: null,
      family_member_id: member.familyMemberId || null,
      display_name: personName(member),
      email,
      relation: personRelation(member),
      role: 'participant',
      status: 'active',
      invite_status: inviteStatus
    })
    .select('id,display_name,email,relation,role,status,user_id,family_member_id,invite_status,invited_at,created_at')
    .single()

  if(error) throw error

  let mapped = (await fetchMembersForTrip(tripId)).find(row => row.id === data.id)
  if(email && member.invite){
    try{
      await inviteFamilyMember({
        tripId,
        memberId: data.id,
        familyMemberId: member.familyMemberId,
        email,
        displayName: personName(member),
        relation: personRelation(member)
      })
      mapped = { ...mapped, status: 'invite_sent', invitedAt: new Date().toISOString() }
    }catch(error){
      mapped = { ...mapped, status: 'invite_failed', inviteError: error.message }
    }
  }
  return mapped
}

export async function createTripWithMembers({ create, session }){
  if(!supabase || !session?.user) throw new Error('Supabase-innlogging mangler.')
  validateTripDraft(create)

  const title = create.title.trim()
  const participants = normalizeParticipants(create.participants, session)
  const tripInsert = {
    title,
    trip_type: create.type || 'family',
    start_date: create.start || null,
    end_date: create.end || null,
    duration_days: tripDurationDays(create),
    ...tripLocationColumns(create),
    description: create.description?.trim() || null,
    owner_id: session.user.id
  }

  let { data: tripRow, error: tripError } = await supabase
    .from('trips')
    .insert({ ...tripInsert, travel_logistics: normalizeLogistics(create.logistics) })
    .select(tripSelectColumns)
    .single()

  if(tripError && isMissingTripAppStateColumn(tripError)){
    const fallback = await supabase
      .from('trips')
      .insert({ ...tripInsert, travel_logistics: normalizeLogistics(create.logistics) })
      .select(tripLogisticsSelectColumns)
      .single()
    tripRow = fallback.data
    tripError = fallback.error
  }

  if(tripError && isMissingTravelLogisticsColumn(tripError)){
    const fallback = await supabase
      .from('trips')
      .insert(tripInsert)
      .select(tripBaseSelectColumns)
      .single()
    tripRow = fallback.data
    tripError = fallback.error
  }

  if(tripError) throw tripError

  const memberRows = participants.map((person, index) => ({
    trip_id: tripRow.id,
    user_id: index === 0 ? session.user.id : null,
    family_member_id: person.familyMemberId || null,
    display_name: person.name,
    email: person.email || null,
    relation: person.relation || (index === 0 ? 'self' : 'family'),
    role: index === 0 ? 'owner' : 'participant',
    status: 'active',
    invite_status: index === 0 ? 'not_needed' : person.email && person.invite ? 'pending' : person.email ? 'not_sent' : 'not_needed'
  }))

  const { data: insertedMembers, error: memberError } = await supabase
    .from('trip_members')
    .insert(memberRows)
    .select('id,display_name,email,relation,role,status,user_id,family_member_id,invite_status,invited_at,created_at')

  if(memberError) throw memberError

  const inviteTargets = (insertedMembers || []).map((row, index) => ({ row, person: participants[index], index }))
    .filter(({ index, row, person }) => index > 0 && row.email && person.invite)

  for(const { row, person } of inviteTargets){
    try{
      await inviteFamilyMember({
        tripId: tripRow.id,
        memberId: row.id,
        familyMemberId: row.family_member_id || person.familyMemberId,
        email: row.email,
        displayName: row.display_name,
        relation: row.relation
      })
    }catch(error){
      console.warn('Travelvault invitation failed:', error.message)
    }
  }

  const members = await fetchMembersForTrip(tripRow.id)
  return { trip: { ...mapTripRow({ ...tripRow, trip_members: members }), members: members.length }, members }
}

export async function updateTripDetails({ tripId, create }){
  if(!supabase) throw new Error('Supabase mangler.')
  validateTripDraft(create)
  const tripPatch = {
    title: create.title.trim(),
    trip_type: create.type || 'family',
    start_date: create.start || null,
    end_date: create.end || null,
    duration_days: tripDurationDays(create),
    ...tripLocationColumns(create),
    description: create.description?.trim() || null
  }
  if(create.logistics !== undefined) tripPatch.travel_logistics = normalizeLogistics(create.logistics)

  let { data, error } = await supabase
    .from('trips')
    .update(tripPatch)
    .eq('id', tripId)
    .select(`${tripSelectColumns},trip_members(id)`)
    .single()

  if(error && isMissingTripAppStateColumn(error)){
    const fallback = await supabase
      .from('trips')
      .update(tripPatch)
      .eq('id', tripId)
      .select(`${tripLogisticsSelectColumns},trip_members(id)`)
      .single()
    data = fallback.data
    error = fallback.error
  }

  if(error && isMissingTravelLogisticsColumn(error)){
    const { travel_logistics, ...fallbackPatch } = tripPatch
    const fallback = await supabase
      .from('trips')
      .update(fallbackPatch)
      .eq('id', tripId)
      .select(`${tripBaseSelectColumns},trip_members(id)`)
      .single()
    data = fallback.data
    error = fallback.error
  }

  if(error) throw error
  return mapTripRow(data)
}

export async function updateTripAppState({ tripId, appState }){
  if(!supabase) throw new Error('Supabase mangler.')
  const { data, error } = await supabase
    .from('trips')
    .update({ app_state: appState || {} })
    .eq('id', tripId)
    .select('id,app_state')
    .single()

  if(error && isMissingTripAppStateColumn(error)) throw new Error('Kjør Supabase-migrasjonen for turlagring først.')
  if(error) throw error
  return data?.app_state || appState || {}
}

export async function deleteTripById(tripId){
  if(!supabase) throw new Error('Supabase mangler.')
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripId)

  if(error) throw error
}
