const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function envValue(key){
  return import.meta?.env?.[key] || ''
}

export function googleCalendarConfig(){
  return {
    daysAhead: Number(envValue('VITE_GOOGLE_CALENDAR_DAYS_AHEAD') || 90)
  }
}

async function googleCalendarFetch(path, accessToken){
  if(!accessToken) throw new Error('Mangler Google access token.')
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const payload = await response.json().catch(() => ({}))
  if(!response.ok){
    const message = payload?.error?.message || payload?.error_description || `Google Calendar API svarte med ${response.status}.`
    throw new Error(message)
  }
  return payload
}

export async function fetchGoogleCalendars(accessToken){
  const payload = await googleCalendarFetch('/users/me/calendarList?minAccessRole=reader&showHidden=false', accessToken)
  return (payload.items || [])
    .filter(calendar => calendar.id && !calendar.deleted)
    .map(calendar => ({
      id: calendar.id,
      name: calendar.summaryOverride || calendar.summary || calendar.id,
      description: calendar.description || '',
      primary: Boolean(calendar.primary),
      accessRole: calendar.accessRole || 'reader',
      backgroundColor: calendar.backgroundColor || ''
    }))
}

function pad(value){
  return String(value).padStart(2, '0')
}

function localDateTimeParts(value){
  const date = new Date(value)
  if(Number.isNaN(date.getTime())) return { date: '', time: '' }
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

function stripHtml(value = ''){
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSpondLikeEvent(event, calendar){
  const haystack = [
    event.summary,
    event.description,
    event.location,
    event.organizer?.displayName,
    event.creator?.displayName,
    calendar?.name,
    calendar?.description
  ].join(' ').toLowerCase()
  return haystack.includes('spond')
}

function googleEventStart(event){
  if(event.start?.date){
    return { date: event.start.date, time: '', allDay: true }
  }
  return { ...localDateTimeParts(event.start?.dateTime), allDay: false }
}

function googleEventEnd(event){
  if(event.end?.date){
    return { date: event.end.date, time: '' }
  }
  return localDateTimeParts(event.end?.dateTime)
}

export function mapGoogleCalendarEvent(event, calendar){
  const start = googleEventStart(event)
  const end = googleEventEnd(event)
  const description = stripHtml(event.description || '')
  const location = String(event.location || '').trim()
  const source = isSpondLikeEvent(event, calendar) ? 'Spond via Google' : 'Google Kalender'
  const notes = [location, description].filter(Boolean).join(location && description ? ' · ' : '').slice(0, 240)
  const startKey = start.date || event.start?.dateTime || event.start?.date || ''

  return {
    id: `google:${calendar.id}:${event.id}:${startKey}`,
    title: event.summary || '(Uten tittel)',
    date: start.date,
    time: start.time,
    endDate: end.date,
    endTime: end.time,
    person: '',
    source,
    sourceType: 'google',
    sourceEventId: event.id,
    sourceKey: `google:${calendar.id}:${event.id}:${startKey}`,
    calendarId: calendar.id,
    calendarName: calendar.name,
    externalLink: event.htmlLink || '',
    location,
    notes,
    allDay: start.allDay,
    createdAt: new Date().toISOString(),
    syncedAt: new Date().toISOString()
  }
}

export async function fetchGoogleCalendarEvents({ accessToken, calendars, daysAhead } = {}){
  const selectedCalendars = Array.isArray(calendars) ? calendars.filter(calendar => calendar?.id) : []
  if(!selectedCalendars.length) return { events: [], errors: [] }

  const days = Number.isFinite(Number(daysAhead)) && Number(daysAhead) > 0 ? Number(daysAhead) : googleCalendarConfig().daysAhead
  const timeMin = new Date()
  timeMin.setHours(0, 0, 0, 0)
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMax.getDate() + days)

  const errors = []
  const eventGroups = await Promise.all(selectedCalendars.map(async calendar => {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '80',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString()
    })
    try{
      const payload = await googleCalendarFetch(`/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`, accessToken)
      return (payload.items || [])
        .filter(event => event.status !== 'cancelled')
        .map(event => mapGoogleCalendarEvent(event, calendar))
        .filter(event => event.date)
    }catch(error){
      errors.push(`${calendar.name}: ${error.message}`)
      return []
    }
  }))

  return { events: eventGroups.flat(), errors }
}
