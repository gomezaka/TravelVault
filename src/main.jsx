import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, Camera, ChevronLeft, FileText, Home, ListChecks, MoreHorizontal, PiggyBank, Plus, Settings, Trophy, Users, MapPin, Plane, Hotel, Ship, Utensils } from 'lucide-react'
import { demoTrips, documents, initialEvents, initialExpenses, initialMatches, initialMembers, initialPacking, photos } from './data/demoData'
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

function formatMoney(n){ return `${Math.round(n).toLocaleString('nb-NO')} kr` }
function initials(name){ return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() }
function localMemberId(name){ return name.toLowerCase().replaceAll(' ', '-').replaceAll('æ', 'ae').replaceAll('ø', 'o').replaceAll('å', 'a') }
function normalizeDemoTrips(){ return demoTrips.map(trip => ({ ...trip, source: 'demo' })) }

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

  if(!supabase) return <App demoMode />

  if(loading){
    return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Laster innlogging …</p></div></section></main></div>
  }

  if(!session){
    return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted.</p><label className="field"><span>E-post</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="navn@epost.no"/></label>{authError && <div className="authMsg error">{authError}</div>}{message && <div className="authMsg ok">{message}</div>}<button className="primary" onClick={signIn}>Logg inn med e-postlenke</button><small>Første MVP bruker magic link. Google-login kan kobles på senere i Supabase Auth.</small></div></section></main></div>
  }

  return <App session={session} />
}

function App({ session, demoMode = false }){
  const [view, setView] = useState('trips')
  const [trips, setTrips] = useState(demoMode ? normalizeDemoTrips() : [])
  const [tripsLoading, setTripsLoading] = useState(Boolean(supabase && session))
  const [tripsError, setTripsError] = useState('')
  const [activeTrip, setActiveTrip] = useState((demoMode ? normalizeDemoTrips() : [])[0] || null)
  const [tab, setTab] = useState('na')
  const [mer, setMer] = useState('list')
  const [older, setOlder] = useState(false)
  const [members, setMembers] = useState(demoMode ? initialMembers : [])
  const [events, setEvents] = useState(demoMode ? initialEvents : [])
  const [packing, setPacking] = useState(demoMode ? initialPacking : [])
  const [expenses, setExpenses] = useState(demoMode ? initialExpenses : [])
  const [matches, setMatches] = useState(demoMode ? initialMatches : [])
  const [savingCreate, setSavingCreate] = useState(false)
  const [create, setCreate] = useState({ step: 1, type: 'cup', title: '', start: '', end: '', location: '', description: '', participants: ['Morten'] })

  const loadTrips = useCallback(async () => {
    if(demoMode || !supabase || !session) return
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
  }, [demoMode, session])

  useEffect(() => { loadTrips() }, [loadTrips])

  const resetContentForTrip = () => {
    setMembers(emptyTripContent.members)
    setEvents(emptyTripContent.events)
    setPacking(emptyTripContent.packing)
    setExpenses(emptyTripContent.expenses)
    setMatches(emptyTripContent.matches)
  }

  const openTrip = async (trip) => {
    setActiveTrip(trip)
    setView('trip')
    setTab('na')
    setMer('list')

    if(trip.source === 'demo' || demoMode || !supabase){
      setMembers(initialMembers)
      setEvents(initialEvents)
      setPacking(initialPacking)
      setExpenses(initialExpenses)
      setMatches(initialMatches)
      return
    }

    resetContentForTrip()
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

    if(demoMode || !supabase || !session){
      const participantNames = create.participants.map(name => name.trim()).filter(Boolean)
      const trip = {
        id: `trip-${Date.now()}`,
        title: create.title || 'Ny tur',
        type: create.type,
        date: 'Dato ikke satt',
        location: create.location || 'Ukjent sted',
        members: participantNames.length || 1,
        status: 'Kommende',
        next: 'Legg til første hendelse',
        source: 'local'
      }
      const nextMembers = participantNames.map((name, index) => ({ id: localMemberId(name), name, role: index === 0 ? 'Eier' : 'Deltaker' }))
      setTrips(current => [trip, ...current])
      setActiveTrip(trip)
      setMembers(nextMembers)
      setEvents([])
      setPacking([])
      setExpenses([])
      setMatches([])
      setView('trip')
      setTab('na')
      setMer('list')
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
      setView('trip')
      setTab('na')
      setMer('list')
      setCreate({ step: 1, type: 'cup', title: '', start: '', end: '', location: '', description: '', participants: ['Morten'] })
      await loadTrips()
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å lagre turen.')
    }finally{
      setSavingCreate(false)
    }
  }

  return <div className="page"><main className="phone">
    {view === 'trips' && <TripsView older={older} setOlder={setOlder} openTrip={openTrip} setView={setView} trips={trips} loading={tripsLoading} error={tripsError} demoMode={demoMode}/>} 
    {view === 'create' && <CreateTrip create={create} setCreate={setCreate} setView={setView} finishCreate={finishCreate} saving={savingCreate} error={tripsError}/>} 
    {view === 'trip' && activeTrip && <TripShell trip={activeTrip} setView={setView} tab={tab} setTab={setTab} mer={mer} setMer={setMer} members={members} events={events} setEvents={setEvents} packing={packing} setPacking={setPacking} expenses={expenses} setExpenses={setExpenses} matches={matches} setMatches={setMatches}/>} 
  </main></div>
}

