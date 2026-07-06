import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, Camera, ChevronLeft, FileText, Home, ListChecks, MoreHorizontal, PiggyBank, Plus, Settings, Trophy, Users, MapPin, Plane, Hotel, Ship, Utensils } from 'lucide-react'
import { supabase } from './lib/supabase'
import { createTripWithMembers, fetchMembersForTrip, fetchTripsForUser } from './lib/tripRepository'
import './styles/app.css'

const iconMap = { transport: Ship, hotel: Hotel, match: Trophy, food: Utensils, activity: MapPin, flight: Plane }
const tabs = [
  ['na', Home, 'Nå'],
  ['plan', CalendarDays, 'Plan'],
  ['pakk', ListChecks, 'Pakk'],
  ['utlegg', PiggyBank, 'Utlegg'],
  ['mer', MoreHorizontal, 'Mer']
]
const categories = ['Dokumenter', 'Klær', 'Hygiene', 'Elektronikk', 'Mat/snacks', 'Sport/cup', 'Barn', 'Diverse']
const emptyTripContent = { members: [], events: [], packing: [], expenses: [], matches: [] }
const authLockedForTesting = true
const authEnabled = !authLockedForTesting && import.meta.env.VITE_ENABLE_AUTH === 'true'
const googleAuthEnabled = !authLockedForTesting && import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'
const testStateKey = 'travelvault-test-state-v1'
const legacyDemoTripIds = new Set(['danmark-cup-2027', 'italia-2027', 'sverige-2025'])
const legacyDemoTripTitles = new Set(['Danmark Cup 2027', 'Italia sommerferie', 'Sverige høsttur 2025'])

function formatMoney(n){ return `${Math.round(n).toLocaleString('nb-NO')} kr` }
function initials(name){ return (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() }
function ownerDisplayName(session){
  return session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Deg'
}
function createTripDraft(session){
  return { step: 1, type: 'cup', title: '', start: '', end: '', location: '', description: '', participants: [ownerDisplayName(session)] }
}
function emptyTripDetails(members = []){
  return { members, events: [], packing: [], expenses: [], matches: [], documents: [], photos: [] }
}
function loadTestState(){
  try{
    const parsed = JSON.parse(window.localStorage.getItem(testStateKey) || '{}')
    const trips = Array.isArray(parsed.trips)
      ? parsed.trips.filter(trip => !legacyDemoTripIds.has(trip.id) && !legacyDemoTripTitles.has(trip.title))
      : []
    const detailsByTrip = parsed.detailsByTrip && typeof parsed.detailsByTrip === 'object'
      ? Object.fromEntries(Object.entries(parsed.detailsByTrip).filter(([tripId]) => !legacyDemoTripIds.has(tripId)))
      : {}
    return {
      trips,
      detailsByTrip
    }
  }catch{
    return { trips: [], detailsByTrip: {} }
  }
}
function saveTestState(trips, detailsByTrip){
  window.localStorage.setItem(testStateKey, JSON.stringify({ trips, detailsByTrip }))
}
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
  if(startDate && endDate) return `${formatDate(startDate)}-${formatDate(endDate)}`
  if(startDate) return formatDate(startDate)
  return 'Dato ikke satt'
}
function createLocalTripWithMembers(create){
  const tripId = `local-${Date.now()}`
  const participantNames = [...new Set((create.participants || []).map(name => name.trim()).filter(Boolean))]
  const members = (participantNames.length ? participantNames : ['Deg']).map((name, index) => ({
    id: `${tripId}-member-${index}`,
    name,
    role: index === 0 ? 'Eier' : 'Deltaker',
    status: 'active'
  }))
  const trip = {
    id: tripId,
    title: create.title?.trim() || 'Ny tur',
    type: create.type || 'family',
    date: dateLabel(create.start, create.end),
    location: create.location?.trim() || 'Ukjent sted',
    members: members.length,
    status: statusForTrip(create.start, create.end),
    next: 'Legg til første hendelse',
    startDate: create.start || null,
    endDate: create.end || null,
    description: create.description?.trim() || '',
    source: 'local',
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    localMembers: members
  }
  return { trip, members }
}

function computeSettlements(expenses, members){
  const balances = Object.fromEntries(members.map(m => [m.id, 0]))
  expenses.forEach(expense => {
    if(!expense.participants?.length || !balances.hasOwnProperty(expense.paidBy)) return
    const share = expense.amount / expense.participants.length
    balances[expense.paidBy] += expense.amount
    expense.participants.forEach(id => { if(balances.hasOwnProperty(id)) balances[id] -= share })
  })

  const creditors = Object.entries(balances).filter(([, value]) => value > 0.5).map(([id, amount]) => ({ id, amount }))
  const debtors = Object.entries(balances).filter(([, value]) => value < -0.5).map(([id, amount]) => ({ id, amount: -amount }))
  const rows = []
  let i = 0
  let j = 0

  while(i < debtors.length && j < creditors.length){
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    rows.push({ from: debtors[i].id, to: creditors[j].id, amount })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if(debtors[i].amount < 0.5) i++
    if(creditors[j].amount < 0.5) j++
  }
  return rows
}

function RootRouter(){
  const path = window.location.pathname.replace(/\/$/, '')
  if(path === '/privacy') return <PolicyPage type="privacy" />
  if(path === '/terms') return <PolicyPage type="terms" />
  return authEnabled ? <AuthGate /> : <App testMode />
}

