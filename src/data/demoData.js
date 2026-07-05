export const demoTrips = [
  { id:'danmark-cup-2027', title:'Danmark Cup 2027', type:'cup', date:'12.–16. juni', location:'København', members:8, status:'Pågår', next:'Kamp mot Hillerød kl. 12:40' },
  { id:'italia-2027', title:'Italia sommerferie', type:'family', date:'3.–14. juli', location:'Roma', members:4, status:'Kommende', next:'Fly Oslo–Roma' },
  { id:'sverige-2025', title:'Sverige høsttur 2025', type:'family', date:'4.–6. oktober', location:'Gøteborg', members:6, status:'Tidligere', next:'Turen er avsluttet' }
]
export const initialMembers = [
  { id:'morten', name:'Morten', role:'Eier' }, { id:'thomas', name:'Thomas', role:'Deltaker' },
  { id:'andre', name:'André', role:'Deltaker' }, { id:'rune', name:'Rune', role:'Deltaker' },
  { id:'espen', name:'Espen', role:'Deltaker' }, { id:'nora', name:'Nora', role:'Barn/lesetilgang' },
  { id:'emil', name:'Emil', role:'Barn/lesetilgang' }, { id:'julie', name:'Julie', role:'Barn/lesetilgang' }
]
export const initialEvents = [
  { id:'ferry', day:'Fredag 12. juni', time:'08:30', title:'Ferge til Danmark', place:'Oslo', type:'transport', status:'Bekreftet', note:'Møt opp senest 45 minutter før avgang.', document:'Fergebilletter.pdf' },
  { id:'hotel', day:'Fredag 12. juni', time:'11:30', title:'Innsjekk hotell', place:'København', type:'hotel', status:'Bekreftet', note:'Bagasje kan settes igjen før rommene er klare.', document:'Hotellbooking.pdf' },
  { id:'match1', day:'Fredag 12. juni', time:'12:40', title:'Sarpsborg FK – Hillerød', place:'Kunstgress 3', type:'match', status:'Planlagt', note:'Oppmøte kl. 12:00. Blå drakt.', document:'Cupreglement.pdf' },
  { id:'dinner', day:'Fredag 12. juni', time:'19:00', title:'Felles middag', place:'Pizzeria Roma', type:'food', status:'Planlagt', note:'Bord er reservert til 8 personer.', document:null }
]
export const initialPacking = [
  { id:'p1', title:'Pass', category:'Dokumenter', assignedTo:null, packed:false, mustBuy:false },
  { id:'p2', title:'Drakt', category:'Sport/cup', assignedTo:'emil', packed:false, mustBuy:false },
  { id:'p3', title:'Fotballsko', category:'Sport/cup', assignedTo:'emil', packed:true, mustBuy:false },
  { id:'p4', title:'Leggskinn', category:'Sport/cup', assignedTo:'emil', packed:false, mustBuy:true },
  { id:'p5', title:'Mobillader', category:'Elektronikk', assignedTo:null, packed:false, mustBuy:false },
  { id:'p6', title:'Sitteunderlag', category:'Sport/cup', assignedTo:'morten', packed:false, mustBuy:true },
  { id:'p7', title:'Regnjakke', category:'Klær', assignedTo:null, packed:false, mustBuy:false },
]
export const initialExpenses = [
  { id:'e1', title:'Pizza første kveld', amount:1280, paidBy:'morten', participants:['morten','thomas','andre','rune'], category:'Mat og drikke', status:'Ikke oppgjort' },
  { id:'e2', title:'Parkering ved hallen', amount:180, paidBy:'thomas', participants:['morten','thomas','andre','rune'], category:'Parkering/bom', status:'Ikke oppgjort' },
  { id:'e3', title:'Frokostvarer', amount:640, paidBy:'andre', participants:['morten','thomas','andre','rune','espen'], category:'Fellesinnkjøp', status:'Ikke oppgjort' },
  { id:'e4', title:'Leiebil', amount:3200, paidBy:'rune', participants:['morten','thomas','andre','rune','espen'], category:'Transport', status:'Ikke oppgjort' },
]
export const documents = ['Hotellbooking.pdf','Fergebilletter.pdf','Cupreglement.pdf','Reiseforsikring.pdf']
export const photos = ['kampstart.jpg','hotellobby.jpg','pizza.jpg','tribune.jpg','lagbilde.jpg','ferge.jpg']
export const initialMatches = [
  { id:'k1', opponent:'Hillerød', date:'12. juni', start:'12:40', meetup:'12:00', venue:'Kunstgress 3', kit:'Blå', status:'Planlagt', result:'' },
  { id:'k2', opponent:'Køge', date:'12. juni', start:'16:20', meetup:'15:40', venue:'Bane 5', kit:'Rød', status:'Planlagt', result:'' },
  { id:'k3', opponent:'Roskilde', date:'13. juni', start:'10:00', meetup:'09:20', venue:'Hall B', kit:'Blå', status:'Planlagt', result:'' },
]
