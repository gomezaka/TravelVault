import { supabase } from './supabase'

const householdTables = {
  shopping: 'household_shopping_items',
  tasks: 'household_tasks',
  calendarEvents: 'household_calendar_events',
  messages: 'household_messages'
}

function asText(value){
  return String(value || '').trim()
}

function asDate(value){
  const text = asText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function asTime(value){
  const text = asText(value)
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : null
}

function asIso(value){
  const text = asText(value)
  if(!text) return null
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function fallbackId(prefix, index){
  return `${prefix}-${Date.now()}-${index}`
}

export function isMissingHouseholdTablesError(error){
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return Boolean(text) && (
    text.includes('household_') ||
    text.includes('households') ||
    text.includes('schema cache') ||
    text.includes('pgrst205') ||
    text.includes('relation') && text.includes('does not exist')
  )
}

async function currentUser(){
  if(!supabase) throw new Error('Supabase mangler.')
  const { data, error } = await supabase.auth.getUser()
  if(error) throw error
  const user = data?.user
  if(!user?.id) throw new Error('Supabase-innlogging mangler.')
  return user
}

async function ensureProfile(user){
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Travelvault-bruker'
    }, { onConflict: 'id' })
  if(error) throw error
}

async function fetchHouseholdById(householdId){
  const { data, error } = await supabase
    .from('households')
    .select('id,name,owner_id,created_at,updated_at')
    .eq('id', householdId)
    .maybeSingle()
  if(error) throw error
  return data || null
}