function TripsView({ older, setOlder, openTrip, setView, trips, loading, error, demoMode }){
  const ongoing = trips.filter(t => t.status === 'Pågår')
  const upcoming = trips.filter(t => t.status === 'Kommende')
  const previous = trips.filter(t => t.status === 'Tidligere')
  const hasTrips = trips.length > 0

  return <section className="screen with-actions"><header className="appHeader"><div className="brandRow"><img src="/logo-mark.png" alt="Travelvault"/><div><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted</p></div></div>{supabase && <button className="signOutBtn" onClick={() => supabase.auth.signOut()}>Logg ut</button>}</header><div className="content gap-xl">
    {demoMode && <div className="authMsg ok">Demomodus: legg inn Supabase-variabler for ekte lagring.</div>}
    {error && <div className="authMsg error">{error}</div>}
    {loading && <Empty title="Henter turer" text="Laster dine Travelvault-turer fra Supabase." />}
    {!loading && !hasTrips && <Empty title="Ingen turer ennå" text="Opprett første tur, så lagres den i Supabase og vises her neste gang du logger inn." action="Opprett ny tur" onAction={() => setView('create')} />}
    {!!ongoing.length && <TripSection title="Pågående" trips={ongoing} openTrip={openTrip}/>} 
    {!!upcoming.length && <TripSection title="Kommende" trips={upcoming} openTrip={openTrip}/>} 
    {!!previous.length && <div><button className="sectionToggle" onClick={() => setOlder(!older)}><span>Tidligere turer</span><b>{older ? 'Skjul' : 'Vis'}</b></button>{older && previous.map(trip => <TripCard key={trip.id} trip={trip} muted openTrip={openTrip}/>)}</div>}
  </div><div className="bottomActions"><button className="primary" onClick={() => setView('create')}>Opprett ny tur</button><button className="secondary" type="button">Bli med via invitasjonskode</button></div></section>
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
    {create.step === 1 && <><h2>Hva slags tur?</h2><p className="lead">Dette styrer hvilke faner turen får</p>{[['family', 'Familietur'], ['friends', 'Vennetur'], ['cup', 'Cup/idrettstur'], ['work', 'Jobbtur'], ['other', 'Annet']].map(([id, label]) => <button key={id} onClick={() => setCreate({ ...create, type: id })} className={`choice ${create.type === id ? 'selected' : ''}`}>{label}<span>{create.type === id ? '✓' : ''}</span></button>)}</>}
    {create.step === 2 && <><h2>Grunninfo</h2><Field label="Navn på tur" value={create.title} onChange={title => setCreate({ ...create, title })} placeholder="F.eks. Danmark Cup 2027"/><div className="two"><Field label="Startdato" type="date" value={create.start} onChange={start => setCreate({ ...create, start })}/><Field label="Sluttdato" type="date" value={create.end} onChange={end => setCreate({ ...create, end })}/></div><Field label="Hovedsted" value={create.location} onChange={location => setCreate({ ...create, location })} placeholder="F.eks. København"/><label className="field"><span>Beskrivelse</span><textarea value={create.description} onChange={e => setCreate({ ...create, description: e.target.value })}/></label></>}
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
    {tab === 'plan' && <PlanView events={props.events}/>} 
    {tab === 'pakk' && <PackingView members={props.members} packing={props.packing} setPacking={props.setPacking}/>} 
    {tab === 'utlegg' && <ExpensesView members={props.members} expenses={props.expenses} setExpenses={props.setExpenses}/>} 
    {tab === 'mer' && <MoreView {...props} mer={mer} setMer={setMer}/>} 
  </div><nav className="tabbar">{tabs.map(([id, Icon, label]) => <button key={id} onClick={() => { setTab(id); setMer('list') }} className={tab === id ? 'active' : ''}><Icon size={20}/><span>{label}</span></button>)}</nav></section>
}

