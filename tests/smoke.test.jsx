import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/supabase', () => ({ supabase: null }))
vi.mock('../src/lib/locationSearch', () => ({
  searchLocations: vi.fn(async (query) => [{
    id: 'node-123',
    name: 'Lillehammer',
    displayName: 'Lillehammer, Innlandet, Norge',
    shortAddress: 'Innlandet, Norge',
    type: 'city',
    lat: 61.115,
    lon: 10.466,
    boundingbox: ['61.0', '61.2', '10.3', '10.6'],
    osmType: 'node',
    osmId: 123,
    source: 'OpenStreetMap'
  }])
}))

import { App } from '../src/main.jsx'

async function renderApp(){
  const user = userEvent.setup()
  render(<App testMode />)
  await waitFor(() => expect(screen.queryByText('Samler reisen din')).toBeFalsy(), { timeout: 3000 })
  return user
}

async function setToggles(user, wanted){
  for(const [label, on] of Object.entries(wanted)){
    const row = screen.getByText(label).closest('.toggleRow')
    const knob = row.querySelector('b')
    const isOn = knob.className.includes('on')
    if(isOn !== on) await user.click(row)
  }
}

async function clickNav(user, label){
  await user.click(screen.getAllByRole('button', { name: new RegExp(`^${label}$`) })[0])
}

async function createTrip(user, { type = 'Familietur', name = 'Testtur' } = {}){
  await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
  await user.click(screen.getByRole('button', { name: new RegExp(type) }))
  await user.type(screen.getByPlaceholderText(/Sommerferie i Danmark/), name)
  await user.type(screen.getByPlaceholderText('F.eks. 7'), '4')
  await user.click(screen.getByRole('button', { name: /Opprett og last opp dokumenter/ }))
  await screen.findByText('Start med dokumentene')
  await clickNav(user, 'Nå')
  await screen.findByText('Reise og opphold')
}

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
})

afterEach(() => cleanup())