async function ensureDefaultHousehold(){
  const user = await currentUser()
  await ensureProfile(user)

  const { data: memberRows, error: memberError } = await supabase
    .from('household_members')
    .select('household_id,role,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  if(memberError) throw memberError

  const existingHouseholdId = memberRows?.[0]?.household_id
  if(existingHouseholdId){
    const household = await fetchHouseholdById(existingHouseholdId)
    if(household) return { household, user }
  }

  const { data: ownedRows, error: ownedError } = await supabase
    .from('households')
    .select('id,name,owner_id,created_at,updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  if(ownedError) throw ownedError

  let household = ownedRows?.[0] || null
  if(!household){
    const { data, error } = await supabase
      .from('households')
      .insert({ owner_id: user.id, name: 'Min familie' })
      .select('id,name,owner_id,created_at,updated_at')
      .single()
    if(error) throw error
    household = data
  }

  const { error: membershipError } = await supabase
    .from('household_members')
    .upsert({
      household_id: household.id,
      user_id: user.id,
      role: 'owner',
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Eier',
      email: user.email || null
    }, { onConflict: 'household_id,user_id' })
  if(membershipError) throw membershipError

  return { household, user }
}

function mapShoppingRow(row){
  return {
    id: row.id,
    title: row.title || '',
    quantity: row.quantity || '',
    note: row.note || '',
    category: row.category || '',
    checked: Boolean(row.checked),
    source: row.source || 'family',
    sourceRef: row.source_ref || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || null
  }
}

function mapTaskRow(row){
  return {
    id: row.id,
    title: row.title || '',
    done: Boolean(row.done),
    priority: row.priority || 'normal',
    dueDate: row.due_date || '',
    person: row.person || '',
    source: row.source || 'family',
    sourceRef: row.source_ref || '',
    notes: row.notes || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || null
  }
}

function mapCalendarEventRow(row){
  return {
    id: row.id,
    title: row.title || '',
    date: row.event_date || '',
    time: row.event_time ? String(row.event_time).slice(0, 5) : '',
    endDate: row.end_date || '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    person: row.person || '',
    source: row.source || 'Manuell',
    sourceType: row.source_type || 'manual',
    sourceEventId: row.source_event_id || '',
    sourceKey: row.source_key || '',
    sourceRef: row.source_ref || '',
    calendarId: row.calendar_id || '',
    calendarName: row.calendar_name || '',
    externalLink: row.external_link || '',
    location: row.location || '',
    notes: row.notes || '',
    allDay: Boolean(row.all_day),
    createdAt: row.created_at || new Date().toISOString(),
    syncedAt: row.synced_at || null
  }
}

function mapMessageRow(row){
  return {
    id: row.id,
    author: row.author_name || 'Du',
    text: row.message || '',
    createdAt: row.created_at || new Date().toISOString(),
    threadId: row.thread_id || 'family',
    threadTitle: row.thread_title || ''
  }
}

function shoppingToRow(item, householdId, index){
  return {
    id: asText(item.id) || fallbackId('shop', index),
    household_id: householdId,
    title: asText(item.title),
    quantity: asText(item.quantity),
    note: asText(item.note || item.notes),
    category: asText(item.category),
    checked: Boolean(item.checked),
    source: asText(item.source) || 'family',
    source_ref: asText(item.sourceRef || item.source_ref),
    created_at: asIso(item.createdAt || item.created_at) || new Date().toISOString(),
    updated_at: asIso(item.updatedAt || item.updated_at)
  }
}

function taskToRow(task, householdId, index){
  return {
    id: asText(task.id) || fallbackId('task', index),
    household_id: householdId,
    title: asText(task.title),
    done: Boolean(task.done || task.checked || task.completed),
    priority: asText(task.priority) || 'normal',
    due_date: asDate(task.dueDate || task.due_date),
    person: asText(task.person || task.assignedTo || task.assigned_to),
    source: asText(task.source) || 'family',
    source_ref: asText(task.sourceRef || task.source_ref),
    notes: asText(task.notes || task.note),
    created_at: asIso(task.createdAt || task.created_at) || new Date().toISOString(),
    updated_at: asIso(task.updatedAt || task.updated_at)
  }
}

function calendarEventToRow(event, householdId, index){
  return {
    id: asText(event.id || event.sourceKey || event.source_key) || fallbackId('family-event', index),
    household_id: householdId,
    title: asText(event.title),
    event_date: asDate(event.date || event.startDate || event.start_date),
    event_time: asTime(event.time || event.startTime || event.start_time),
    end_date: asDate(event.endDate || event.end_date),
    end_time: asTime(event.endTime || event.end_time),
    person: asText(event.person || event.assignedTo || event.assigned_to),
    source: asText(event.source || event.sourceLabel || event.source_label) || 'Manuell',
    source_type: asText(event.sourceType || event.source_type) || 'manual',
    source_event_id: asText(event.sourceEventId || event.source_event_id),
    source_key: asText(event.sourceKey || event.source_key),
    source_ref: asText(event.sourceRef || event.source_ref),
    calendar_id: asText(event.calendarId || event.calendar_id),
    calendar_name: asText(event.calendarName || event.calendar_name),
    external_link: asText(event.externalLink || event.external_link),
    location: asText(event.location || event.place),
    notes: asText(event.notes || event.note),
    all_day: Boolean(event.allDay || event.all_day),
    created_at: asIso(event.createdAt || event.created_at) || new Date().toISOString(),
    synced_at: asIso(event.syncedAt || event.synced_at)
  }
}

function messageToRow(message, householdId, index){
  return {
    id: asText(message.id) || fallbackId('family-msg', index),
    household_id: householdId,
    author_name: asText(message.author || message.authorName || message.author_name) || 'Du',
    message: asText(message.text || message.message),
    thread_id: asText(message.threadId || message.thread_id) || 'family',
    thread_title: asText(message.threadTitle || message.thread_title),
    created_at: asIso(message.createdAt || message.created_at) || new Date().toISOString()
  }
}

async function fetchRows(table, householdId, orderColumn = 'created_at', ascending = true){
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('household_id', householdId)
    .order(orderColumn, { ascending })
  if(error) throw error
  return data || []
}

async function syncRows(table, householdId, rows){
  const cleanRows = rows.filter(row => row.id && (row.title === undefined || asText(row.title)) && (row.message === undefined || asText(row.message)))
  const nextIds = new Set(cleanRows.map(row => row.id))

  if(cleanRows.length){
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(cleanRows, { onConflict: 'id' })
    if(upsertError) throw upsertError
  }

  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select('id')
    .eq('household_id', householdId)
  if(existingError) throw existingError

  const removeIds = (existing || []).map(row => row.id).filter(id => !nextIds.has(id))
  if(removeIds.length){
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('household_id', householdId)
      .in('id', removeIds)
    if(deleteError) throw deleteError
  }
}

export async function fetchHouseholdData(options = {}){
  if(!supabase) return { householdId: null, household: null }
  let household = null
  if(options.householdId){
    household = await fetchHouseholdById(options.householdId)
  }
  if(!household){
    household = (await ensureDefaultHousehold()).household
  }
  if(!household?.id) throw new Error('Fant ikke familiehjemmet.')

  const [shoppingRows, taskRows, eventRows, messageRows] = await Promise.all([
    fetchRows(householdTables.shopping, household.id, 'created_at', false),
    fetchRows(householdTables.tasks, household.id, 'created_at', false),
    fetchRows(householdTables.calendarEvents, household.id, 'event_date', true),
    fetchRows(householdTables.messages, household.id, 'created_at', true)
  ])

  return {
    householdId: household.id,
    householdMeta: household,
    household: {
      shopping: shoppingRows.map(mapShoppingRow),
      tasks: taskRows.map(mapTaskRow),
      calendarEvents: eventRows.map(mapCalendarEventRow),
      messages: messageRows.map(mapMessageRow)
    }
  }
}

export async function saveHouseholdData({ householdId, household = {} }){
  if(!supabase) return { ok: false }
  if(!householdId) throw new Error('Familiehjem mangler Supabase-ID.')

  const shopping = Array.isArray(household.shopping) ? household.shopping : []
  const tasks = Array.isArray(household.tasks) ? household.tasks : []
  const calendarEvents = Array.isArray(household.calendarEvents) ? household.calendarEvents : []
  const messages = Array.isArray(household.messages) ? household.messages : []

  await Promise.all([
    syncRows(householdTables.shopping, householdId, shopping.map((item, index) => shoppingToRow(item, householdId, index))),
    syncRows(householdTables.tasks, householdId, tasks.map((task, index) => taskToRow(task, householdId, index))),
    syncRows(householdTables.calendarEvents, householdId, calendarEvents.map((event, index) => calendarEventToRow(event, householdId, index)).filter(row => row.event_date)),
    syncRows(householdTables.messages, householdId, messages.map((message, index) => messageToRow(message, householdId, index)))
  ])

  return { ok: true }
}


function mapHouseholdMemberRow(row){
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    familyMemberId: row.family_member_id || null,
    inviteId: row.invite_id || null,
    role: row.role || 'member',
    displayName: row.display_name || '',
    name: row.display_name || row.email?.split('@')[0] || 'Familiemedlem',
    email: row.email || '',
    status: row.status || 'active',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    source: 'household_members'
  }
}

export async function fetchHouseholdMembers(options = {}){
  if(!supabase) return []
  const household = options.householdId
    ? await fetchHouseholdById(options.householdId)
    : (await ensureDefaultHousehold()).household
  if(!household?.id) return []

  const { data, error } = await supabase
    .from('household_members')
    .select('id,household_id,user_id,role,display_name,email,family_member_id,invite_id,status,created_at,updated_at')
    .eq('household_id', household.id)
    .order('created_at', { ascending: true })

  if(error) throw error
  return (data || []).map(mapHouseholdMemberRow)
}

export async function deleteHouseholdMember(memberId){
  if(!supabase) throw new Error('Supabase mangler.')
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('id', memberId)
  if(error) throw error
}

export async function acceptHouseholdInvite(inviteToken){
  if(!supabase) throw new Error('Supabase mangler.')
  const token = asText(inviteToken)
  if(!token) throw new Error('Invitasjonstoken mangler.')

  const user = await currentUser()
  await ensureProfile(user)

  const { data, error } = await supabase.rpc('accept_household_invite', { invite_token: token })
  if(error) throw error
  const accepted = Array.isArray(data) ? data[0] : data
  return {
    householdId: accepted?.household_id || null,
    householdName: accepted?.household_name || 'Min familie',
    role: accepted?.role || 'member'
  }
}

export function subscribeToHouseholdData({ householdId, onChange }){
  if(!supabase || !householdId || typeof onChange !== 'function') return () => {}

  const channel = supabase.channel(`household:${householdId}`)
  Object.values(householdTables).forEach(table => {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `household_id=eq.${householdId}`
    }, payload => onChange({ table, payload }))
  })
  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