function AuthGate(){
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if(!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function ensureProfile(){
      if(!supabase || !session?.user) return
      await supabase.from('profiles').upsert({
        id: session.user.id,
        display_name: session.user.email?.split('@')[0] || 'Travelvault-bruker'
      }, { onConflict: 'id' })
    }
    ensureProfile()
  }, [session])

  const signIn = async () => {
    setAuthError('')
    setMessage('')
    if(!email.includes('@')){
      setAuthError('Skriv inn en gyldig e-postadresse.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    if(error){
      setAuthError(error.message)
      return
    }
    setMessage('Sjekk e-posten din for innloggingslenke.')
  }

  const signInWithGoogle = async () => {
    setAuthError('')
    setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if(error){
      const missingSecret = error.message?.toLowerCase().includes('oauth secret')
      setAuthError(missingSecret ? 'Google-innlogging mangler OAuth secret i Supabase. Bruk e-postlenke, eller legg inn Google Client ID og Client Secret i Supabase Auth.' : error.message)
    }
  }

  if(!supabase) return <MissingSupabaseConfig />

  if(loading){
    return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Laster innlogging …</p></div></section></main></div>
  }

  if(!session){
    return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted.</p>{googleAuthEnabled && <><button className="googleBtn" onClick={signInWithGoogle} type="button"><span>G</span>Fortsett med Google</button><div className="authDivider"><span></span><b>eller</b><span></span></div></>}<label className="field"><span>E-post</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="navn@epost.no"/></label>{authError && <div className="authMsg error">{authError}</div>}{message && <div className="authMsg ok">{message}</div>}<button className="primary" onClick={signIn}>Logg inn med e-postlenke</button><small>{googleAuthEnabled ? 'Du kan logge inn med Google eller e-postlenke. Google OAuth må være aktivert i Supabase Auth.' : 'Google-innlogging er skjult til OAuth er konfigurert i Supabase. Bruk e-postlenke for testing nå.'}</small><div className="policyLinks"><a href="/privacy">Personvern</a><a href="/terms">Vilkår</a></div></div></section></main></div>
  }

  return <App session={session} />
}

function MissingSupabaseConfig(){
  return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Supabase mangler i miljøoppsettet.</p><div className="authMsg error">Legg inn VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY i .env.local for å teste med ekte brukere og lagring.</div><small>Appen starter nå uten falske turer eller forhåndsutfylte data.</small></div></section></main></div>
}

function PolicyPage({ type }){
  const isPrivacy = type === 'privacy'
  const title = isPrivacy ? 'Personvernerklæring' : 'Vilkår for bruk'

  useEffect(() => {
    document.title = `${title} | Travelvault`
  }, [title])

  return <div className="page policyPage"><main className="policyShell"><header className="policyHero"><a href="/" className="policyBrand"><img src="/logo-mark.png" alt="Travelvault"/><span>Travelvault</span></a><p>En Notools-app</p><h1>{title}</h1><small>Sist oppdatert: 5. juli 2026</small></header>{isPrivacy ? <PrivacyPolicy/> : <TermsPolicy/>}<footer className="policyFooter"><a href="/">Til Travelvault</a><a href="/privacy">Personvern</a><a href="/terms">Vilkår</a><span>Notools, notools.no</span></footer></main></div>
}

function PrivacyPolicy(){
  return <article className="policyContent">
    <section><h2>Hvem vi er</h2><p>Travelvault er en app fra Notools for å samle reiseplaner, pakkelister, deltakere, utlegg, dokumenter og bilder knyttet til en tur. Denne personvernerklæringen forklarer hvordan Travelvault behandler personopplysninger.</p></section>
    <section><h2>Opplysninger vi behandler</h2><p>Når du bruker Travelvault kan vi behandle e-postadresse, navn eller visningsnavn, turinformasjon, deltakere, pakkelister, planpunkter, utlegg, dokumenter, bilder og teknisk informasjon som er nødvendig for innlogging, sikkerhet og drift.</p></section>
    <section><h2>Innlogging</h2><p>Travelvault kan bruke Supabase Auth og Google OAuth for innlogging. Ved Google-innlogging mottar appen grunnleggende profilinformasjon som Google deler, normalt e-postadresse, navn og unik bruker-ID. Client ID og hemmelige nøkler lagres ikke i nettleseren.</p></section>
    <section><h2>Formål</h2><p>Opplysningene brukes til å opprette og vise turer, gi tilgang til riktige deltakere, lagre innhold du legger inn, håndtere innlogging og beskytte kontoen og tjenesten mot misbruk.</p></section>
    <section><h2>Lagring og databehandlere</h2><p>Data kan lagres hos Supabase og andre leverandører som brukes til hosting, autentisering og drift. Vi bruker leverandører kun for å levere Travelvault og relaterte Notools-tjenester.</p></section>
    <section><h2>Deling</h2><p>Vi selger ikke personopplysninger. Turinnhold deles bare med brukere som har tilgang til samme tur, eller når det er nødvendig for drift, sikkerhet, lovpålagte krav eller med ditt samtykke.</p></section>
    <section><h2>Dine rettigheter</h2><p>Du kan be om innsyn, retting eller sletting av personopplysninger som gjelder deg. Du kan også be om begrensning av behandling eller protestere der loven gir deg rett til det.</p></section>
    <section><h2>Kontakt</h2><p>Kontakt Notools dersom du har spørsmål om personvern eller ønsker å bruke rettighetene dine. Bruk kontaktinformasjonen som er oppgitt på notools.no.</p></section>
  </article>
}

function TermsPolicy(){
  return <article className="policyContent">
    <section><h2>Om tjenesten</h2><p>Travelvault er en Notools-app som hjelper brukere med å organisere turer, deltakere, pakkelister, utlegg, dokumenter og bilder. Ved å bruke Travelvault godtar du disse vilkårene.</p></section>
    <section><h2>Brukerkonto</h2><p>Du er ansvarlig for at kontoen din brukes på en trygg måte, og for at informasjonen du legger inn er riktig og lovlig. Ikke del tilgang med personer som ikke skal ha innsyn i turen.</p></section>
    <section><h2>Innhold</h2><p>Du beholder rettighetene til innholdet du legger inn. Du gir Travelvault rett til å lagre, vise og behandle innholdet så langt det er nødvendig for å levere tjenesten.</p></section>
    <section><h2>Akseptabel bruk</h2><p>Du skal ikke bruke Travelvault til ulovlig innhold, misbruk av andres personopplysninger, forsøk på å omgå sikkerhet, spam eller handlinger som kan skade tjenesten eller andre brukere.</p></section>
    <section><h2>Tilgjengelighet og endringer</h2><p>Travelvault kan endres, forbedres eller være midlertidig utilgjengelig. Vi forsøker å holde tjenesten stabil, men garanterer ikke feilfri eller uavbrutt drift.</p></section>
    <section><h2>Ansvar</h2><p>Travelvault er et planleggingsverktøy. Du er selv ansvarlig for å kontrollere reisedokumenter, tider, betalinger, bookinger og annen informasjon som er viktig for reisen.</p></section>
    <section><h2>Oppsigelse</h2><p>Du kan slutte å bruke tjenesten når som helst. Tilgang kan begrenses eller fjernes ved brudd på vilkårene eller dersom det er nødvendig for sikkerhet eller drift.</p></section>
    <section><h2>Kontakt</h2><p>Spørsmål om vilkårene kan rettes til Notools via kontaktinformasjonen på notools.no.</p></section>
  </article>
}

