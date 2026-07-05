import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, Camera, ChevronLeft, FileText, Home, ListChecks, MoreHorizontal, PiggyBank, Plus, Settings, Trophy, Users, MapPin, Plane, Hotel, Ship, Utensils } from 'lucide-react'
import { demoTrips, documents, initialEvents, initialExpenses, initialMatches, initialMembers, initialPacking, photos } from './data/demoData'
import './styles/app.css'

const iconMap = { transport: Ship, hotel: Hotel, match: Trophy, food: Utensils, activity: MapPin, flight: Plane }
const tabs = [
  ['na', Home, 'Nå'], ['plan', CalendarDays, 'Plan'], ['pakk', ListChecks, 'Pakk'], ['utlegg', PiggyBank, 'Utlegg'], ['mer', MoreHorizontal, 'Mer']
]
const categories = ['Dokumenter','Klær','Hygiene','Elektronikk','Mat/snacks','Sport/cup','Barn','Diverse']

function formatMoney(n){ return `${Math.round(n).toLocaleString('nb-NO')} kr` }
function initials(name){ return name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() }
function computeSettlements(expenses, members){
  const balances = Object.fromEntries(members.map(m => [m.id, 0]))
  expenses.forEach(e => {
    const share = e.amount / e.participants.length
    balances[e.paidBy] += e.amount
    e.participants.forEach(id => { balances[id] -= share })
  })
  const creditors = Object.entries(balances).filter(([,v])=>v>0.5).map(([id,amount])=>({id,amount}))
  const debtors = Object.entries(balances).filter(([,v])=>v<-0.5).map(([id,amount])=>({id,amount:-amount}))
  const rows = []
  let i=0,j=0
  while(i<debtors.length && j<creditors.length){
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    rows.push({ from: debtors[i].id, to: creditors[j].id, amount })
    debtors[i].amount -= amount; creditors[j].amount -= amount
    if(debtors[i].amount < 0.5) i++
    if(creditors[j].amount < 0.5) j++
  }
  return rows
}

function App(){
  const [view,setView] = useState('trips')
  const [activeTrip,setActiveTrip] = useState(demoTrips[0])
  const [tab,setTab] = useState('na')
  const [mer,setMer] = useState('list')
  const [older,setOlder] = useState(false)
  const [members,setMembers] = useState(initialMembers)
  const [events,setEvents] = useState(initialEvents)
  const [packing,setPacking] = useState(initialPacking)
  const [expenses,setExpenses] = useState(initialExpenses)
  const [matches,setMatches] = useState(initialMatches)
  const [create,setCreate] = useState({ step:1, type:'cup', title:'', start:'', end:'', location:'', description:'', participants:['Morten'] })

  const openTrip = (trip) => { setActiveTrip(trip); setView('trip'); setTab('na'); setMer('list') }
  const finishCreate = () => {
    const trip = { id:`trip-${Date.now()}`, title:create.title || 'Ny tur', type:create.type, date:'Dato ikke satt', location:create.location || 'Ukjent sted', members:create.participants.length, status:'Kommende', next:'Legg til første hendelse' }
    setActiveTrip(trip); setMembers(create.participants.map((name,i)=>({id:name.toLowerCase().replaceAll(' ','-'), name, role:i===0?'Eier':'Deltaker'})))
    setEvents([]); setPacking([]); setExpenses([]); setMatches([]); setView('trip'); setTab('na'); setMer('list')
  }

  return <div className="page"><main className="phone">
    {view === 'trips' && <TripsView older={older} setOlder={setOlder} openTrip={openTrip} setView={setView}/>} 
    {view === 'create' && <CreateTrip create={create} setCreate={setCreate} setView={setView} finishCreate={finishCreate}/>} 
    {view === 'trip' && <TripShell trip={activeTrip} setView={setView} tab={tab} setTab={setTab} mer={mer} setMer={setMer} members={members} events={events} setEvents={setEvents} packing={packing} setPacking={setPacking} expenses={expenses} setExpenses={setExpenses} matches={matches} setMatches={setMatches}/>} 
  </main></div>
}