describe('Travelvault testmodus', () => {
  it('viser tom starttilstand', async () => {
    await renderApp()
    expect(screen.getByText('Ingen turer ennå')).toBeTruthy()
  })

  it('familiehjem: handleliste, chat og kalender kan brukes', async () => {
    const user = await renderApp()
    expect(screen.getByText('Familie, hverdag og reiser samlet')).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: /Handleliste/ })[0])
    await user.type(screen.getByPlaceholderText(/Skriv f.eks. melk/), 'Melk')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(await screen.findByText('Melk')).toBeTruthy()
    await clickNav(user, 'Hjem')

    await user.click(screen.getAllByRole('button', { name: /Chat|Familiechat/ })[0])
    await user.type(screen.getByPlaceholderText('Skriv melding til familien'), 'Henter etter trening')
    await user.click(screen.getByRole('button', { name: 'Send melding' }))
    expect(await screen.findByText('Henter etter trening')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Tilbake fra Chat/ }))

    await user.click(screen.getAllByRole('button', { name: /Kalender/ })[0])
    await user.click(screen.getByRole('button', { name: 'Legg til avtale' }))
    await user.type(screen.getByPlaceholderText('Tittel, f.eks. Trening'), 'Fotballtrening')
    await user.type(screen.getByPlaceholderText('Hvem gjelder det?'), 'Ola')
    await user.click(screen.getByRole('button', { name: 'Lagre avtale' }))
    expect(await screen.findByText('Fotballtrening')).toBeTruthy()
  })

  it('familiehjem: må-ordnes kan brukes', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Må ordnes/ })[0])
    await user.type(screen.getByPlaceholderText('Hva må ordnes?'), 'Bestill passbilder')
    await user.type(screen.getByPlaceholderText('Hvem gjelder det?'), 'Ola')
    await user.click(screen.getByRole('button', { name: 'Legg til oppgave' }))
    expect(await screen.findByText('Bestill passbilder')).toBeTruthy()
    await clickNav(user, 'Hjem')
    expect(screen.getByText('Familie, hverdag og reiser samlet')).toBeTruthy()
  })

  it('kalender: importerer Spond/iCal-fil', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Kalender/ })[0])
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:spond-demo-1
DTSTART:20260710T180000
DTEND:20260710T193000
SUMMARY:Fotballtrening
LOCATION:Klubbhuset
DESCRIPTION:Ta med drikkeflaske
END:VEVENT
END:VCALENDAR`
    await user.upload(screen.getByLabelText('Velg .ics-fil'), new File([ics], 'spond-trening.ics', { type: 'text/calendar' }))
    expect(await screen.findByText('Fotballtrening')).toBeTruthy()
    expect(screen.getByText(/1 av 1 avtaler importert/)).toBeTruthy()
  })

  it('pakk: må-kjøpes kan sendes til felles handleliste', async () => {
    const user = await renderApp()
    await createTrip(user, { type: 'Cup', name: 'Handlecup' })
    await clickNav(user, 'Pakk')
    const row = await screen.findByText('Drakt')
    await user.click(within(row.closest('.packRow')).getByRole('button', { name: 'Må kjøpes' }))
    await user.click(screen.getByRole('button', { name: /Send 1 til handlelisten/ }))
    expect(await screen.findByText('1 punkt lagt i felles handleliste.')).toBeTruthy()
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('travelvault-test-state-v2') || '{}')
      expect(saved.household.shopping.some(item => item.title === 'Drakt' && item.source === 'trip')).toBe(true)
    })
  })

  it('oppretter tur via veiviseren med kartsøk', async () => {
    const user = await renderApp()
    await createTrip(user)
    expect(screen.getAllByText(/Testtur/).length).toBeGreaterThan(0)
  })

  it('oppretter tur med manuelt sted', async () => {
    const user = await renderApp()
    await createTrip(user, { name: 'Manuell tur' })
    expect(screen.getAllByText(/Manuell tur/).length).toBeGreaterThan(0)
  })

  it('validerer at lengde må fylles ut', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
    await user.click(screen.getByRole('button', { name: /Familietur/ }))
    await user.type(screen.getByPlaceholderText(/Sommerferie i Danmark/), 'Datotest')
    expect(screen.getByText('Legg inn hvor mange dager turen varer.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Opprett og last opp dokumenter/ }).disabled).toBe(true)
  })

  it('plan: legger til, redigerer og fjerner planpunkt', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Plan')
    await user.click(screen.getAllByRole('button', { name: /Legg til planpunkt/ })[0])
    await user.type(screen.getByPlaceholderText('Tittel'), 'Middag på Nikkers')
    await user.type(screen.getByPlaceholderText('Sted'), 'Nikkers')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(screen.getByText('Middag på Nikkers')).toBeTruthy()
    // åpne detaljer
    await user.click(screen.getByText('Middag på Nikkers'))
    expect(screen.getByRole('button', { name: 'Rediger' })).toBeTruthy()
  })

  it('pakk: standardliste, avhaking og filter', async () => {
    const user = await renderApp()
    await createTrip(user, { type: 'Cup', name: 'Cuppakk' })
    await clickNav(user, 'Pakk')
    expect(await screen.findByText('Drakt')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Fyll på standardliste/ })).toBeFalsy()
    // hak av første punkt
    const row = screen.getByText('Drakt').closest('.packRow')
    await user.click(within(row).getByRole('button', { name: 'Marker som pakket: Drakt' }))
    await user.click(screen.getByRole('button', { name: 'Pakket' }))
    expect(screen.getByText('Drakt')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mangler' }))
    expect(screen.queryByText('Drakt')).toBeFalsy()
  })

  it('pakk: oppretter egen pakkeliste', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Pakk')
    await user.click(screen.getByRole('button', { name: 'Ny liste' }))
    await user.type(screen.getByPlaceholderText('Navn på pakkeliste'), 'Hytta')
    await user.type(screen.getByPlaceholderText(/Ett punkt per linje/), 'Pute{enter}Egg')
    await user.click(screen.getByRole('button', { name: 'Opprett' }))
    expect(await screen.findByText('Pute')).toBeTruthy()
    expect(screen.getByText('Egg')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Hytta' })).toBeTruthy()
  })

  it('utlegg: tomtilstandens "Legg til utlegg"-knapp åpner skjema (BUG hvis feiler)', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Utlegg')
    const empty = screen.getByText('Ingen utlegg ennå').closest('.empty')
    const emptyButton = within(empty).queryByRole('button', { name: 'Legg til utlegg' })
    expect(emptyButton, 'Tomtilstanden mangler fungerende Legg til utlegg-knapp').toBeTruthy()
    await user.click(emptyButton)
    expect(screen.getByPlaceholderText('Hva ble betalt?')).toBeTruthy()
  })

  it('utlegg: legger til utlegg og ser oppgjør', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Utlegg')
    await user.click(screen.getAllByRole('button', { name: /Legg til utlegg/ })[0])
    await user.type(screen.getByPlaceholderText('Hva ble betalt?'), 'Pizza')
    await user.type(screen.getByPlaceholderText('Beløp'), '500')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(screen.getByText('Pizza')).toBeTruthy()
    expect(screen.getAllByText('500 kr').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Se oppgjør/ }))
    expect(screen.getByText('Oppgjør')).toBeTruthy()
  })

  it('mer: dokumentlesing lagrer ikke fil og bilder kan legges til', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Dokumenter/ }))
    await user.click(screen.getAllByRole('button', { name: /Les dokument/ })[0])
    const hotelText = `Bestillingsopplysninger