function App({ session, testMode = false }){
  const supabaseMode = Boolean(!testMode && supabase && session)
  const [storedTestState] = useState(() => testMode ? loadTestState() : { trips: [], detailsByTrip: {} })
  const [view, setView] = useState('trips')
  const [trips, setTrips] = useState(() => testMode ? storedTestState.trips : [])
  const [detailsByTrip, setDetailsByTrip] = useState(() => testMode ? storedTestState.detailsByTrip : {})
  const [tripsLoading, setTripsLoading] = useState(supabaseMode)
  const [tripsError, setTripsError] = useState('')
  const [activeTrip, setActiveTrip] = useState(null)
  const [tab, setTab] = useState('na')
  const [mer, setMer] = useState('list')
  const [older, setOlder] = useState(false)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [packing, setPacking] = useState([])
  const [expenses, setExpenses] = useState([])
  const [matches, setMatches] = useState([])
  const [documents, setDocuments] = useState([])
  const [photos, setPhotos] = useState([])
  const [savingCreate, setSavingCreate] = useState(false)
  const [create, setCreate] = useState(() => createTripDraft(session))

  const loadTrips = useCallback(async () => {
    if(!supabaseMode) return
    setTripsLoading(true)
    setTripsError('')
    try{
      const rows = await fetchTripsForUser()
      setTrips(rows)
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å hente turer fra Supabase.')
    }finally{
      setTripsLoading(false)
    }
  }, [supabaseMode])

  useEffect(() => { loadTrips() }, [loadTrips])

  useEffect(() => {
    if(testMode) saveTestState(trips, detailsByTrip)
  }, [testMode, trips, detailsByTrip])

  useEffect(() => {
    if(!testMode || !activeTrip) return
    setDetailsByTrip(current => ({
      ...current,
      [activeTrip.id]: { members, events, packing, expenses, matches, documents, photos }
    }))
  }, [testMode, activeTrip, members, events, packing, expenses, matches, documents, photos])

  useEffect(() => {
    if(!testMode || !activeTrip) return
    const nextEvent = events[0]
    const nextMatch = matches[0]
    const next = nextEvent ? `${nextEvent.title}${nextEvent.time && nextEvent.time !== 'Ikke satt' ? ` kl. ${nextEvent.time}` : ''}` : nextMatch ? `Kamp mot ${nextMatch.opponent}${nextMatch.start ? ` kl. ${nextMatch.start}` : ''}` : 'Legg til første hendelse'
    const memberCount = Math.max(1, members.length)
    setActiveTrip(current => current && current.id === activeTrip.id ? { ...current, members: memberCount, next } : current)
    setTrips(current => current.map(trip => trip.id === activeTrip.id ? { ...trip, members: memberCount, next } : trip))
  }, [testMode, activeTrip?.id, members, events, matches])

  const resetContentForTrip = () => {
    setMembers(emptyTripContent.members)
    setEvents(emptyTripContent.events)
    setPacking(emptyTripContent.packing)
    setExpenses(emptyTripContent.expenses)
    setMatches(emptyTripContent.matches)
    setDocuments([])
    setPhotos([])
  }

  const openTrip = async (trip) => {
    setActiveTrip(trip)
    setView('trip')
    setTab('na')
    setMer('list')

    resetContentForTrip()
    if(!supabaseMode || trip.source === 'local'){
      const details = detailsByTrip[trip.id] || emptyTripDetails(trip.localMembers || [])
      setMembers(details.members || [])
      setEvents(details.events || [])
      setPacking(details.packing || [])
      setExpenses(details.expenses || [])
      setMatches(details.matches || [])
      setDocuments(details.documents || [])
      setPhotos(details.photos || [])
      return
    }

    try{
      const tripMembers = await fetchMembersForTrip(trip.id)
      setMembers(tripMembers)
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å hente deltakere.')
    }
  }

  const finishCreate = async () => {
    setSavingCreate(true)
    setTripsError('')

    if(!supabaseMode){
      const { trip, members: createdMembers } = createLocalTripWithMembers(create)
      const details = emptyTripDetails(createdMembers)
      setTrips(current => [trip, ...current.filter(item => item.id !== trip.id)])
      setDetailsByTrip(current => ({ ...current, [trip.id]: details }))
      setActiveTrip(trip)
      setMembers(createdMembers)
      setEvents([])
      setPacking([])
      setExpenses([])
      setMatches([])
      setDocuments([])
      setPhotos([])
      setView('trip')
      setTab('na')
      setMer('list')
      setCreate(createTripDraft(session))
      setSavingCreate(false)
      return
    }

    try{
      const { trip, members: createdMembers } = await createTripWithMembers({ create, session })
      setTrips(current => [trip, ...current.filter(item => item.id !== trip.id)])
      setActiveTrip(trip)
      setMembers(createdMembers)
      setEvents([])
      setPacking([])
      setExpenses([])
      setMatches([])
      setDocuments([])
      setPhotos([])
      setView('trip')
      setTab('na')
      setMer('list')
      setCreate(createTripDraft(session))
      await loadTrips()
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å lagre turen.')
    }finally{
      setSavingCreate(false)
    }
  }

  const joinByInviteCode = (code) => {
    const normalized = code.trim().toUpperCase()
    if(!normalized) return { ok: false, message: 'Skriv inn en invitasjonskode.' }
    const trip = trips.find(item => item.inviteCode === normalized)
    if(!trip) return { ok: false, message: 'Fant ingen lokal testtur med den koden.' }
    openTrip(trip)
    return { ok: true }
  }

  const deleteActiveTrip = () => {
    if(!activeTrip) return
    const nextTripId = activeTrip.id
    setTrips(current => current.filter(trip => trip.id !== nextTripId))
    setDetailsByTrip(current => {
      const next = { ...current }
      delete next[nextTripId]
      return next
    })
    setActiveTrip(null)
    setView('trips')
    setTab('na')
    setMer('list')
  }

  return <div className="page"><main className="phone">
    {view === 'trips' && <TripsView older={older} setOlder={setOlder} openTrip={openTrip} setView={setView} trips={trips} loading={tripsLoading} error={tripsError} testMode={testMode} showSignOut={supabaseMode} onJoinByCode={joinByInviteCode}/>} 
    {view === 'create' && <CreateTrip create={create} setCreate={setCreate} setView={setView} finishCreate={finishCreate} saving={savingCreate} error={tripsError}/>} 
    {view === 'trip' && activeTrip && <TripShell trip={activeTrip} setView={setView} tab={tab} setTab={setTab} mer={mer} setMer={setMer} members={members} setMembers={setMembers} events={events} setEvents={setEvents} packing={packing} setPacking={setPacking} expenses={expenses} setExpenses={setExpenses} matches={matches} setMatches={setMatches} documents={documents} setDocuments={setDocuments} photos={photos} setPhotos={setPhotos} deleteTrip={deleteActiveTrip}/>} 
  </main></div>
}