function TripsView({older,setOlder,openTrip,setView}){
  return <section className="screen with-actions"><header className="appHeader"><div className="brandRow"><img src="/logo-mark.png" alt="Travelvault"/><div><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted</p></div></div></header><div className="content gap-xl">
    <TripSection title="Pågående" trips={demoTrips.filter(t=>t.status==='Pågår')} openTrip={openTrip}/>
    <TripSection title="Kommende" trips={demoTrips.filter(t=>t.status==='Kommende')} openTrip={openTrip}/>
    <div><button className="sectionToggle" onClick={()=>setOlder(!older)}><span>Tidligere turer</span><b>{older?'Skjul':'Vis'}</b></button>{older && <TripCard trip={demoTrips[2]} muted openTrip={openTrip}/>}</div>
  </div><div className="bottomActions"><button className="primary" onClick={()=>setView('create')}>Opprett ny tur</button><button className="secondary">Bli med via invitasjonskode</button></div></section>
}
function TripSection({title,trips,openTrip}){ return <div><h2 className="sectionTitle">{title}</h2>{trips.map(t=><TripCard key={t.id} trip={t} openTrip={openTrip}/>)}</div> }
function TripCard({trip,muted,openTrip}){ return <button className={`tripCard ${muted?'muted':''}`} onClick={()=>openTrip(trip)}>{trip.status==='Pågår' && <span className="badge green">Pågår</span>}<h3>{trip.title}</h3><p>{trip.date} · {trip.location} · {trip.members} deltakere</p><div className={`nextPill ${trip.status==='Pågår'?'green':'blue'}`}><span></span>{trip.next}</div></button> }