function NowView({ trip, events, packing, expenses, matches }){
  const nextEvent = events[0]
  const nextMatch = matches[0]
  const nextTitle = nextEvent?.title || (trip.type === 'cup' ? 'Legg inn første kamp' : 'Legg inn første planpunkt')
  const nextTime = nextEvent?.time || 'Ikke satt'
  const nextPlace = nextEvent?.place || trip.location

  return <><button className="hero"><small>Neste nå</small><h2>{nextTitle}</h2><div className="stats"><div><b>{nextTime}</b><span>Tidspunkt</span></div><div><b>{nextMatch?.meetup || 'Ikke satt'}</b><span>Oppmøte</span></div><div><b>{nextPlace}</b><span>Sted</span></div></div><p>{nextEvent?.note || 'Start med å legge inn plan, dokumenter, pakkeliste og utlegg for turen.'}</p><div className="heroBtns"><button>Vis detaljer</button><button>Åpne kart</button></div></button><h2 className="sectionTitle">Viktige varsler</h2><div className="alerts"><Alert color="yellow" text={`${packing.filter(item => !item.packed).length} pakkepunkter mangler`}/><Alert color="blue" text={`${expenses.length} utlegg er registrert`}/><Alert color="red" text={trip.source === 'supabase' ? 'Dokumenter og bilder kobles i neste patch' : 'Hotellbooking bør lastes ned før avreise'}/></div><h2 className="sectionTitle">Dagens oversikt</h2><div className="timeline">{events.slice(0, 4).map(event => <div key={event.id}><b>{event.time}</b><span>{event.title}</span></div>)}{!events.length && <p>Ingen hendelser lagt inn ennå.</p>}</div></>
}

function Alert({ color, text }){
  return <div className={`alert ${color}`}><span></span>{text}</div>
}

function PlanView({ events }){
  const [open, setOpen] = useState(null)
  const days = [...new Set(events.map(event => event.day))]
  return <>{!events.length && <Empty title="Ingen planpunkter" text="Legg inn fly, hotell, aktivitet eller oppmøte." action="Legg til planpunkt"/>}{days.map(day => <div key={day}><h2 className="dayTitle">{day}</h2>{events.filter(event => event.day === day).map(event => <EventCard key={event.id} event={event} open={open === event.id} onClick={() => setOpen(open === event.id ? null : event.id)}/>)}</div>)}</>
}

function EventCard({ event, open, onClick }){
  const Icon = iconMap[event.type] || CalendarDays
  return <button className="eventCard" onClick={onClick}><div className="eventTop"><span className="iconTile"><Icon size={18}/></span><div><h3>{event.title}</h3><p>{event.time} · {event.place}</p></div><b className="status">{event.status}</b></div>{open && <div className="eventDetails"><p>{event.note}</p>{event.document && <small>Dokument: {event.document}</small>}<div><span>Rediger</span><span>Åpne kart</span></div></div>}</button>
}