function TripsView({ older, setOlder, openTrip, setView, trips, loading, error, testMode, showSignOut, onJoinByCode }){
  const [joining, setJoining] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const ongoing = trips.filter(t => t.status === 'Pågår')
  const upcoming = trips.filter(t => t.status === 'Kommende')
  const previous = trips.filter(t => t.status === 'Tidligere')
  const hasTrips = trips.length > 0
  const join = () => {
    const result = onJoinByCode(joinCode)
    if(result?.ok){
      setJoinError('')
      setJoinCode('')
      setJoining(false)
      return
    }
    setJoinError(result?.message || 'Klarte ikke å bruke invitasjonskoden.')
  }

  const emptyText = testMode ? 'Opprett første tur for å teste flyten lokalt. Ingenting krever innlogging akkurat nå.' : 'Opprett første tur, så lagres den i Supabase og vises her neste gang du logger inn.'

  return <section className="screen with-actions"><header className="appHeader"><div className="brandRow"><img src="/logo-mark.png" alt="Travelvault"/><div><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted</p></div></div>{showSignOut && <button className="signOutBtn" onClick={() => supabase.auth.signOut()}>Logg ut</button>}</header><div className="content gap-xl">
    {error && <div className="authMsg error">{error}</div>}
    {joinError && <div className="authMsg error">{joinError}</div>}
    {joining && <div className="inlineForm"><input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Invitasjonskode"/><div><button onClick={() => setJoining(false)} type="button">Avbryt</button><button onClick={join} type="button">Bli med</button></div></div>}
    {loading && <Empty title="Henter turer" text="Laster dine Travelvault-turer fra Supabase." />}
    {!loading && !hasTrips && <Empty title="Ingen turer ennå" text={emptyText} action="Opprett ny tur" onAction={() => setView('create')} />}
    {!!ongoing.length && <TripSection title="Pågående" trips={ongoing} openTrip={openTrip}/>} 
    {!!upcoming.length && <TripSection title="Kommende" trips={upcoming} openTrip={openTrip}/>} 
    {!!previous.length && <div><button className="sectionToggle" onClick={() => setOlder(!older)}><span>Tidligere turer</span><b>{older ? 'Skjul' : 'Vis'}</b></button>{older && previous.map(trip => <TripCard key={trip.id} trip={trip} muted openTrip={openTrip}/>)}</div>}
  </div><div className="bottomActions"><button className="primary withIcon" onClick={() => setView('create')}><Plus size={18}/>Opprett ny tur</button><button className="secondary withIcon" type="button" onClick={() => setJoining(true)}><Users size={18}/>Bli med via invitasjonskode</button></div></section>
}

function TripSection({ title, trips, openTrip }){
  return <div><h2 className="sectionTitle">{title}</h2>{trips.map(trip => <TripCard key={trip.id} trip={trip} openTrip={openTrip}/>)}</div>
}

function TripCard({ trip, muted, openTrip }){
  return <button className={`tripCard ${muted ? 'muted' : ''}`} onClick={() => openTrip(trip)}>{trip.status === 'Pågår' && <span className="badge green">Pågår</span>}<h3>{trip.title}</h3><p>{trip.date} · {trip.location} · {trip.members} deltakere</p><div className={`nextPill ${trip.status === 'Pågår' ? 'green' : 'blue'}`}><span></span>{trip.next}</div></button>
}

function CreateTrip({ create, setCreate, setView, finishCreate, saving, error }){
  const next = () => create.step === 4 ? finishCreate() : setCreate({ ...create, step: create.step + 1 })
  const back = () => create.step === 1 ? setView('trips') : setCreate({ ...create, step: create.step - 1 })

  return <section className="screen with-actions"><TopLine title="Opprett ny tur" onBack={back}/><div className="progress">{[1, 2, 3, 4].map(step => <span key={step} className={step <= create.step ? 'active' : ''}/>)}</div><div className="content">
    {error && <div className="authMsg error">{error}</div>}
    {create.step === 1 && <TripTypeStep create={create} setCreate={setCreate}/>}
    {create.step === 2 && <><h2>Grunninfo</h2><Field label="Navn på tur" value={create.title} onChange={title => setCreate({ ...create, title })} placeholder="F.eks. Sommerferie 2027"/><div className="two"><Field label="Startdato" type="date" value={create.start} onChange={start => setCreate({ ...create, start })}/><Field label="Sluttdato" type="date" value={create.end} onChange={end => setCreate({ ...create, end })}/></div><Field label="Hovedsted" value={create.location} onChange={location => setCreate({ ...create, location })} placeholder="F.eks. København"/><label className="field"><span>Beskrivelse</span><textarea value={create.description} onChange={e => setCreate({ ...create, description: e.target.value })}/></label></>}
    {create.step === 3 && <ParticipantsDraft create={create} setCreate={setCreate}/>} 
    {create.step === 4 && <><h2>Startinnhold</h2>{['Opprett pakkeliste', 'Legg til dokumenter', 'Legg til første planpunkt', 'Aktiver utlegg', 'Aktiver cupkamper'].map((label, index) => <div className="toggleRow" key={label}><span>{label}</span><b className={index < 4 || create.type === 'cup' ? 'on' : ''}></b></div>)}</>}
  </div><div className="bottomActions row"><button className="secondary" onClick={back} disabled={saving}>Tilbake</button><button className="primary" onClick={next} disabled={saving}>{saving ? 'Lagrer …' : create.step === 4 ? 'Opprett tur' : 'Neste'}</button></div></section>
}

function ParticipantsDraft({ create, setCreate }){
  const [name, setName] = useState('')
  const add = () => {
    if(name.trim()){
      setCreate({ ...create, participants: [...create.participants, name.trim()] })
      setName('')
    }
  }
  return <><h2>Deltakere</h2><p className="lead">Første deltaker blir eier av turen. Flere kan inviteres senere.</p><div className="memberList">{create.participants.map((participant, index) => <div key={`${participant}-${index}`}><Avatar name={participant}/><span>{participant}</span><b>{index === 0 ? 'Eier' : 'Deltaker'}</b></div>)}</div><div className="inlineForm"><input value={name} onChange={e => setName(e.target.value)} placeholder="Navn på deltaker"/><button onClick={add} type="button">Legg til deltaker</button></div></>
}

function TripTypeStep({ create, setCreate }){
  const types = [
    ['family', Home, 'Familietur'],
    ['friends', Users, 'Vennetur'],
    ['cup', Trophy, 'Cup/idrettstur'],
    ['work', Settings, 'Jobbtur'],
    ['other', MapPin, 'Annet']
  ]
  return <><h2>Hva slags tur?</h2><p className="lead">Dette styrer hvilke faner turen får</p>{types.map(([id, Icon, label]) => <button key={id} onClick={() => setCreate({ ...create, type: id })} className={`choice ${create.type === id ? 'selected' : ''}`}><span className="choiceLabel"><Icon size={18}/>{label}</span><span>{create.type === id ? '✓' : ''}</span></button>)}</>
}

function Field({ label, value, onChange, placeholder, type = 'text' }){
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>
}

function TopLine({ title, trip, onBack }){
  return <header className="topLine"><button onClick={onBack}><ChevronLeft size={20}/></button><div><h1>{title}</h1>{trip && <p>{trip.date} · {trip.members} deltakere</p>}</div></header>
}

function TripShell(props){
  const { trip, setView, tab, setTab, mer, setMer } = props
  return <section className="screen"><TopLine title={trip.title} trip={trip} onBack={() => setView('trips')}/><div className="content">
    {tab === 'na' && <NowView {...props}/>} 
    {tab === 'plan' && <PlanView events={props.events} setEvents={props.setEvents}/>} 
    {tab === 'pakk' && <PackingView members={props.members} packing={props.packing} setPacking={props.setPacking}/>} 
    {tab === 'utlegg' && <ExpensesView members={props.members} expenses={props.expenses} setExpenses={props.setExpenses}/>} 
    {tab === 'mer' && <MoreView {...props} mer={mer} setMer={setMer}/>} 
  </div><nav className="tabbar">{tabs.map(([id, Icon, label]) => <button key={id} onClick={() => { setTab(id); setMer('list') }} className={tab === id ? 'active' : ''}><Icon size={20}/><span>{label}</span></button>)}</nav></section>
}

function NowView({ trip, events, packing, expenses, matches, setTab, setMer }){
  const nextEvent = events[0]
  const nextMatch = matches[0]
  const nextTitle = nextEvent?.title || (trip.type === 'cup' ? 'Legg inn første kamp' : 'Legg inn første planpunkt')
  const nextTime = nextEvent?.time || 'Ikke satt'
  const nextPlace = nextEvent?.place || trip.location

  const openMap = () => {
    if(nextPlace && nextPlace !== 'Ukjent sted') window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextPlace)}`, '_blank', 'noopener,noreferrer')
  }

  return <><div className="hero"><small>Neste nå</small><h2>{nextTitle}</h2><div className="stats"><div><b>{nextTime}</b><span>Tidspunkt</span></div><div><b>{nextMatch?.meetup || 'Ikke satt'}</b><span>Oppmøte</span></div><div><b>{nextPlace}</b><span>Sted</span></div></div><p>{nextEvent?.note || 'Start med å legge inn plan, dokumenter, pakkeliste og utlegg for turen.'}</p><div className="heroBtns"><button onClick={() => setTab('plan')} type="button">Vis detaljer</button><button onClick={openMap} type="button">Åpne kart</button></div></div><h2 className="sectionTitle">Viktige varsler</h2><div className="alerts"><Alert color="yellow" text={`${packing.filter(item => !item.packed).length} pakkepunkter mangler`}/><Alert color="blue" text={`${expenses.length} utlegg er registrert`}/><Alert color="red" text="Dokumenter og bilder kan legges inn under Mer"/></div><h2 className="sectionTitle">Dagens oversikt</h2><div className="timeline">{events.slice(0, 4).map(event => <div key={event.id}><b>{event.time}</b><span>{event.title}</span></div>)}{!events.length && <p>Ingen hendelser lagt inn ennå.</p>}</div></>
}

function Alert({ color, text }){
  return <div className={`alert ${color}`}><span></span>{text}</div>
}

function PlanView({ events, setEvents }){
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const days = [...new Set(events.map(event => event.day))]
  return <>{!events.length && <Empty title="Ingen planpunkter" text="Legg inn fly, hotell, aktivitet eller oppmøte." action="Legg til planpunkt" onAction={() => setAdding(true)}/>} {days.map(day => <div key={day}><h2 className="dayTitle">{day}</h2>{events.filter(event => event.day === day).map(event => <EventCard key={event.id} event={event} events={events} setEvents={setEvents} open={open === event.id} onClick={() => setOpen(open === event.id ? null : event.id)}/>)}</div>)}{!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til planpunkt</button>}{adding && <AddEvent events={events} setEvents={setEvents} close={() => setAdding(false)}/>}</>
}

function AddEvent({ events, setEvents, close }){
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [type, setType] = useState('activity')
  const [note, setNote] = useState('')
  const add = () => {
    if(!title.trim()) return
    setEvents([...events, {
      id: `event-${Date.now()}`,
      day: date ? formatDate(date) : 'Uten dato',
      time: time || 'Ikke satt',
      title: title.trim(),
      place: place.trim() || 'Ikke satt',
      type,
      status: 'Planlagt',
      note: note.trim() || 'Ingen notat.',
      document: null
    }])
    close()
  }
  return <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tittel"/><div><input type="date" value={date} onChange={e => setDate(e.target.value)}/><input type="time" value={time} onChange={e => setTime(e.target.value)}/></div><input value={place} onChange={e => setPlace(e.target.value)} placeholder="Sted"/><select value={type} onChange={e => setType(e.target.value)}><option value="activity">Aktivitet</option><option value="flight">Fly</option><option value="transport">Transport</option><option value="hotel">Hotell</option><option value="match">Kamp</option><option value="food">Mat</option></select><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Notat"/><div><button onClick={close}>Avbryt</button><button onClick={add}>Legg til</button></div></div>
}

function EventCard({ event, events, setEvents, open, onClick }){
  const Icon = iconMap[event.type] || CalendarDays
  const edit = (clickEvent) => {
    clickEvent.stopPropagation()
    const nextTitle = window.prompt('Tittel', event.title)
    if(nextTitle === null || !nextTitle.trim()) return
    const nextPlace = window.prompt('Sted', event.place) ?? event.place
    const nextNote = window.prompt('Notat', event.note) ?? event.note
    setEvents(events.map(row => row.id === event.id ? { ...row, title: nextTitle.trim(), place: nextPlace.trim() || 'Ikke satt', note: nextNote.trim() || 'Ingen notat.' } : row))
  }
  const openMap = (clickEvent) => {
    clickEvent.stopPropagation()
    if(event.place && event.place !== 'Ikke satt') window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.place)}`, '_blank', 'noopener,noreferrer')
  }
  return <div className="eventCard" onClick={onClick} role="button" tabIndex={0} onKeyDown={keyEvent => { if(keyEvent.key === 'Enter' || keyEvent.key === ' ') onClick() }}><div className="eventTop"><span className="iconTile"><Icon size={18}/></span><div><h3>{event.title}</h3><p>{event.time} · {event.place}</p></div><b className="status">{event.status}</b></div>{open && <div className="eventDetails"><p>{event.note}</p>{event.document && <small>Dokument: {event.document}</small>}<div><button onClick={edit} type="button">Rediger</button><button onClick={openMap} type="button">Åpne kart</button></div></div>}</div>
}