Scandic Lillehammer Hotel
Turisthotelvegen 6, Lillehammer, 2609 Norge
Innsjekking: 10. jul. 2026
Utsjekking: 12. jul. 2026
1 rom x 2 netter`
    const hotel = new File([hotelText], 'hotel-booking-kobenhavn.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Velg fil'), hotel)
    await screen.findByText('Reise og opphold')
    expect(screen.getAllByText(/Scandic Lillehammer Hotel/).length).toBeGreaterThan(0)
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Dokumenter/ }))
    expect(screen.getByText('Ingen dokumenter')).toBeTruthy()
    expect(screen.queryByText('hotel booking kobenhavn')).toBeFalsy()
    await user.click(screen.getByRole('button', { name: '← Mer' }))
    await user.click(screen.getByRole('button', { name: /Bilder/ }))
    await user.click(screen.getAllByRole('button', { name: /Legg til bilde/ })[0])
    await user.type(screen.getByPlaceholderText(/Bildetekst/), 'Hoppbakken')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(screen.getByText('Hoppbakken')).toBeTruthy()
  })

  it('mer: deltakere kan legges til og fjernes med opprydding i utlegg', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Deltakere/ }))
    await user.type(screen.getByPlaceholderText('Navn på deltaker'), 'Kari')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(await screen.findByText('Kari')).toBeTruthy()
  })

  it('kamper: cup-tur har kampmeny og kan registrere kamp', async () => {
    const user = await renderApp()
    await createTrip(user, { type: 'Cup', name: 'Cuptur' })
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Kamper/ }))
    await user.click(screen.getAllByRole('button', { name: /Legg til kamp/ })[0])
    await user.type(screen.getByPlaceholderText('Motstander'), 'Fredrikstad')
    await user.click(screen.getByRole('button', { name: 'Legg til' }))
    expect(screen.getByText(/Fredrikstad/)).toBeTruthy()
  })

  it('innstillinger: rediger tur endrer tittel', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Innstillinger/ }))
    await user.click(screen.getByRole('button', { name: 'Rediger tur' }))
    const titleInput = screen.getByPlaceholderText(/Familietur til Lillehammer/)
    await user.clear(titleInput)
    await user.type(titleInput, 'Nytt navn')
    await user.click(screen.getByRole('button', { name: 'Lagre endringer' }))
    await waitFor(() => expect(screen.getAllByText(/Nytt navn/).length).toBeGreaterThan(0))
  })

  it('innstillinger: sletting med bekreftelse fjerner turen', async () => {
    const user = await renderApp()
    await createTrip(user)
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Innstillinger/ }))
    await user.click(screen.getByRole('button', { name: 'Slett tur' }))
    const confirm = document.querySelector('.deleteConfirm')
    await user.click(within(confirm).getByRole('button', { name: 'Slett tur' }))
    expect(await screen.findByText('Ingen turer ennå')).toBeTruthy()
  })

  it('familie: legge til, invitere (simulert) og bruke i ny tur', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: /Min familie/ }))
    await user.type(screen.getByPlaceholderText('Navn'), 'Ola')
    await user.type(screen.getByPlaceholderText('E-post for invitasjon'), 'ola@epost.no')
    await user.click(screen.getByRole('button', { name: 'Legg til i familie' }))
    expect(await screen.findByText('Ola')).toBeTruthy()
    const familySearch = screen.getByRole('textbox', { name: 'Søk familie' })
    await user.type(familySearch, 'ola@epost.no')
    expect(screen.getByText('Ola')).toBeTruthy()
    await user.clear(familySearch)
    await user.type(familySearch, 'finnes ikke')
    expect(screen.getByText('Ingen treff')).toBeTruthy()
    await clickNav(user, 'Reiser')
    await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
    await user.click(screen.getByRole('button', { name: /Familietur/ }))
    await user.type(screen.getByPlaceholderText(/Sommerferie i Danmark/), 'Med familie')
    await user.type(screen.getByPlaceholderText('F.eks. 7'), '5')
    await user.click(screen.getByRole('button', { name: /Opprett og last opp dokumenter/ }))
    expect(await screen.findByText('Start med dokumentene')).toBeTruthy()
  })

  it('invitasjonskode: bli med på lokal tur', async () => {
    const user = await renderApp()
    await createTrip(user)
    // finn koden i innstillinger
    await clickNav(user, 'Mer')
    await user.click(screen.getByRole('button', { name: /Innstillinger/ }))
    const codeRow = screen.getByText('Invitasjonskode').closest('p')
    const code = within(codeRow).getByText(/^[A-Z0-9]{6}$/).textContent
    // tilbake til turliste
    await user.click(screen.getAllByRole('button')[0]) // tilbakeknapp i topline
    await user.click(screen.getByRole('button', { name: /Bli med via invitasjonskode/ }))
    await user.type(screen.getByPlaceholderText('Invitasjonskode'), code)
    await user.click(screen.getByRole('button', { name: 'Bli med' }))
    expect(await screen.findByText('Reise og opphold')).toBeTruthy()
  })

  it('lagrer tilstand fra localStorage', async () => {
    const user = await renderApp()
    await createTrip(user, { name: 'Varig tur' })
    expect(window.localStorage.getItem('travelvault-test-state-v2')).toContain('Varig tur')
    expect(window.localStorage.getItem('travelvault-test-state-v1')).toBeNull()
  })

  it('opprettelse: starter tomt og sender brukeren til dokumentimport', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
    await user.click(screen.getByRole('button', { name: /Familietur/ }))
    await user.type(screen.getByPlaceholderText(/Sommerferie i Danmark/), 'Seedtur')
    await user.type(screen.getByPlaceholderText('F.eks. 7'), '6')
    await user.click(screen.getByRole('button', { name: /Opprett og last opp dokumenter/ }))
    expect(await screen.findByText('Start med dokumentene')).toBeTruthy()
    expect(screen.queryByText(/Ankomst/)).toBeFalsy()
    await clickNav(user, 'Pakk')
    expect(await screen.findByText('Pass/ID')).toBeTruthy()
  })

  it('dokumentimport: legger Hotels.com og inngangsbillett direkte inn i turen', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
    await user.click(screen.getByRole('button', { name: /Familietur/ }))
    await user.type(screen.getByPlaceholderText(/Sommerferie i Danmark/), 'Dokumenttur')
    await user.type(screen.getByPlaceholderText('F.eks. 7'), '4')
    await user.click(screen.getByRole('button', { name: /Opprett og last opp dokumenter/ }))
    await screen.findByText('Start med dokumentene')
    await user.click(screen.getAllByRole('button', { name: /Les dokument/ })[0])
    const staleHotel = new File([''], 'no.hotels.com-72074282776328.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Velg fil'), staleHotel)
    expect(await screen.findByText(/Fant ikke lesbare reisedetaljer/)).toBeTruthy()
    expect(screen.queryByText(/Lagt inn fra no\.hotels\.com/i)).toBeFalsy()
    expect(screen.queryByText('Neste nå')).toBeFalsy()
    await user.click(screen.getAllByRole('button', { name: /Velg fil/ })[0])
    const hotelText = `Kvittering