function CreateTrip({create,setCreate,setView,finishCreate}){
  const next = () => create.step === 4 ? finishCreate() : setCreate({...create, step:create.step+1})
  const back = () => create.step === 1 ? setView('trips') : setCreate({...create, step:create.step-1})
  return <section className="screen with-actions"><TopLine title="Opprett ny tur" onBack={back}/><div className="progress">{[1,2,3,4].map(s=><span key={s} className={s<=create.step?'active':''}/>)}</div><div className="content">
    {create.step===1 && <><h2>Hva slags tur?</h2><p className="lead">Dette styrer hvilke faner turen får</p>{[['family','Familietur'],['friends','Vennetur'],['cup','Cup/idrettstur'],['work','Jobbtur'],['other','Annet']].map(([id,label])=><button key={id} onClick={()=>setCreate({...create,type:id})} className={`choice ${create.type===id?'selected':''}`}>{label}<span>{create.type===id?'✓':''}</span></button>)}</>}
    {create.step===2 && <><h2>Grunninfo</h2><Field label="Navn på tur" value={create.title} onChange={title=>setCreate({...create,title})} placeholder="F.eks. Danmark Cup 2027"/><div className="two"><Field label="Startdato" type="date" value={create.start} onChange={start=>setCreate({...create,start})}/><Field label="Sluttdato" type="date" value={create.end} onChange={end=>setCreate({...create,end})}/></div><Field label="Hovedsted" value={create.location} onChange={location=>setCreate({...create,location})} placeholder="F.eks. København"/><label className="field"><span>Beskrivelse</span><textarea value={create.description} onChange={e=>setCreate({...create,description:e.target.value})}/></label></>}
    {create.step===3 && <ParticipantsDraft create={create} setCreate={setCreate}/>} 
    {create.step===4 && <><h2>Startinnhold</h2>{['Opprett pakkeliste','Legg til dokumenter','Legg til første planpunkt','Aktiver utlegg','Aktiver cupkamper'].map((x,i)=><div className="toggleRow" key={x}><span>{x}</span><b className={i<4 || create.type==='cup'?'on':''}></b></div>)}</>}
  </div><div className="bottomActions row"><button className="secondary" onClick={back}>Tilbake</button><button className="primary" onClick={next}>{create.step===4?'Opprett tur':'Neste'}</button></div></section>
}
function ParticipantsDraft({create,setCreate}){ const [name,setName]=useState(''); const add=()=>{ if(name.trim()) {setCreate({...create, participants:[...create.participants,name.trim()]}); setName('')} }; return <><h2>Hvem blir med?</h2><p className="lead">Du kan invitere flere senere</p><div className="memberList">{create.participants.map(p=><div className="member" key={p}><Avatar name={p}/><b>{p}</b><button onClick={()=>setCreate({...create, participants:create.participants.filter(x=>x!==p)})}>Fjern</button></div>)}</div><div className="addRow"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Navn på deltaker"/><button onClick={add}>Legg til</button></div></> }
function Field({label,value,onChange,type='text',placeholder=''}){ return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label> }

function TripShell(props){ const {trip,setView,tab,setTab,mer,setMer} = props; return <section className="screen tripScreen"><TopLine title={trip.title} subtitle={`${trip.date} · ${trip.members} deltakere`} onBack={()=>setView('trips')}/><div className="content tripContent">
  {tab==='na' && <NowView {...props}/>} {tab==='plan' && <PlanView {...props}/>} {tab==='pakk' && <PackingView {...props}/>} {tab==='utlegg' && <ExpensesView {...props}/>} {tab==='mer' && <MoreView {...props}/>} 
  </div><nav className="bottomNav">{tabs.map(([id,Icon,label])=><button key={id} onClick={()=>{setTab(id); if(id==='mer') setMer('list')}} className={tab===id?'active':''}><Icon size={20}/><span>{label}</span></button>)}</nav></section> }
function TopLine({title,subtitle,onBack}){ return <header className="topLine"><button onClick={onBack}><ChevronLeft size={19}/></button><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></header> }

function NowView({events,packing,expenses,members}){ const next=events[0]; return <><div className="hero"><small>Neste nå</small><h2>{next?.title || 'Ingen hendelser ennå'}</h2><div className="stats"><div><b>{next?.time || '—'}</b><span>Starter</span></div><div><b>{next?.type==='match'?'12:00':'—'}</b><span>Oppmøte</span></div><div><b>{next?.place || '—'}</b><span>Sted</span></div></div><p>{next?.note || 'Legg inn første planpunkt for å aktivere Nå-skjermen.'}</p><div className="heroBtns"><button>Åpne kart</button><button>Vis dokumenter</button></div></div><h2 className="sectionTitle">Viktige varsler</h2><div className="alerts"><Alert color="yellow" text={`${packing.filter(p=>!p.packed).length} pakkepunkter mangler`}/><Alert color="blue" text={`${expenses.length} utlegg er registrert`}/><Alert color="red" text="Hotellbooking bør lastes ned før avreise"/></div><h2 className="sectionTitle">Dagens oversikt</h2><div className="timeline">{events.slice(0,4).map(e=><div key={e.id}><b>{e.time}</b><span>{e.title}</span></div>)}{!events.length && <p>Ingen hendelser lagt inn ennå.</p>}</div></> }
function Alert({color,text}){ return <div className={`alert ${color}`}><span></span>{text}</div> }
function PlanView({events}){ const [open,setOpen]=useState(null); const days=[...new Set(events.map(e=>e.day))]; return <>{!events.length && <Empty title="Ingen planpunkter" text="Legg inn fly, hotell, aktivitet eller oppmøte." action="Legg til planpunkt"/>}{days.map(day=><div key={day}><h2 className="dayTitle">{day}</h2>{events.filter(e=>e.day===day).map(e=><EventCard key={e.id} event={e} open={open===e.id} onClick={()=>setOpen(open===e.id?null:e.id)}/>)}</div>)}</> }
function EventCard({event,open,onClick}){ const Icon=iconMap[event.type] || CalendarDays; return <button className="eventCard" onClick={onClick}><div className="eventTop"><span className="iconTile"><Icon size={18}/></span><div><h3>{event.title}</h3><p>{event.time} · {event.place}</p></div><b className="status">{event.status}</b></div>{open && <div className="eventDetails"><p>{event.note}</p>{event.document && <small>Dokument: {event.document}</small>}<div><span>Rediger</span><span>Åpne kart</span></div></div>}</button> }

function PackingView({members,packing,setPacking}){ const [filter,setFilter]=useState('Alle'); const [adding,setAdding]=useState(false); const [title,setTitle]=useState(''); const [category,setCategory]=useState(categories[0]); const visible = packing.filter(p => filter==='Alle' || (filter==='Mangler'&&!p.packed) || (filter==='Pakket'&&p.packed) || (filter==='Må kjøpes'&&p.mustBuy)); const add=()=>{ if(title.trim()){ setPacking([...packing,{id:`p${Date.now()}`,title,category,assignedTo:null,packed:false,mustBuy:false}]); setTitle(''); setAdding(false)} }; const addStd=()=>{ const names=['Drakt','Shorts','Strømper','Leggskinn','Fotballsko','Vannflaske','Håndkle','Sitteunderlag','Regntøy','Powerbank']; const existing=new Set(packing.map(p=>p.title)); setPacking([...packing,...names.filter(n=>!existing.has(n)).map((n,i)=>({id:`std-${Date.now()}-${i}`, title:n, category:'Sport/cup', assignedTo:null, packed:false, mustBuy:false}))]) }; return <><div className="chips">{['Alle','Mangler','Pakket','Må kjøpes'].map(c=><button className={filter===c?'active':''} onClick={()=>setFilter(c)} key={c}>{c}</button>)}</div>{!packing.length && <Empty title="Pakkelisten er tom" text="Legg til det dere må huske, eller start med en standardliste." action="Bruk standardliste" onAction={addStd}/>} {packing.length>0 && <><h2 className="sectionTitle">Felles pakkeliste</h2>{visible.filter(p=>!p.assignedTo).map(p=><PackRow key={p.id} item={p} setPacking={setPacking} packing={packing}/>) }{members.map(m=>{ const rows=visible.filter(p=>p.assignedTo===m.id); return rows.length ? <div key={m.id}><h2 className="sectionTitle">{m.name}</h2>{rows.map(p=><PackRow key={p.id} item={p} setPacking={setPacking} packing={packing}/>)}</div> : null })}<button className="dashed" onClick={()=>setAdding(true)}><Plus size={18}/> Legg til punkt</button>{adding && <div className="inlineForm"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Hva må pakkes?"/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><div><button onClick={()=>setAdding(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</>}</> }
function PackRow({item,packing,setPacking}){ return <button className="packRow" onClick={()=>setPacking(packing.map(p=>p.id===item.id?{...p,packed:!p.packed}:p))}><span className={item.packed?'checked':''}>{item.packed?'✓':''}</span><div><b className={item.packed?'done':''}>{item.title}</b><small>{item.category}</small></div>{item.mustBuy && <em>Må kjøpes</em>}</button> }
function ExpensesView({members,expenses,setExpenses}){ const [settlement,setSettlement]=useState(false); const total=expenses.reduce((s,e)=>s+e.amount,0); if(settlement) return <SettlementView members={members} expenses={expenses} back={()=>setSettlement(false)}/>; return <><button className="summary" onClick={()=>setSettlement(true)}><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><em>Se oppgjør →</em></button>{!expenses.length && <Empty title="Ingen utlegg ennå" text="Når noen betaler for noe på turen, legger dere det inn her." action="Legg til utlegg"/>}{expenses.map(e=><ExpenseCard key={e.id} e={e} members={members}/>) }<AddExpense members={members} expenses={expenses} setExpenses={setExpenses}/></> }
function ExpenseCard({e,members}){ return <div className="expense"><div><h3>{e.title}</h3><b>{formatMoney(e.amount)}</b></div><p>Betalt av {members.find(m=>m.id===e.paidBy)?.name} · Delt mellom {e.participants.length} personer</p><span>{e.category}</span><em>{e.status}</em></div> }
function AddExpense({members,expenses,setExpenses}){ const [open,setOpen]=useState(false), [title,setTitle]=useState(''), [amount,setAmount]=useState(''), [paidBy,setPaidBy]=useState(members[0]?.id); const add=()=>{ if(title && Number(amount)){ setExpenses([...expenses,{id:`e${Date.now()}`,title,amount:Number(amount),paidBy,participants:members.slice(0,Math.min(5,members.length)).map(m=>m.id),category:'Annet',status:'Ikke oppgjort'}]); setOpen(false); setTitle(''); setAmount('') } }; return <>{!open && <button className="dashed" onClick={()=>setOpen(true)}><Plus size={18}/> Legg til utlegg</button>}{open && <div className="inlineForm"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Hva ble betalt?"/><input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Beløp" type="number"/><select value={paidBy} onChange={e=>setPaidBy(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><div><button onClick={()=>setOpen(false)}>Avbryt</button><button onClick={add}>Legg til</button></div></div>}</> }
function SettlementView({members,expenses,back}){ const rows=computeSettlements(expenses,members); const total=expenses.reduce((s,e)=>s+e.amount,0); const name=id=>members.find(m=>m.id===id)?.name || id; return <><button className="backRow" onClick={back}>← Utlegg</button><div className="summary split"><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><div><span>Per person</span><b>{formatMoney(total / Math.max(1,members.length))}</b></div></div><h2 className="sectionTitle">Oppgjør</h2>{rows.length ? rows.map((r,i)=><div className="settlement" key={i}><span>{name(r.from)} skal betale {name(r.to)}</span><b>{formatMoney(r.amount)}</b></div>) : <div className="empty success">Alt er gjort opp!</div>}<div className="two"><button className="secondary">Kopier Vipps-tekst</button><button className="secondary">Eksporter</button></div></> }

function MoreView(props){ const {mer,setMer,trip} = props; if(mer==='list') return <div className="moreList">{[['dokumenter',FileText,'Dokumenter'],['bilder',Camera,'Bilder'],['deltakere',Users,'Deltakere'],...(trip.type==='cup'?[['kamper',Trophy,'Kamper']]:[]),['innstillinger',Settings,'Innstillinger']].map(([id,Icon,label])=><button key={id} onClick={()=>setMer(id)}><Icon size={20}/><span>{label}</span><b>›</b></button>)}</div>; return <SubScreen {...props}/> }
function SubScreen(props){ const {mer,setMer,members,expenses,matches,setMatches,packing}=props; const rows=computeSettlements(expenses,members); const balance = id => rows.filter(r=>r.to===id).reduce((s,r)=>s+r.amount,0)-rows.filter(r=>r.from===id).reduce((s,r)=>s+r.amount,0); return <><button className="backRow" onClick={()=>setMer('list')}>← Mer</button>{mer==='dokumenter' && <DocScreen/>}{mer==='bilder' && <PhotoScreen/>}{mer==='deltakere' && <><div className="titleRow"><h2>Deltakere</h2><button>+ Inviter</button></div>{members.map(m=><div className="member card" key={m.id}><Avatar name={m.name}/><div><b>{m.name}</b><small>{m.role} · Pakket {packing.filter(p=>p.assignedTo===m.id && p.packed).length}/{packing.filter(p=>p.assignedTo===m.id).length}</small></div><em className={balance(m.id)<0?'red':'green'}>{balance(m.id)===0?'Oppgjort':balance(m.id)>0?`Til gode ${formatMoney(balance(m.id))}`:`Skylder ${formatMoney(-balance(m.id))}`}</em></div>)}</>}{mer==='kamper' && <><h2>Kamper</h2>{matches.map(m=><div className="match" key={m.id}><div><h3>Sarpsborg FK – {m.opponent}</h3><b>{m.status}</b></div><section><span><b>{m.start}</b>Kampstart</span><span><b>{m.meetup}</b>Oppmøte</span><span><b>{m.venue}</b>Bane</span></section><p>Drakt: {m.kit}</p><button onClick={()=>setMatches(matches.map(x=>x.id===m.id?{...x,status:'Ferdig',result:'Registrert'}:x))}>Legg inn resultat</button></div>)}</>}{mer==='innstillinger' && <><h2>Innstillinger</h2><div className="card info"><p><b>Turnavn</b><span>Danmark Cup 2027</span></p><p><b>Invitasjonskode</b><span>DK-CUP-2027</span></p><p><b>Din rolle</b><span>Eier</span></p></div><button className="danger">Slett tur</button></>}</> }
function DocScreen(){ return <><h2>Dokumenter</h2>{documents.map(d=><div className="doc card" key={d}><FileText size={20}/><div><b>{d}</b><small>PDF · Gjelder: Alle</small></div></div>)}<button className="dashed"><Plus size={18}/> Last opp dokument</button></> }
function PhotoScreen(){ return <><h2>Bilder</h2><div className="photoGrid">{photos.map(p=><div className="photo" key={p}>{p}</div>)}</div><button className="dashed"><Plus size={18}/> Last opp bilde</button></> }
function Empty({title,text,action,onAction}){ return <div className="empty"><h3>{title}</h3><p>{text}</p>{action && <button onClick={onAction}>{action}</button>}</div> }
function Avatar({name}){ return <span className="avatar">{initials(name)}</span> }

createRoot(document.getElementById('root')).render(<App />)