function PackingView({ members, packing, setPacking }){
  const [filter, setFilter] = useState('Alle')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [assignedTo, setAssignedTo] = useState('')
  const [mustBuy, setMustBuy] = useState(false)
  const visible = packing.filter(item => filter === 'Alle' || (filter === 'Mangler' && !item.packed) || (filter === 'Pakket' && item.packed) || (filter === 'Må kjøpes' && item.mustBuy))
  const add = () => {
    if(title.trim()){
      setPacking([...packing, { id: `p${Date.now()}`, title, category, assignedTo: assignedTo || null, packed: false, mustBuy }])
      setTitle('')
      setAssignedTo('')
      setMustBuy(false)
      setAdding(false)
    }
  }
  const addStd = () => {
    const names = ['Drakt', 'Shorts', 'Strømper', 'Leggskinn', 'Fotballsko', 'Vannflaske', 'Håndkle', 'Sitteunderlag', 'Regntøy', 'Powerbank']
    const existing = new Set(packing.map(item => item.title))
    setPacking([...packing, ...names.filter(name => !existing.has(name)).map((name, index) => ({ id: `std-${Date.now()}-${index}`, title: name, category: 'Sport/cup', assignedTo: null, packed: false, mustBuy: false }))])
  }

  return <><div className="chips">{['Alle', 'Mangler', 'Pakket', 'Må kjøpes'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{!packing.length && <Empty title="Pakkelisten er tom" text="Legg til det dere må huske, eller start med en standardliste." action="Bruk standardliste" onAction={addStd}/>} {packing.length > 0 && <><h2 className="sectionTitle">Felles pakkeliste</h2>{visible.filter(item => !item.assignedTo).map(item => <PackRow key={item.id} item={item} setPacking={setPacking} packing={packing}/>) }{members.map(member => { const rows = visible.filter(item => item.assignedTo === member.id); return rows.length ? <div key={member.id}><h2 className="sectionTitle">{member.name}</h2>{rows.map(item => <PackRow key={item.id} item={item} setPacking={setPacking} packing={packing}/>)}</div> : null })}</>}{!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til punkt</button>}{adding && <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hva må pakkes?"/><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}><option value="">Felles pakkeliste</option>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select><label className="checkRow"><input type="checkbox" checked={mustBuy} onChange={e => setMustBuy(e.target.checked)}/><span>Må kjøpes</span></label><div><button onClick={() => setAdding(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>
}

function PackRow({ item, packing, setPacking }){
  return <div className="packRow"><button className={`checkButton ${item.packed ? 'checked' : ''}`} onClick={() => setPacking(packing.map(row => row.id === item.id ? { ...row, packed: !row.packed } : row))} type="button">{item.packed ? '✓' : ''}</button><div><b className={item.packed ? 'done' : ''}>{item.title}</b><small>{item.category}</small></div>{item.mustBuy && <em>Må kjøpes</em>}<button className="rowAction" onClick={() => setPacking(packing.filter(row => row.id !== item.id))} type="button">Fjern</button></div>
}

function ExpensesView({ members, expenses, setExpenses }){
  const [settlement, setSettlement] = useState(false)
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  if(settlement) return <SettlementView members={members} expenses={expenses} back={() => setSettlement(false)}/>
  return <><button className="summary" onClick={() => setSettlement(true)}><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><em>Se oppgjør →</em></button>{!expenses.length && <Empty title="Ingen utlegg ennå" text="Når noen betaler for noe på turen, legger dere det inn her." action="Legg til utlegg"/>}{expenses.map(expense => <ExpenseCard key={expense.id} expense={expense} members={members} expenses={expenses} setExpenses={setExpenses}/>) }<AddExpense members={members} expenses={expenses} setExpenses={setExpenses}/></>
}

function ExpenseCard({ expense, members, expenses, setExpenses }){
  return <div className="expense"><div><h3>{expense.title}</h3><b>{formatMoney(expense.amount)}</b></div><p>Betalt av {members.find(member => member.id === expense.paidBy)?.name || 'Ukjent'} · Delt mellom {expense.participants?.length || 0} personer</p><span>{expense.category}</span><em>{expense.status}</em><button className="rowAction" onClick={() => setExpenses(expenses.filter(row => row.id !== expense.id))} type="button">Fjern</button></div>
}

function AddExpense({ members, expenses, setExpenses }){
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(members[0]?.id || '')
  useEffect(() => {
    if(!paidBy && members[0]?.id) setPaidBy(members[0].id)
  }, [paidBy, members])
  const add = () => {
    const payer = paidBy || members[0]?.id
    if(title && Number(amount) && payer){
      setExpenses([...expenses, { id: `e${Date.now()}`, title, amount: Number(amount), paidBy: payer, participants: members.slice(0, Math.min(5, members.length)).map(member => member.id), category: 'Annet', status: 'Ikke oppgjort' }])
      setOpen(false)
      setTitle('')
      setAmount('')
    }
  }
  return <>{!open && <button className="dashed" onClick={() => setOpen(true)}><Plus size={18}/> Legg til utlegg</button>}{open && <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hva ble betalt?"/><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Beløp" type="number"/><select value={paidBy} onChange={e => setPaidBy(e.target.value)}>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select><div><button onClick={() => setOpen(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>
}

function SettlementView({ members, expenses, back }){
  const rows = computeSettlements(expenses, members)
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const name = id => members.find(member => member.id === id)?.name || id
  const text = rows.length ? rows.map(row => `${name(row.from)} skal betale ${name(row.to)}: ${formatMoney(row.amount)}`).join('\n') : 'Alt er gjort opp.'
  const copy = async () => {
    await navigator.clipboard?.writeText(text)
  }
  const exportText = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'travelvault-oppgjor.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  return <><button className="backRow" onClick={back}>← Utlegg</button><div className="summary split"><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><div><span>Per person</span><b>{formatMoney(total / Math.max(1, members.length))}</b></div></div><h2 className="sectionTitle">Oppgjør</h2>{rows.length ? rows.map((row, index) => <div className="settlement" key={index}><span>{name(row.from)} skal betale {name(row.to)}</span><b>{formatMoney(row.amount)}</b></div>) : <div className="empty success">Alt er gjort opp!</div>}<div className="two"><button className="secondary" onClick={copy}>Kopier Vipps-tekst</button><button className="secondary" onClick={exportText}>Eksporter</button></div></>
}

function MoreView(props){
  const { mer, setMer, trip } = props
  if(mer === 'list'){
    const rows = [['dokumenter', FileText, 'Dokumenter'], ['bilder', Camera, 'Bilder'], ['deltakere', Users, 'Deltakere'], ...(trip.type === 'cup' ? [['kamper', Trophy, 'Kamper']] : []), ['innstillinger', Settings, 'Innstillinger']]
    return <div className="moreList">{rows.map(([id, Icon, label]) => <button key={id} onClick={() => setMer(id)}><span className="iconTile"><Icon size={20}/></span><span>{label}</span><b>›</b></button>)}</div>
  }
  return <SubScreen {...props}/>
}

function SubScreen(props){
  const { mer, setMer } = props
  return <><button className="backRow" onClick={() => setMer('list')}>← Mer</button>{mer === 'dokumenter' && <DocScreen documents={props.documents} setDocuments={props.setDocuments}/>} {mer === 'bilder' && <PhotoScreen photos={props.photos} setPhotos={props.setPhotos}/>} {mer === 'deltakere' && <ParticipantsScreen {...props}/>} {mer === 'kamper' && <MatchScreen {...props}/>} {mer === 'innstillinger' && <SettingsScreen trip={props.trip} deleteTrip={props.deleteTrip}/>}</>
}

function ParticipantsScreen({ members, setMembers, expenses, setExpenses, packing, setPacking }){
  const [name, setName] = useState('')
  const rows = computeSettlements(expenses, members)
  const balance = id => rows.filter(row => row.to === id).reduce((sum, row) => sum + row.amount, 0) - rows.filter(row => row.from === id).reduce((sum, row) => sum + row.amount, 0)
  const add = () => {
    if(!name.trim()) return
    setMembers([...members, { id: `member-${Date.now()}`, name: name.trim(), role: 'Deltaker', status: 'active' }])
    setName('')
  }
  const remove = (memberId) => {
    if(members.length <= 1) return
    const fallbackMember = members.find(member => member.id !== memberId)
    const fallback = fallbackMember?.id
    setMembers(members.filter(member => member.id !== memberId))
    setPacking(packing.map(item => item.assignedTo === memberId ? { ...item, assignedTo: null } : item))
    setExpenses(expenses.map(expense => {
      const participants = expense.participants?.filter(id => id !== memberId) || []
      return {
        ...expense,
        paidBy: expense.paidBy === memberId ? fallback : expense.paidBy,
        participants: participants.length ? participants : fallback ? [fallback] : []
      }
    }))
  }
  return <><div className="titleRow"><h2>Deltakere</h2></div>{members.length ? members.map(member => <div className="member card" key={member.id}><Avatar name={member.name}/><div><b>{member.name}</b><small>{member.role} · Pakket {packing.filter(item => item.assignedTo === member.id && item.packed).length}/{packing.filter(item => item.assignedTo === member.id).length}</small></div><em className={balance(member.id) < 0 ? 'red' : 'green'}>{balance(member.id) === 0 ? 'Oppgjort' : balance(member.id) > 0 ? `Til gode ${formatMoney(balance(member.id))}` : `Skylder ${formatMoney(-balance(member.id))}`}</em>{members.length > 1 && <button className="rowAction" onClick={() => remove(member.id)} type="button">Fjern</button>}</div>) : <Empty title="Ingen deltakere" text="Deltakere vises her når de er lagt inn på turen."/>}<div className="inlineForm"><input value={name} onChange={e => setName(e.target.value)} placeholder="Navn på deltaker"/><div><button onClick={() => setName('')}>Tøm</button><button onClick={add}>Legg til</button></div></div></>
}

function MatchScreen({ trip, matches, setMatches }){
  const [adding, setAdding] = useState(false)
  return <><h2>Kamper</h2>{matches.length ? matches.map(match => <div className="match" key={match.id}><div><h3>{trip.title} – {match.opponent}</h3><b>{match.status}</b></div><section><span><b>{match.start || 'Ikke satt'}</b>Kampstart</span><span><b>{match.meetup || 'Ikke satt'}</b>Oppmøte</span><span><b>{match.venue || 'Ikke satt'}</b>Bane</span></section><p>Drakt: {match.kit || 'Ikke satt'}</p><div className="rowButtons"><button onClick={() => setMatches(matches.map(row => row.id === match.id ? { ...row, status: 'Ferdig', result: 'Registrert' } : row))}>Legg inn resultat</button><button onClick={() => setMatches(matches.filter(row => row.id !== match.id))}>Fjern</button></div></div>) : <Empty title="Ingen kamper" text="Legg inn cupkamper med oppmøtetid, bane og draktfarge." action="Legg til kamp" onAction={() => setAdding(true)}/>} {!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til kamp</button>}{adding && <AddMatch matches={matches} setMatches={setMatches} close={() => setAdding(false)}/>}</>
}

function AddMatch({ matches, setMatches, close }){
  const [opponent, setOpponent] = useState('')
  const [start, setStart] = useState('')
  const [meetup, setMeetup] = useState('')
  const [venue, setVenue] = useState('')
  const [kit, setKit] = useState('')
  const add = () => {
    if(!opponent.trim()) return
    setMatches([...matches, { id: `match-${Date.now()}`, opponent: opponent.trim(), start, meetup, venue: venue.trim(), kit: kit.trim(), status: 'Planlagt', result: '' }])
    close()
  }
  return <div className="inlineForm"><input value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="Motstander"/><div><input type="time" value={start} onChange={e => setStart(e.target.value)}/><input type="time" value={meetup} onChange={e => setMeetup(e.target.value)}/></div><input value={venue} onChange={e => setVenue(e.target.value)} placeholder="Bane/sted"/><input value={kit} onChange={e => setKit(e.target.value)} placeholder="Draktfarge"/><div><button onClick={close}>Avbryt</button><button onClick={add}>Legg til</button></div></div>
}

function SettingsScreen({ trip, deleteTrip }){
  return <><h2>Innstillinger</h2><div className="card info"><p><b>Turnavn</b><span>{trip.title}</span></p><p><b>Invitasjonskode</b><span>{trip.inviteCode || 'Ikke laget'}</span></p><p><b>Lagring</b><span>{trip.source === 'local' ? 'Lokal testmodus' : 'Supabase'}</span></p><p><b>Din rolle</b><span>Eier</span></p></div><button className="danger" onClick={deleteTrip}>Slett tur</button></>
}

function DocScreen({ documents, setDocuments }){
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('PDF')
  const add = () => {
    if(!title.trim()) return
    setDocuments([...documents, { id: `doc-${Date.now()}`, title: title.trim(), type }])
    setTitle('')
    setAdding(false)
  }
  return <><h2>Dokumenter</h2>{documents.length ? documents.map(document => <div className="doc card" key={document.id}><FileText size={20}/><div><b>{document.title}</b><small>{document.type} · Gjelder: Alle</small></div><button className="rowAction" onClick={() => setDocuments(documents.filter(row => row.id !== document.id))} type="button">Fjern</button></div>) : <Empty title="Ingen dokumenter" text="Legg inn dokumentnavn for å teste dokumentflyten." action="Legg til dokument" onAction={() => setAdding(true)}/>} {!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til dokument</button>}{adding && <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Dokumentnavn"/><select value={type} onChange={e => setType(e.target.value)}><option>PDF</option><option>Bilde</option><option>Lenke</option><option>Annet</option></select><div><button onClick={() => setAdding(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>
}

function PhotoScreen({ photos, setPhotos }){
  const [adding, setAdding] = useState(false)
  const [caption, setCaption] = useState('')
  const add = () => {
    if(!caption.trim()) return
    setPhotos([...photos, { id: `photo-${Date.now()}`, caption: caption.trim() }])
    setCaption('')
    setAdding(false)
  }
  return <><h2>Bilder</h2>{photos.length ? <div className="photoGrid">{photos.map(photo => <button className="photo" key={photo.id} onClick={() => setPhotos(photos.filter(row => row.id !== photo.id))} title="Fjern bilde">{photo.caption}</button>)}</div> : <Empty title="Ingen bilder" text="Legg inn bildenavn/tekst for å teste bildeflyten." action="Legg til bilde" onAction={() => setAdding(true)}/>} {!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til bilde</button>}{adding && <div className="inlineForm"><input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Bildetekst eller filnavn"/><div><button onClick={() => setAdding(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>
}

function Empty({ title, text, action, onAction }){
  return <div className="empty"><h3>{title}</h3><p>{text}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</div>
}

function Avatar({ name }){
  return <span className="avatar">{initials(name)}</span>
}

createRoot(document.getElementById('root')).render(<RootRouter />)