Reiserutenr. hos Hotels.com: 72074282776328
Bestillingsopplysninger
Scandic Lillehammer Hotel
Turisthotelvegen 6, Lillehammer, 2609 Norge
Innsjekking: 10. jul. 2026
Utsjekking: 12. jul. 2026
1 rom x 2 netter`
    const hotel = new File([hotelText], 'no.hotels.com-72074282776328.pdf', { type: 'application/pdf' })
    const entranceTicket = new File(['1 dag Hunderfossen Eventyrpark\nBesøksdato: 11.07.2026'], 'Ticket.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Velg fil'), [hotel, entranceTicket])
    await screen.findByText('Reise og opphold')
    expect(screen.getAllByText(/Scandic Lillehammer Hotel/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Turisthotelvegen 6/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2 netter/).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/no\.hotels\.com/i).length).toBe(0)
    expect(screen.getAllByText(/Lillehammer/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Inngangsbillett/).length).toBeGreaterThan(0)
  })

  it('cup-tur viser kampmeny uten ekstra startsteg', async () => {
    const user = await renderApp()
    await createTrip(user, { type: 'Cup', name: 'Featuretur' })
    await clickNav(user, 'Mer')
    expect(screen.getByRole('button', { name: /Kamper/ })).toBeTruthy()
  })

  it('hurtigoppretting har ikke gammel femstegsveiviser', async () => {
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: /Opprett ny tur/ })[0])
    expect(screen.getByText('Hva slags tur?')).toBeTruthy()
    expect(screen.queryByPlaceholderText(/Sommerferie i Danmark/)).toBeFalsy()
    await user.click(screen.getByRole('button', { name: /Familietur/ }))
    expect(screen.getByText(/Lag familieturen først/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/Sommerferie i Danmark/)).toBeTruthy()
    expect(screen.queryByText('Startinnhold')).toBeFalsy()
    expect(screen.queryByRole('button', { name: 'Neste' })).toBeFalsy()
  })
})
