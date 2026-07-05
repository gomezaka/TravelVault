import { supabase } from './supabase'

function isoToday(){
  return new Date().toISOString().slice(0, 10)
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

function dateLabel(startDate, endDate){
  if(startDate && endDate) return `${formatDate(startDate)}–${formatDate(endDate)}`
  if(startDate) return formatDate(startDate)
  return 'Dato ikke satt'
}

export function mapTripRow(row){
  const memberCount = Array.isArray(row.trip_members) ? row.trip_members.length : Number(row.member_count || 1)
  return {
    id: row.id,
    title: row.title,
    type: row.trip_type,
    date: dateLabel(row.start_date, row.end_date),
    location: row.main_location || 'Ukjent sted',
    members: memberCount || 1,
    status: statusForTrip(row.start_date, row.end_date),
    next: 'Legg til første hendelse',
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description || '',
    source: 'supabase'
  }
}

export async function fetchTripsForUser(){
  if(!supabase) return []
  const { data, error } = await supabase
    .from('trips')
    .select('id,title,trip_type,start_date,end_date,main_location,description,owner_id,created_at,trip_members(id)')
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if(error) throw error
  return (data || []).map(mapTripRow)
}

export async function fetchMembersForTrip(tripId){
  if(!supabase) return []
  const { data, error } = await supabase
    .from('trip_members')
    .select('id,display_name,role,status,user_id,created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if(error) throw error
  return (data || []).map(member => ({
    id: member.id,
    userId: member.user_id,
    name: member.display_name,
    role: member.role === 'owner' ? 'Eier' : member.role === 'admin' ? 'Admin' : member.role === 'viewer' ? 'Lesetilgang/barn' : 'Deltaker',
    status: member.status
  }))
}

export async function createTripWithMembers({ create, session }){
  if(!supabase || !session?.user) throw new Error('Supabase-innlogging mangler.')

  const title = create.title?.trim() || 'Ny tur'
  const ownerName = create.participants?.[0]?.trim() || session.user.email?.split('@')[0] || 'Eier'
  const participantNames = (create.participants || [])
    .map(name => name.trim())
    .filter(Boolean)

  const uniqueNames = [...new Set([ownerName, ...participantNames])]

  const { data: tripRow, error: tripError } = await supabase
    .from('trips')
    .insert({
      title,
      trip_type: create.type || 'family',
      start_date: create.start || null,
      end_date: create.end || null,
      main_location: create.location?.trim() || null,
      description: create.description?.trim() || null,
      owner_id: session.user.id
    })
    .select('id,title,trip_type,start_date,end_date,main_location,description,owner_id,created_at')
    .single()

  if(tripError) throw tripError

  const memberRows = uniqueNames.map((name, index) => ({
    trip_id: tripRow.id,
    user_id: index === 0 ? session.user.id : null,
    display_name: name,
    role: index === 0 ? 'owner' : 'participant',
    status: 'active'
  }))

  const { error: memberError } = await supabase
    .from('trip_members')
    .insert(memberRows)

  if(memberError) throw memberError

  const members = await fetchMembersForTrip(tripRow.id)
  return { trip: { ...mapTripRow({ ...tripRow, trip_members: members }), members: members.length }, members }
}