function PackingView({ members, packing, setPacking }){
  const [filter, setFilter] = useState('Alle')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(categories[0])
  const visible = packing.filter(item => filter === 'Alle' || (filter === 'Mangler' && !item.packed) || (filter === 'Pakket' && item.packed) || (filter === 'Må kjøpes' && item.mustBuy))
  const add = () => {
    if(title.trim()){
      setPacking([...packing, { id: `p${Date.now()}`, title, category, assignedTo: null, packed: false, mustBuy: false }])
      setTitle('')
      setAdding(false)
    }
  }
  const addStd = () => {
    const names = ['Drakt', 'Shorts', 'Strømper', 'Leggskinn', 'Fotballsko', 'Vannflaske', 'Håndkle', 'Sitteunderlag', 'Regntøy', 'Powerbank']
    const existing = new Set(packing.map(item => item.title))
    setPacking([...packing, ...names.filter(name => !existing.has(name)).map((name, index) => ({ id: `std-${Date.now()}-${index}`, title: name, category: 'Sport/cup', assignedTo: null, packed: false, mustBuy: false }))])
  }

  return <><div className="chips">{['Alle', 'Mangler', 'Pakket', 'Må kjøpes'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{!packing.length && <Empty title="Pakkelisten er tom" text="Legg til det dere må huske, eller start med en standardliste." action="Bruk standardliste" onAction={addStd}/>} {packing.length > 0 && <><h2 className="sectionTitle">Felles pakkeliste</h2>{visible.filter(item => !item.assignedTo).map(item => <PackRow key={item.id} item={item} setPacking={setPacking} packing={packing}/>) }{members.map(member => { const rows = visible.filter(item => item.assignedTo === member.id); return rows.length ? <div key={member.id}><h2 className="sectionTitle">{member.name}</h2>{rows.map(item => <PackRow key={item.id} item={item} setPacking={setPacking} packing={packing}/>)}</div> : null })}<button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til punkt</button>{adding && <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hva må pakkes?"/><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><div><button onClick={() => setAdding(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>}</>
}

function PackRow({ item, packing, setPacking }){
  return <button className="packRow" onClick={() => setPacking(packing.map(row => row.id === item.id ? { ...row, packed: !row.packed } : row))}><span className={item.packed ? 'checked' : ''}>{item.packed ? '✓' : ''}</span><div><b className={item.packed ? 'done' : ''}>{item.title}</b><small>{item.category}</small></div>{item.mustBuy && <em>Må kjøpes</em>}</button>
}

function ExpensesView({ members, expenses, setExpenses }){
  const [settlement, setSettlement] = useState(false)
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  if(settlement) return <SettlementView members={members} expenses={expenses} back={() => setSettlement(false)}/>
  return <><button className="summary" onClick={() => setSettlement(true)}><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><em>Se oppgjør →</em></button>{!expenses.length && <Empty title="Ingen utlegg ennå" text="Når noen betaler for noe på turen, legger dere det inn her." action="Legg til utlegg"/>}{expenses.map(expense => <ExpenseCard key={expense.id} expense={expense} members={members}/>) }<AddExpense members={members} expenses={expenses} setExpenses={setExpenses}/></>
}

function ExpenseCard({ expense, members }){
  return <div className="expense"><div><h3>{expense.title}</h3><b>{formatMoney(expense.amount)}</b></div><p>Betalt av {members.find(member => member.id === expense.paidBy)?.name || 'Ukjent'} · Delt mellom {expense.participants?.length || 0} personer</p><span>{expense.category}</span><em>{expense.status}</em></div>
}

function AddExpense({ members, expenses, setExpenses }){
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(members[0]?.id || '')
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
  return <><button className="backRow" onClick={back}>← Utlegg</button><div className="summary split"><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><div><span>Per person</span><b>{formatMoney(total / Math.max(1, members.length))}</b></div></div><h2 className="sectionTitle">Oppgjør</h2>{rows.length ? rows.map((row, index) => <div className="settlement" key={index}><span>{name(row.from)} skal betale {name(row.to)}</span><b>{formatMoney(row.amount)}</b></div>) : <div className="empty success">Alt er gjort opp!</div>}<div className="two"><button className="secondary">Kopier Vipps-tekst</button><button className="secondary">Eksporter</button></div></>
}

function MoreView(props){
  const { mer, setMer, trip } = props
  if(mer === 'list'){
    const rows = [['dokumenter', FileText, 'Dokumenter'], ['bilder', Camera, 'Bilder'], ['deltakere', Users, 'Deltakere'], ...(trip.type === 'cup' ? [['kamper', Trophy, 'Kamper']] : []), ['innstillinger', Settings, 'Innstillinger']]
    return <div className="moreList">{rows.map(([id, Icon, label]) => <button key={id} onClick={() => setMer(id)}><Icon size={20}/><span>{label}</span><b>›</b></button>)}</div>
  }
  return <SubScreen {...props}/>
}

function SubScreen(props){
  const { mer, setMer, members, expenses, matches, setMatches, packing, trip } = props
  const rows = computeSettlements(expenses, members)
  const balance = id => rows.filter(row => row.to === id).reduce((sum, row) => sum + row.amount, 0) - rows.filter(row => row.from === id).reduce((sum, row) => sum + row.amount, 0)

  return <><button className="backRow" onClick={() => setMer('list')}>← Mer</button>{mer === 'dokumenter' && <DocScreen trip={trip}/>} {mer === 'bilder' && <PhotoScreen trip={trip}/>} {mer === 'deltakere' && <><div className="titleRow"><h2>Deltakere</h2><button>+ Inviter</button></div>{members.length ? members.map(member => <div className="member card" key={member.id}><Avatar name={member.name}/><div><b>{member.name}</b><small>{member.role} · Pakket {packing.filter(item => item.assignedTo === member.id && item.packed).length}/{packing.filter(item => item.assignedTo === member.id).length}</small></div><em className={balance(member.id) < 0 ? 'red' : 'green'}>{balance(member.id) === 0 ? 'Oppgjort' : balance(member.id) > 0 ? `Til gode ${formatMoney(balance(member.id))}` : `Skylder ${formatMoney(-balance(member.id))}`}</em></div>) : <Empty title="Ingen deltakere" text="Deltakere vises her når de er lagt inn på turen."/>}</>} {mer === 'kamper' && <><h2>Kamper</h2>{matches.length ? matches.map(match => <div className="match" key={match.id}><div><h3>Sarpsborg FK – {match.opponent}</h3><b>{match.status}</b></div><section><span><b>{match.start}</b>Kampstart</span><span><b>{match.meetup}</b>Oppmøte</span><span><b>{match.venue}</b>Bane</span></section><p>Drakt: {match.kit}</p><button onClick={() => setMatches(matches.map(row => row.id === match.id ? { ...row, status: 'Ferdig', result: 'Registrert' } : row))}>Legg inn resultat</button></div>) : <Empty title="Ingen kamper" text="Legg inn cupkamper med oppmøtetid, bane og draktfarge." action="Legg til kamp"/>}</>} {mer === 'innstillinger' && <><h2>Innstillinger</h2><div className="card info"><p><b>Turnavn</b><span>{trip.title}</span></p><p><b>Lagring</b><span>{trip.source === 'supabase' ? 'Supabase' : 'Demo/lokalt'}</span></p><p><b>Din rolle</b><span>Eier</span></p></div><button className="danger">Slett tur</button></>}</>
}

function DocScreen({ trip }){
  const rows = trip.source === 'supabase' ? [] : documents
  return <><h2>Dokumenter</h2>{rows.length ? rows.map(document => <div className="doc card" key={document}><FileText size={20}/><div><b>{document}</b><small>PDF · Gjelder: Alle</small></div></div>) : <Empty title="Ingen dokumenter" text="Dokumentopplasting kobles til Supabase Storage i neste patch."/>}<button className="dashed"><Plus size={18}/> Last opp dokument</button></>
}

function PhotoScreen({ trip }){
  const rows = trip.source === 'supabase' ? [] : photos
  return <><h2>Bilder</h2>{rows.length ? <div className="photoGrid">{rows.map(photo => <div className="photo" key={photo}>{photo}</div>)}</div> : <Empty title="Ingen bilder" text="Bildeopplasting kobles til Supabase Storage i en egen patch."/>}<button className="dashed"><Plus size={18}/> Last opp bilde</button></>
}

function Empty({ title, text, action, onAction }){
  return <div className="empty"><h3>{title}</h3><p>{text}</p>{action && <button onClick={onAction}>{action}</button>}</div>
}

function Avatar({ name }){
  return <span className="avatar">{initials(name)}</span>
}

createRoot(document.getElementById('root')).render(<AuthGate />)
