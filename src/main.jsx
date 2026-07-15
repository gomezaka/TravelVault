import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bell, CalendarDays, Camera, ChevronLeft, ClipboardList, ExternalLink, FileText, Home, ListChecks, LogOut, Mail, MessageSquare, MoreHorizontal, PiggyBank, Plus, Search, Settings, Trash2, Trophy, Upload, UserCircle, UserPlus, Users, MapPin, Plane, Hotel, Ship, Utensils, RefreshCw, Car, Bus, TrainFront } from 'lucide-react'
import { supabase } from './lib/supabase'
import { addTripMemberToTrip, createTripDocumentSignedUrl, createTripWithMembers, deleteFamilyMember, deleteTripById, deleteTripDocumentById, fetchDocumentsForTrip, fetchFamilyMembersForUser, fetchMembersForTrip, fetchTripsForUser, fetchUserAppState, inviteFamilyMember, saveFamilyMember, updateTripAppState, updateTripDetails, updateTripDocumentMetadata, updateUserAppState } from './lib/tripRepository'
import { searchLocations } from './lib/locationSearch'
import { GOOGLE_CALENDAR_SCOPE, fetchGoogleCalendarEvents, fetchGoogleCalendars, googleCalendarConfig } from './lib/googleCalendar'
import { acceptHouseholdInvite, deleteHouseholdMember, fetchHouseholdData, isMissingHouseholdTablesError, saveHouseholdData, subscribeToHouseholdData } from './lib/householdRepository'
import './styles/app.css'



let pdfjsModulePromise = null
async function getPdfjs(){
  if(!pdfjsModulePromise){
    pdfjsModulePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default || worker
      return pdfjs
    })
  }
  return pdfjsModulePromise
}

const iconMap = { transport: Ship, ferry: Ship, boat: Ship, car: Car, bus: Bus, train: TrainFront, hotel: Hotel, match: Trophy, food: Utensils, activity: MapPin, flight: Plane, other: MapPin }
const navIconSymbols = {
  na: '\u{1F3E0}',
  plan: '\u{1F5D3}\uFE0F',
  pakk: '\u{1F392}',
  utlegg: '\u{1F4B3}',
  mer: '\u2026',
  chat: '\u{1F4AC}',
  dokumenter: '\u{1F4C4}',
  bilder: '\u{1F4F7}',
  deltakere: '\u{1F465}',
  kamper: '\u{1F3C6}',
  innstillinger: '\u2699\uFE0F'
}
const tabs = [
  ['na', Home, 'Nå'],
  ['plan', CalendarDays, 'Plan'],
  ['pakk', ListChecks, 'Pakk'],
  ['utlegg', PiggyBank, 'Utlegg'],
  ['mer', MoreHorizontal, 'Mer']
]
const familyNavItems = [
  ['home', Home, 'Hjem'],
  ['trips', Plane, 'Reiser'],
  ['tasks', ClipboardList, 'Gjøremål'],
  ['calendar', CalendarDays, 'Kalender'],
  ['profile', UserCircle, 'Profil']
]
const familyNavViews = new Set(['home', 'calendar', 'shopping', 'tasks', 'familyChat', 'trips', 'family', 'profile'])
const categories = ['Dokumenter', 'Klær', 'Hygiene', 'Elektronikk', 'Medisin', 'Mat/snacks', 'Søvn/overnatting', 'Barn', 'Diverse']
const emptyTripContent = { members: [], events: [], packing: [], expenses: [], matches: [], messages: [] }
const authExplicitlyDisabled = import.meta.env.VITE_ENABLE_AUTH === 'false'
const localTestModeEnabled = authExplicitlyDisabled && import.meta.env.DEV
const authEnabled = Boolean(supabase) && !authExplicitlyDisabled
const googleAuthEnabled = authEnabled && import.meta.env.VITE_DISABLE_GOOGLE_AUTH !== 'true'
const testStateKey = 'travelvault-test-state-v2'
const customPackingTemplatesKey = 'travelvault-packing-templates-v1'
const pendingHouseholdInviteKey = 'travelvault-pending-household-invite'
const activeHouseholdIdKey = 'travelvault-active-household-id'
const googleCalendarProviderTokenKey = 'travelvault-google-calendar-provider-token'
const legacyTestStateKeys = ['travelvault-test-state-v1']
const legacyDemoTripIds = new Set(['danmark-cup-2027', 'italia-2027', 'sverige-2025'])
const legacyDemoTripTitles = new Set(['Danmark Cup 2027', 'Italia sommerferie', 'Sverige høsttur 2025'])

const documentTypeOptions = [
  ['flight', 'Flybillett'],
  ['hotel', 'Hotellbestilling'],
  ['excursion', 'Utflukt/aktivitet'],
  ['receipt', 'Kvittering'],
  ['ferry', 'Båt/ferge'],
  ['car', 'Bil/leiebil'],
  ['train', 'Tog'],
  ['bus', 'Buss'],
  ['id', 'Pass/ID'],
  ['insurance', 'Forsikring'],
  ['other', 'Annet']
]
const documentHints = {
  flight: ['flightnummer', 'avreise', 'ankomst', 'dato', 'klokkeslett', 'bookingreferanse'],
  hotel: ['hotellnavn', 'adresse', 'innsjekk', 'utsjekk', 'bookingnummer'],
  excursion: ['møtested', 'dato', 'klokkeslett', 'arrangør', 'bookingreferanse'],
  receipt: ['beløp', 'dato', 'betalingssted', 'valuta', 'hvem som betalte'],
  ferry: ['avgang', 'ankomst', 'kai', 'billettnummer', 'kjøretøy'],
  car: ['hentested', 'leveringssted', 'dato', 'klokkeslett', 'registreringsnummer'],
  train: ['tognummer', 'avgang', 'ankomst', 'sete', 'billettnummer'],
  bus: ['rute', 'avgang', 'ankomst', 'holdeplass', 'billettnummer'],
  id: ['navn', 'gyldighet', 'dokumentnummer'],
  insurance: ['polisenummer', 'kontaktinfo', 'dekning', 'periode'],
  other: ['dato', 'sted', 'referanse', 'viktig informasjon']
}
const supportedDocumentExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif']
const supportedDocumentMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
const documentFileAccept = [
  '.pdf',
  '.doc',
  '.docx',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/*',
  '.heic',
  '.heif'
].join(',')

function formatMoney(n){ return `${Math.round(n).toLocaleString('nb-NO')} kr` }
function AppNavIcon({ id, className = '' }){
  const classes = ['navEmojiIcon', className].filter(Boolean).join(' ')
  return <span className={classes} aria-hidden="true">{navIconSymbols[id] || '\u2022'}</span>
}
function parseReceiptAmount(text = ''){
  const source = normalizeDocumentText(text).replace(/\u00a0/g, ' ')
  const preferred = []
  const fallback = []
  const normalize = value => {
    const cleaned = String(value || '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
    const amount = Number(cleaned)
    return Number.isFinite(amount) && amount > 0 ? amount : 0
  }
  const amountPattern = '(\\d{1,3}(?:[ .]\\d{3})*(?:[,.]\\d{2})|\\d+(?:[,.]\\d{2}))'
  source.replace(new RegExp(`(?:total|sum|beløp|amount|å\\s*betale|betalt|visa|mastercard)[^\\d]{0,35}${amountPattern}`, 'giu'), (_, value) => {
    const amount = normalize(value)
    if(amount) preferred.push(amount)
    return _
  })
  source.replace(new RegExp(`${amountPattern}\\s*(?:kr|nok|eur|usd|gbp)?`, 'giu'), (_, value) => {
    const amount = normalize(value)
    if(amount) fallback.push(amount)
    return _
  })
  const candidates = preferred.length ? preferred : fallback.filter(value => value >= 1 && value < 100000)
  return candidates.length ? Math.max(...candidates) : 0
}
function parseReceiptTitle(text = '', fileName = ''){
  const lines = normalizeDocumentText(text).split('\n').map(line => line.trim()).filter(Boolean)
  const title = lines.find(line => /[A-Za-zÆØÅæøå]{3}/.test(line) && !/kvittering|receipt|total|sum|mva|org\.?nr|terminal|bankkort|visa|mastercard/i.test(line))
  return title ? title.slice(0, 48) : (cleanFileTitle(fileName) || 'Kvittering')
}
function initials(name){ return (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() }
function documentTypeLabel(value){
  return documentTypeOptions.find(([id]) => id === value)?.[1] || 'Dokument'
}
function cleanFileTitle(fileName = ''){
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}
function fileExtension(fileName = ''){
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/)
  return match?.[0] || ''
}
function isSupportedDocumentFile(file){
  if(!file) return false
  const type = String(file.type || '').toLowerCase()
  if(type.startsWith('image/')) return true
  if(supportedDocumentMimeTypes.includes(type)) return true
  return supportedDocumentExtensions.includes(fileExtension(file.name))
}
function unsupportedDocumentFileNames(files = []){
  return files.filter(file => !isSupportedDocumentFile(file)).map(file => file.name || 'ukjent fil')
}
function normalizeDocumentText(text = ''){
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
function isPdfFile(file){
  return fileExtension(file?.name || '') === '.pdf' || String(file?.type || '').toLowerCase() === 'application/pdf'
}
function isImageFile(file){
  const type = String(file?.type || '').toLowerCase()
  return type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(fileExtension(file?.name || ''))
}
async function readPlainTextFallback(file){
  try{
    let raw = ''
    if(typeof file?.text === 'function'){
      raw = await file.text()
    }else if(typeof FileReader !== 'undefined'){
      raw = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      })
    }
    if(!raw || raw.trimStart().startsWith('%PDF')) return ''
    const text = normalizeDocumentText(raw)
    const readable = text.replace(/[^\p{L}\p{N}\s.,:;!?/()@+\-]/gu, '').length
    return text.length && readable / text.length > 0.7 ? text.slice(0, 30000) : ''
  }catch{
    return ''
  }
}
let ocrWorkerPromise = null
async function createOcrWorker(langs = 'nor+eng'){
  const { createWorker } = await import('tesseract.js')
  return createWorker(langs, 1, { logger: () => {} })
}
async function getOcrWorker(){
  if(!ocrWorkerPromise){
    ocrWorkerPromise = createOcrWorker().catch(() => {
      ocrWorkerPromise = null
      return createOcrWorker('eng')
    })
  }
  return ocrWorkerPromise
}
async function recognizeOcrSource(source){
  try{
    const worker = await getOcrWorker()
    const { data } = await worker.recognize(source)
    return normalizeDocumentText(data?.text || '')
  }catch{
    return ''
  }
}
async function fileToDataUrl(file){
  if(typeof FileReader === 'undefined') return ''
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
async function readImageOcrText(file){
  if(!isImageFile(file)) return ''
  try{
    const dataUrl = await fileToDataUrl(file)
    return dataUrl ? recognizeOcrSource(dataUrl) : ''
  }catch{
    return ''
  }
}
async function readPdfText(file){
  if(!isPdfFile(file) || typeof file?.arrayBuffer !== 'function') return ''
  try{
    const pdfjs = await getPdfjs()
    const data = new Uint8Array(await file.arrayBuffer())
    const task = pdfjs.getDocument({ data })
    const pdf = await task.promise
    const pages = []
    for(let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1){
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const parts = []
      for(const item of content.items || []){
        if(typeof item?.str === 'string') parts.push(item.str)
        if(item?.hasEOL) parts.push('\n')
      }
      pages.push(parts.join(' '))
    }
    await pdf.destroy?.()
    return normalizeDocumentText(pages.join('\n'))
  }catch(error){
    console.warn('PDF text extraction failed', error)
    return ''
  }
}
async function readPdfOcrText(file){
  if(!isPdfFile(file) || typeof file?.arrayBuffer !== 'function' || typeof document === 'undefined') return ''
  try{
    const pdfjs = await getPdfjs()
    const data = new Uint8Array(await file.arrayBuffer())
    const task = pdfjs.getDocument({ data })
    const pdf = await task.promise
    const pages = []
    const maxPages = Math.min(pdf.numPages, 6)
    for(let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1){
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if(!context) continue
      await page.render({ canvasContext: context, viewport }).promise
      const pageText = await recognizeOcrSource(canvas)
      if(pageText) pages.push(pageText)
      canvas.width = 0
      canvas.height = 0
    }
    await pdf.destroy?.()
    return normalizeDocumentText(pages.join('\n'))
  }catch(error){
    console.warn('PDF OCR extraction failed', error)
    return ''
  }
}
async function readDocumentText(file){
  if(isPdfFile(file)){
    const plainText = await readPlainTextFallback(file)
    if(plainText) return plainText
    const pdfText = await readPdfText(file)
    if(pdfText) return pdfText
    const pdfOcrText = await readPdfOcrText(file)
    if(pdfOcrText) return pdfOcrText
    return ''
  }
  if(isImageFile(file)){
    const imageOcrText = await readImageOcrText(file)
    if(imageOcrText) return imageOcrText
  }
  return readPlainTextFallback(file)
}
function documentNeedsReprocess(document){
  if(!(document?.url || document?.fileUrl)) return false
  const data = document.extractedData || {}
  if(!data) return true
  const sourceText = `${document.title || ''} ${document.fileName || ''} ${data.summary || ''}`.toLowerCase()
  const missingHotelDetails = (document.type === 'hotel' || sourceText.includes('hotels.com')) &&
    (!data.accommodationName || !data.accommodationAddress || !data.accommodationNights)
  const missingActivityDetails = (document.type === 'excursion' || sourceText.includes('ticket.pdf') || sourceText.includes('billett')) &&
    !data.activityName &&
    (/ticket|billett|inngang/i.test(sourceText))
  if(data.source === 'pdf-text' || data.source === 'ocr') return missingHotelDetails || missingActivityDetails
  const summary = `${data.summary || ''} ${data.status || ''}`.toLowerCase()
  return missingHotelDetails || missingActivityDetails || data.source === 'filename-heuristic' || summary.includes('smartforslag') || summary.includes('mulig sted') || summary.includes('forslag')
}
async function fileFromStoredDocument(document){
  let url = document.url || ''
  if(!url && document.source === 'supabase'){
    url = await createTripDocumentSignedUrl(document)
  }
  if(!url) return null
  const response = await fetch(url)
  if(!response.ok) return null
  const blob = await response.blob()
  const fileName = document.fileName || document.title || 'document.pdf'
  return new File([blob], fileName, { type: blob.type || document.mimeType || '' })
}
async function reprocessStoredDocument(document){
  const file = await fileFromStoredDocument(document)
  if(!file) return null
  const documentText = await readDocumentText(file)
  if(!documentText) return null
  const nextType = inferDocumentType(file.name, documentText)
  const provisionalTitle = suggestedDocumentTitle(file.name, nextType, document.extractedData)
  let extractedData = createDocumentInsight(file.name, nextType, provisionalTitle, documentText, { pdfWithoutText: false })
  const nextTitle = suggestedDocumentTitle(file.name, nextType, extractedData)
  if(nextTitle !== provisionalTitle){
    extractedData = createDocumentInsight(file.name, nextType, nextTitle, documentText, { pdfWithoutText: false })
  }
  const nextDocument = {
    ...document,
    title: nextTitle,
    type: nextType,
    mimeType: file.type || document.mimeType || '',
    fileSize: file.size || document.fileSize || 0,
    extractedData
  }
  if(document.source === 'supabase'){
    try{
      return await updateTripDocumentMetadata({
        documentId: document.id,
        title: nextTitle,
        documentType: nextType,
        extractedData
      })
    }catch{
      return nextDocument
    }
  }
  return nextDocument
}
const documentTypeSignals = [
  ['hotel', [
    [/hotels?\.com|innsjekk|utsjekk|check-?in|check-?out|rom x \d+ netter/i, 5],
    [/hotell|hotel|overnatting|accommodation|scandic|radisson|thon|clarion|quality|comfort|best western/i, 4],
    [/booking|reservation|bestilling/i, 1]
  ]],
  ['flight', [
    [/flybillett|boarding pass|boardingkort|boarding|flight|flyreise/i, 5],
    [/\b(sas|norwegian|widerøe|wideroe|ryanair|lufthansa|klm|air france|easyjet|wizz)\b/i, 4],
    [/\b(gate|terminal|pnr|flightnr|flight number|lufthavn|airport)\b/i, 2],
    [/\bfly\b/i, 2]
  ]],
  ['ferry', [
    [/fergebillett|ferry ticket|fjordline|colorline|dfds/i, 5],
    [/ferge|ferry|båt|baat|boat|kai|havn/i, 3]
  ]],
  ['train', [
    [/togbillett|train ticket|\bvy\b|tog|train|rail|jernbane/i, 4]
  ]],
  ['bus', [
    [/bussbillett|bus ticket|buss|bus|coach|rute/i, 4]
  ]],
  ['excursion', [
    [/inngangsbillett|dagsbillett|besøksdato|besoksdato|admission|entrance/i, 6],
    [/hunderfossen|eventyrpark|legoland|museum|fornøyelsespark|fornoyelsespark|park|tour|excursion|utflukt|aktivitet|opplevelse/i, 4],
    [/\b(ticket|tickets|billett|billetter)\b/i, 2]
  ]],
  ['car', [
    [/leiebil|rental car|car rental|hertz|avis|sixt|europcar/i, 5],
    [/\b(bil|car|parking|parkering)\b/i, 1]
  ]],
  ['receipt', [
    [/kvittering|receipt|faktura|invoice|regning|betalt|total/i, 3]
  ]],
  ['id', [
    [/passport|pass|identitet|id-kort|\bid\b/i, 4]
  ]],
  ['insurance', [
    [/forsikring|insurance|policy|polise/i, 4]
  ]]
]
function inferDocumentType(fileName = '', documentText = ''){
  const textSource = normalizeDocumentText(documentText)
  const source = textSource || normalizeDocumentText(cleanFileTitle(fileName))
  const scores = documentTypeSignals.map(([type, signals], index) => ({
    type,
    index,
    score: signals.reduce((sum, [pattern, weight]) => sum + (pattern.test(source) ? weight : 0), 0)
  })).filter(row => row.score > 0)
  scores.sort((a, b) => b.score - a.score || a.index - b.index)
  return scores[0]?.score >= 2 ? scores[0].type : 'other'
}
function isGenericTicketTitle(title = ''){
  return /^(ticket|tickets|billett|billetter|inngangsbillett)$/i.test(cleanFileTitle(title).trim())
}
function suggestedDocumentTitle(fileName = '', type = 'other', insight = null){
  const cleaned = cleanFileTitle(fileName) || fileName || documentTypeLabel(type)
  if(type === 'hotel' && insight?.accommodationName) return insight.accommodationName
  if(type === 'excursion' && insight?.activityName) return insight.activityName
  if(type === 'excursion' && isGenericTicketTitle(cleaned)) return 'Inngangsbillett'
  return cleaned
}
function eventTypeToDocumentType(type = ''){
  if(['flight', 'hotel', 'ferry', 'car', 'train', 'bus'].includes(type)) return type
  if(type === 'activity' || type === 'match' || type === 'food') return 'excursion'
  return 'other'
}
function documentAnalysisSuggestion(type){
  const fields = documentHints[type] || documentHints.other
  return {
    suggestedType: type,
    confidence: type === 'other' ? 'Lav' : 'Middels',
    summary: `${documentTypeLabel(type)}: sjekk ${fields.slice(0, 3).join(', ')}.`,
    fields
  }
}

const knownDestinationNames = ['København', 'Copenhagen', 'London', 'Paris', 'Roma', 'Rome', 'Barcelona', 'Madrid', 'Berlin', 'Praha', 'Prague', 'Amsterdam', 'Lillehammer', 'Hafjell', 'Hunderfossen', 'Gøteborg', 'Gothenburg', 'Stockholm', 'Oslo', 'Bergen', 'Trondheim', 'Alicante', 'Malaga', 'Málaga', 'Kreta', 'Crete', 'Mallorca', 'New York', 'Orlando', 'Billund', 'Legoland']
const documentStopWords = new Set(['booking', 'reservation', 'reisedokument', 'dokument', 'billett', 'billetter', 'ticket', 'tickets', 'boarding', 'pass', 'hotel', 'hotell', 'fly', 'flight', 'reise', 'travel', 'voucher', 'kvittering', 'receipt', 'invoice', 'faktura', 'retur', 'return', 'tur', 'familietur'])
const monthNumberByName = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12
}
const monthNamePattern = Object.keys(monthNumberByName).sort((a, b) => b.length - a.length).join('|')
function uniqueRows(rows){
  return [...new Set(rows.filter(Boolean))]
}
function parseDateParts(year, month, day){
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : iso
}
function parseMonthNameDate(day, monthName, year){
  const normalized = String(monthName || '').toLowerCase().replace(/\./g, '')
  const month = monthNumberByName[normalized]
  return month ? parseDateParts(year, month, day) : ''
}
function extractDatesFromText(text = ''){
  const source = normalizeDocumentText(text)
  const dates = []
  source.replace(/(20\d{2})[._\-\s](0?[1-9]|1[0-2])[._\-\s](0?[1-9]|[12]\d|3[01])/g, (_, year, month, day) => {
    dates.push(parseDateParts(year, month, day))
    return _
  })
  source.replace(/(0?[1-9]|[12]\d|3[01])[._\-\s](0?[1-9]|1[0-2])[._\-\s](20\d{2})/g, (_, day, month, year) => {
    dates.push(parseDateParts(year, month, day))
    return _
  })
  source.replace(new RegExp(`(0?[1-9]|[12]\\d|3[01])\\.?\\s+(${monthNamePattern})\\.?\\s+(20\\d{2})`, 'giu'), (_, day, monthName, year) => {
    dates.push(parseMonthNameDate(day, monthName, year))
    return _
  })
  return uniqueRows(dates).sort()
}
function extractDatesNearLabels(text = '', labelPattern = ''){
  const source = normalizeDocumentText(text)
  const dates = []
  const regex = new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*([^\\n]{0,120})`, 'giu')
  source.replace(regex, (_, tail) => {
    dates.push(...extractDatesFromText(tail))
    return _
  })
  return uniqueRows(dates).sort()
}
function extractDocumentDates(text = '', type = 'other'){
  if(type === 'hotel'){
    const stayDates = extractDatesNearLabels(text, 'innsjekking|utsjekking|innsjekk|utsjekk|check\\s*in|check\\s*out|check-in|check-out')
    if(stayDates.length) return stayDates
  }
  if(type === 'excursion'){
    const visitDates = extractDatesNearLabels(text, 'besøksdato|besoksdato|visit date|valid date|gyldig')
    if(visitDates.length) return visitDates
  }
  return extractDatesFromText(text)
}
function inferDestinationFromText(text = ''){
  const source = normalizeDocumentText(String(text)).replace(/\s+/g, ' ').trim()
  const lower = source.toLowerCase()
  const known = knownDestinationNames.find(name => lower.includes(name.toLowerCase()))
  if(known) return known === 'Copenhagen' ? 'København' : known === 'Rome' ? 'Roma' : known === 'Prague' ? 'Praha' : known === 'Gothenburg' ? 'Gøteborg' : known === 'Crete' ? 'Kreta' : known
  const pattern = source.match(/(?:til|to|i|in|for)\s+([A-ZÆØÅ][A-Za-zÆØÅæøå\-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå\-]+)?)/)
  if(pattern?.[1]) return pattern[1].trim()
  const capitalized = source.match(/\b[A-ZÆØÅ][A-Za-zÆØÅæøå\-]{2,}\b/g) || []
  const candidate = capitalized.find(word => !documentStopWords.has(word.toLowerCase()))
  return candidate || ''
}
function isLikelyAccommodationName(value = ''){
  const name = String(value || '').trim()
  if(!name) return false
  if(/hotels?\.com|booking|bestilling|reservation|reiserutenr|dokument|document|\.pdf|\.docx?|flybillett|ticket/i.test(name)) return false
  return /(?:Scandic|Radisson|Thon|Quality|Clarion|Comfort|Best Western|Hotel|Hotell)/i.test(name)
}
function inferAccommodationName(text = ''){
  const details = extractAccommodationDetails(text)
  if(details.name) return details.name
  const lines = normalizeDocumentText(text).split('\n').map(line => line.trim()).filter(Boolean)
  const line = lines.find(isLikelyAccommodationName)
  if(line) return line.replace(/\s{2,}/g, ' ').trim()
  const source = normalizeDocumentText(text)
  const match = source.match(/\b((?:Scandic|Radisson|Thon|Quality|Clarion|Comfort|Best Western)\b[^,\n]{0,50}?\b(?:Hotel|Hotell)\b|[A-ZÆØÅ][^,\n]{2,48}\s+(?:Hotel|Hotell))\b/i)
  const candidate = match?.[1]?.trim() || ''
  return isLikelyAccommodationName(candidate) ? candidate : ''
}
function cleanAccommodationAddress(value = ''){
  return normalizeDocumentText(value)
    .replace(/\s+(?:Innsjekking|Innsjekk|Check\s*in|Check-in|Utsjekking|Utsjekk|Check\s*out|Check-out)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
}
function extractAccommodationDetails(text = ''){
  const source = normalizeDocumentText(text).replace(/\s+/g, ' ').trim()
  const details = { name: '', address: '', nights: '', roomCount: '', roomType: '' }
  const booking = source.match(/Bestillingsopplysninger\s+(.+?)\s+(?:Innsjekking|Innsjekk|Check\s*in|Check-in)\b/i)
  const bookingInfo = booking?.[1]?.trim() || ''
  if(bookingInfo){
    const hotel = bookingInfo.match(/^(.+?\b(?:Hotel|Hotell)\b)\s*(.*)$/i)
    if(hotel){
      const candidate = hotel[1].trim()
      details.name = isLikelyAccommodationName(candidate) ? candidate : ''
      details.address = cleanAccommodationAddress(hotel[2])
    }
  }
  if(!details.name){
    const hotel = source.match(/\b((?:Scandic|Radisson|Thon|Quality|Clarion|Comfort|Best Western)\b[^,\n]{0,50}?\b(?:Hotel|Hotell)\b|[A-ZÆØÅ][^,\n]{2,48}\s+(?:Hotel|Hotell))\b/i)
    const candidate = hotel?.[1]?.trim() || ''
    details.name = isLikelyAccommodationName(candidate) ? candidate : ''
  }
  if(!details.address && details.name){
    const afterName = source.slice(source.toLowerCase().indexOf(details.name.toLowerCase()) + details.name.length)
    const beforeCheckIn = afterName.match(/^\s*(.+?)\s+(?:Innsjekking|Innsjekk|Check\s*in|Check-in)\b/i)
    details.address = cleanAccommodationAddress(beforeCheckIn?.[1] || '')
  }
  const nights = source.match(/(\d+)\s*rom\s*x\s*(\d+)\s*netter/i) || source.match(/(\d+)\s*room(?:s)?\s*x\s*(\d+)\s*night/i)
  if(nights){
    details.roomCount = nights[1]
    details.nights = nights[2]
  }else{
    const simpleNights = source.match(/(\d+)\s*(?:netter|nights?)\b/i)
    if(simpleNights) details.nights = simpleNights[1]
  }
  const roomType = source.match(/(?:\d+\s*rom\s*x\s*\d+\s*netter|\d+\s*rooms?\s*x\s*\d+\s*nights?)\s+(.+?)\s+(?:Bestilt for|Booked for|Betalingsopplysninger|Payment)/i)
  details.roomType = roomType?.[1]?.trim() || ''
  return details
}
function inferActivityName(text = ''){
  const lines = normalizeDocumentText(text).split('\n').map(line => line.trim()).filter(Boolean)
  const line = lines.find(row => /hunderfossen|eventyrpark|legoland|museum|inngangsbillett|dagsbillett|tour|excursion|utflukt|aktivitet/i.test(row) && !/^dette er\b/i.test(row))
  if(line) return line.replace(/^inngangsbillett\s*(20\d{2})?\s*/i, 'Inngangsbillett ').replace(/^\d+\s+dag\s+/i, '').trim()
  return ''
}
function isEntranceTicketText(text = ''){
  return /inngangsbillett|dagsbillett|besøksdato|besoksdato|\b\d+\s+dag\b|admission|entrance|\bticket\b/i.test(normalizeDocumentText(text))
}
function activityEventTitle(activityName = '', documentTitle = '', source = ''){
  const name = activityName || (isGenericTicketTitle(documentTitle) ? '' : documentTitle)
  if(isEntranceTicketText(source)){
    if(!name) return 'Inngangsbillett'
    return /^inngangsbillett\b/i.test(name) ? name : `Inngangsbillett: ${name}`
  }
  return name || 'Aktivitet'
}
function documentEventTitle(type, documentTitle, insight = {}){
  if(type === 'flight') return 'Flyreise'
  if(type === 'hotel') return insight.accommodationName || 'Overnatting'
  if(type === 'excursion') return activityEventTitle(insight.activityName, documentTitle, insight.source || '')
  if(type === 'ferry') return 'Ferge/båt'
  if(type === 'car') return 'Bil/leiebil'
  if(type === 'train') return 'Togreise'
  if(type === 'bus') return 'Bussreise'
  return documentTitle || documentTypeLabel(type)
}
function createDocumentInsight(fileName = '', type = 'other', title = '', documentText = '', options = {}){
  const base = documentAnalysisSuggestion(type)
  const source = normalizeDocumentText(documentText)
  const dates = extractDocumentDates(source, type)
  const destination = inferDestinationFromText(source)
  const accommodationDetails = type === 'hotel' ? extractAccommodationDetails(source) : {}
  const accommodationName = type === 'hotel' ? (accommodationDetails.name || inferAccommodationName(source)) : ''
  const accommodationAddress = accommodationDetails.address || ''
  const accommodationRoomType = accommodationDetails.roomType || ''
  const accommodationNights = accommodationDetails.nights || (type === 'hotel' ? nightsBetweenDates(dates[0], dates[1]) : '')
  const activityName = type === 'excursion' ? inferActivityName(source) : ''
  const noReadablePdfText = options.pdfWithoutText && isGenericTicketTitle(title || fileName)
  const eventTitle = documentEventTitle(type, title || cleanFileTitle(fileName), { accommodationName, activityName, source })
  const summary = [
    `${documentTypeLabel(type)}: ${noReadablePdfText ? 'bildebasert PDF uten lesbart tekstlag, lagt inn som inngangsbillett/aktivitet.' : `sjekk ${base.fields.slice(0, 3).join(', ')}.`}`,
    destination ? `Sted: ${destination}.` : '',
    dates.length ? `Dato: ${dates.map(formatDate).join(', ')}.` : '',
    accommodationName ? `Overnatting: ${accommodationName}.` : '',
    accommodationAddress ? `Adresse: ${accommodationAddress}.` : '',
    accommodationNights ? `${accommodationNights} ${Number(accommodationNights) === 1 ? 'natt' : 'netter'}.` : '',
    accommodationRoomType ? `Rom: ${accommodationRoomType}.` : '',
    activityName ? `Aktivitet: ${activityName}.` : ''
  ].filter(Boolean).join(' ')
  return {
    ...base,
    status: 'tolket',
    source: source ? 'pdf-text' : 'empty',
    textLength: source.length,
    destination,
    dates,
    accommodationName,
    accommodationAddress,
    accommodationNights,
    accommodationRoomType,
    activityName,
    eventTitle,
    summary
  }
}
function documentHasImportableDetails(document){
  const data = document?.extractedData || {}
  const dates = Array.isArray(data.dates) ? data.dates : []
  if(document?.type === 'hotel' || data.accommodationName || data.accommodationAddress || data.accommodationNights){
    return Boolean(data.accommodationName || data.accommodationAddress || data.accommodationNights)
  }
  if(document?.type === 'excursion' || data.activityName){
    return Boolean(data.activityName || dates.length || data.destination)
  }
  return Boolean(data.destination || dates.length || data.eventTitle)
}
function buildTripImportSuggestion(documents = []){
  const rows = documents
    .filter(documentHasImportableDetails)
    .map(document => ({ document, data: document.extractedData || createDocumentInsight(document.fileName || document.title, document.type || 'other', document.title) }))
  const destination = rows.map(row => row.data.destination).find(Boolean) || ''
  const allDates = uniqueRows(rows.flatMap(row => row.data.dates || [])).sort()
  const startDate = allDates[0] || ''
  const endDate = allDates.length > 1 ? allDates[allDates.length - 1] : ''
  const durationDays = durationFromDateRange(startDate, endDate) || (startDate ? 1 : '')
  const hotelRow = rows.find(row => row.data.accommodationName || row.data.accommodationAddress || row.data.accommodationNights)
  const accommodationDates = hotelRow?.data?.dates || []
  const accommodationCheckIn = accommodationDates[0] || startDate || ''
  const accommodationCheckOut = accommodationDates[1] || endDate || ''
  const accommodationNights = hotelRow?.data?.accommodationNights || nightsBetweenDates(accommodationCheckIn, accommodationCheckOut)
  const accommodationRoomType = hotelRow?.data?.accommodationRoomType || ''
  const accommodation = hotelRow ? {
    name: hotelRow.data.accommodationName || 'Overnatting',
    place: hotelRow.data.accommodationAddress || destination,
    checkIn: accommodationCheckIn,
    checkOut: accommodationCheckOut,
    nights: accommodationNights,
    roomType: accommodationRoomType,
    notes: [accommodationRoomType, nightLabel(accommodationNights)].filter(Boolean).join(' · ')
  } : emptyAccommodation()
  const transportTypes = new Set(['flight', 'ferry', 'car', 'train', 'bus'])
  const transports = rows
    .filter(row => transportTypes.has(row.document.type))
    .map((row, index) => ({
      id: `import-travel-${row.document.id || index}`,
      mode: row.document.type,
      customMode: '',
      title: row.data.eventTitle || documentTypeLabel(row.document.type),
      date: row.data.dates?.[0] || '',
      time: '',
      place: destination,
      direction: index === 0 ? 'outbound' : row.data.dates?.[0] === endDate ? 'return' : 'during',
      note: ''
    }))
  const events = rows
    .filter(row => !['id', 'insurance', 'receipt'].includes(row.document.type))
    .map((row, index) => {
      const date = row.data.dates?.[0] || ''
      const isHotel = row.document.type === 'hotel'
      const eventPlace = isHotel
        ? (row.data.accommodationAddress || row.data.accommodationName || row.data.destination || destination || '')
        : (row.data.destination || destination || '')
      const eventNote = isHotel
        ? [row.data.accommodationNights ? nightLabel(row.data.accommodationNights) : '', row.data.accommodationRoomType || ''].filter(Boolean).join(' · ')
        : ''
      return {
        id: `import-event-${row.document.id || index}`,
        sourceDocumentId: row.document.id || null,
        day: date ? formatDate(date) : 'Uten dato',
        date,
        time: '',
        title: row.data.eventTitle || documentEventTitle(row.document.type, row.document.title),
        place: eventPlace,
        type: row.document.type === 'hotel' ? 'hotel' : eventTypeToDocumentType(row.document.type) === 'excursion' ? 'activity' : transportEventType(row.document.type),
        status: 'Planlagt',
        note: eventNote,
        document: null
      }
    })
  const summaries = []
  if(destination) summaries.push(`Reisemål: ${destination}`)
  if(startDate || endDate) summaries.push(`Datoer: ${[startDate ? formatDate(startDate) : '', endDate ? formatDate(endDate) : ''].filter(Boolean).join('–')}`)
  if(durationDays) summaries.push(`Varighet: ${durationLabel(durationDays)}`)
  if(hotelRow) summaries.push(`Overnatting: ${accommodation.name}`)
  if(accommodation.place) summaries.push(`Adresse: ${accommodation.place}`)
  if(accommodation.nights) summaries.push(`Netter: ${nightLabel(accommodation.nights)}`)
  if(events.length) summaries.push(`${events.length} planpunkt lagt inn`)
  return { destination, startDate, endDate, durationDays, accommodation, transports, events, summaries, hasSuggestions: Boolean(summaries.length) }
}
function formatFileSize(bytes = 0){
  if(!bytes) return ''
  if(bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function ownerDisplayName(session){
  return session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Deg'
}
function createClientId(prefix = 'person'){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
function isValidEmail(email){
  return /^\S+@\S+\.\S+$/.test((email || '').trim())
}
const relationOptions = [
  ['adult', 'Voksen'],
  ['child', 'Barn'],
  ['teen', 'Ungdom'],
  ['grandparent', 'Besteforelder'],
  ['family', 'Familie'],
  ['friend', 'Venn'],
  ['other', 'Annet']
]
const tripTypeOptions = [
  ['family', Home, 'Familietur'],
  ['friends', Users, 'Vennetur'],
  ['cup', Trophy, 'Cup/idrettstur'],
  ['work', Settings, 'Jobbtur'],
  ['other', MapPin, 'Annet']
]
const transportModeOptions = [
  ['flight', 'Fly'],
  ['ferry', 'Båt/ferge'],
  ['car', 'Bil'],
  ['train', 'Tog'],
  ['bus', 'Buss'],
  ['transport', 'Annen transport'],
  ['other', 'Annet']
]
const transportEventTypes = new Set(['flight', 'ferry', 'boat', 'car', 'train', 'bus', 'transport'])
function tripTypeLabel(value){
  return tripTypeOptions.find(([id]) => id === value)?.[2] || 'Tur'
}
function transportModeLabel(mode, customMode = ''){
  if(mode === 'other') return customMode?.trim() || 'Annet'
  if(mode === 'boat') return 'Båt'
  return transportModeOptions.find(([id]) => id === mode)?.[1] || 'Transport'
}
function transportEventType(mode){
  return mode === 'other' ? 'transport' : (mode || 'transport')
}
function isTransportEvent(event){
  return transportEventTypes.has(event?.type)
}
function emptyAccommodation(){
  return { name: '', place: '', checkIn: '', checkOut: '', nights: '', roomType: '', notes: '' }
}
function emptyLogistics(){
  return { accommodation: emptyAccommodation(), transports: [] }
}
function normalizeAccommodation(accommodation = {}){
  return {
    name: accommodation.name || '',
    place: accommodation.place || '',
    checkIn: accommodation.checkIn || accommodation.check_in || '',
    checkOut: accommodation.checkOut || accommodation.check_out || '',
    nights: accommodation.nights || '',
    roomType: accommodation.roomType || accommodation.room_type || '',
    notes: accommodation.notes || ''
  }
}
function hasAccommodation(accommodation){
  const row = normalizeAccommodation(accommodation)
  return Boolean(row.name.trim() || row.place.trim() || row.checkIn || row.checkOut || row.nights || row.roomType.trim() || row.notes.trim())
}
function normalizeTransportItem(item = {}, index = 0){
  const sourceMode = item.mode || item.type || 'transport'
  const mode = transportModeOptions.some(([id]) => id === sourceMode) ? sourceMode : transportEventType(sourceMode)
  return {
    id: item.id || `travel-${index}`,
    mode: mode || 'transport',
    customMode: item.customMode || item.custom_mode || '',
    title: item.title || '',
    date: item.date || '',
    time: item.time || '',
    place: item.place || '',
    direction: item.direction || 'outbound',
    note: item.note || item.notes || ''
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
    accommodation: normalizeAccommodation(source.accommodation || source.hotel),
    transports: transports
      .map(normalizeTransportItem)
      .filter(item => item.title.trim() || item.place.trim() || item.date || item.time || item.customMode.trim() || item.note.trim())
  }
}
function logisticsHasContent(logistics){
  const normalized = normalizeLogistics(logistics)
  return hasAccommodation(normalized.accommodation) || normalized.transports.length > 0
}
function hasTripTitle(draft){
  return Boolean(draft?.title?.trim())
}
function hasTripLocation(draft){
  return Boolean(draft?.locationMeta?.name || draft?.location?.trim())
}
function hasValidDateRange(draft){
  return !draft?.start || !draft?.end || draft.end >= draft.start
}
function normalizeDurationDays(value){
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? Math.ceil(days) : ''
}
function durationFromDateRange(start, end){
  if(!start || !end || end < start) return ''
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const days = Math.round((endDate - startDate) / 86400000) + 1
  return days > 0 ? days : ''
}
function nightsBetweenDates(checkIn, checkOut){
  if(!checkIn || !checkOut || checkOut <= checkIn) return ''
  const startDate = new Date(`${checkIn}T00:00:00`)
  const endDate = new Date(`${checkOut}T00:00:00`)
  const nights = Math.round((endDate - startDate) / 86400000)
  return nights > 0 ? String(nights) : ''
}
function nightLabel(value){
  const nights = Number(value)
  if(!Number.isFinite(nights) || nights <= 0) return ''
  return `${nights} ${nights === 1 ? 'natt' : 'netter'}`
}
function tripDurationDays(draft){
  return normalizeDurationDays(draft?.durationDays) || durationFromDateRange(draft?.start, draft?.end)
}
function durationLabel(days){
  const normalized = normalizeDurationDays(days)
  if(!normalized) return ''
  return `${normalized} ${normalized === 1 ? 'dag' : 'dager'}`
}
function addDaysDate(dateString, daysToAdd){
  if(!dateString || !Number.isFinite(Number(daysToAdd))) return ''
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + Number(daysToAdd))
  return date.toISOString().slice(0, 10)
}
function dateLabelWithDuration(startDate, endDate, durationDays){
  return dateLabel(startDate, endDate) || durationLabel(durationDays) || ''
}
function canSaveTripDraft(draft){
  return Boolean(draft?.type) && hasTripTitle(draft) && Boolean(tripDurationDays(draft)) && hasValidDateRange(draft)
}
function tripDraftValidationMessage(draft){
  if(!draft?.type) return 'Velg hva slags tur dette er.'
  if(!hasTripTitle(draft)) return 'Legg inn navn på turen.'
  if(!tripDurationDays(draft)) return 'Legg inn hvor mange dager turen varer.'
  if(!hasValidDateRange(draft)) return 'Sluttdato kan ikke være før startdato.'
  return ''
}
function createStepReady(draft){
  return canSaveTripDraft(draft)
}
function dateRangeMessage(draft){
  return hasValidDateRange(draft) ? '' : 'Sluttdato kan ikke være før startdato.'
}
function relationLabel(value){
  return relationOptions.find(([id]) => id === value)?.[1] || 'Familie'
}
function inviteStatusLabel(status){
  if(status === 'accepted' || status === 'active') return 'Har tilgang'
  if(status === 'invite_sent' || status === 'sent') return 'Invitert'
  if(status === 'invite_failed' || status === 'failed') return 'Feilet'
  if(status === 'pending') return 'Venter'
  if(status === 'test') return 'Testmodus'
  if(status === 'not_needed') return 'Ingen e-post'
  return 'Ikke sendt'
}
function participantName(person){
  if(typeof person === 'string') return person.trim()
  return person?.name?.trim() || person?.displayName?.trim() || person?.email?.split('@')[0] || ''
}
function participantEmail(person){
  return typeof person === 'string' ? '' : (person?.email || '').trim().toLowerCase()
}
function participantRelation(person){
  return typeof person === 'string' ? 'family' : (person?.relation || 'family')
}
function ownerParticipant(session){
  return {
    id: 'owner',
    name: ownerDisplayName(session),
    email: session?.user?.email || '',
    relation: 'self',
    invite: false
  }
}
function normalizeParticipants(participants, session){
  const rows = Array.isArray(participants) ? participants : []
  const normalized = rows.map((person, index) => ({
    id: typeof person === 'string' ? `participant-${index}` : person.id || createClientId('participant'),
    familyMemberId: typeof person === 'string' ? null : person.familyMemberId || person.family_member_id || null,
    name: participantName(person),
    email: participantEmail(person),
    relation: index === 0 ? 'self' : participantRelation(person),
    invite: index > 0 && typeof person !== 'string' ? Boolean(person.invite && participantEmail(person)) : false
  })).filter(person => person.name || person.email)
  return normalized.length ? normalized : [ownerParticipant(session)]
}
function memberSubtitle(member){
  const bits = [member.role || relationLabel(member.relation)]
  if(member.email) bits.push(member.email)
  const status = inviteStatusLabel(member.status || member.inviteStatus)
  if(status !== 'Ikke sendt') bits.push(status)
  return bits.join(' · ')
}
function defaultStartContent(type){
  return { packing: false, documents: false, plan: false, expenses: true, matches: type === 'cup' }
}
function createTripDraft(session){
  return { step: 1, type: '', title: '', durationDays: '', start: '', end: '', location: '', locationMeta: null, description: '', participants: [ownerParticipant(session)], startContent: defaultStartContent(''), logistics: emptyLogistics() }
}
const startContentRows = [
  ['packing', 'Opprett pakkeliste'],
  ['documents', 'Legg til dokumenter'],
  ['plan', 'Legg til første planpunkt'],
  ['expenses', 'Aktiver utlegg'],
  ['matches', 'Aktiver cupkamper']
]
const standardPackingByType = {
  default: [
    { title: 'Pass/ID', category: 'Dokumenter' },
    { title: 'Reisedokumenter og billetter', category: 'Dokumenter' },
    { title: 'Bankkort', category: 'Dokumenter' },
    { title: 'Reiseforsikring', category: 'Dokumenter' },
    { title: 'Underbukser', category: 'Klær' },
    { title: 'Sokker', category: 'Klær' },
    { title: 'T-skjorter', category: 'Klær' },
    { title: 'Bukser/shorts', category: 'Klær' },
    { title: 'Genser/jakke', category: 'Klær' },
    { title: 'Regntøy', category: 'Klær' },
    { title: 'Tannbørste', category: 'Hygiene' },
    { title: 'Toalettsaker', category: 'Hygiene' },
    { title: 'Medisiner', category: 'Medisin' },
    { title: 'Mobil', category: 'Elektronikk' },
    { title: 'Ladere', category: 'Elektronikk' },
    { title: 'Powerbank', category: 'Elektronikk' },
    { title: 'Adapter', category: 'Elektronikk' },
    { title: 'Snacks til reisen', category: 'Mat/snacks' }
  ],
  cup: [
    { title: 'Drakt', category: 'Klær' },
    { title: 'Shorts', category: 'Klær' },
    { title: 'Fotballsokker', category: 'Klær' },
    { title: 'Fotballsko', category: 'Klær' },
    { title: 'Leggbeskyttere', category: 'Klær' },
    { title: 'Treningsjakke', category: 'Klær' },
    { title: 'Drikkeflaske', category: 'Mat/snacks' },
    { title: 'Kampplan', category: 'Dokumenter' }
  ]
}
const packingCategoryRules = [
  ['Dokumenter', /pass|id|bankkort|kort|billett|booking|forsikring|visum|reisebevis|dokument/i],
  ['Klær', /underbukse|truse|boxer|sokk|t-?skjorte|genser|jakke|bukse|shorts|kjole|skjørt|sko|sandaler|støvler|undertøy|badetøy|regntøy|lue|caps|hanske|vott|skjerf|belte|klær/i],
  ['Hygiene', /tann|sjampo|shampo|såpe|deo|deodorant|toalett|hygiene|hårbørste|kam|barber|solkrem|linser|sminke|krem|shaver|bind|tampong/i],
  ['Elektronikk', /mobil|telefon|lader|ladere|powerbank|adapter|ipad|nettbrett|pc|laptop|mac|kamera|hodetelefon|airpods|ørepropper|elektronikk|klokke|gps/i],
  ['Medisin', /medisin|tablett|plaster|paracet|ibux|resept|allergi|førstehjelp|feber|nesespray|hostesaft|termometer/i],
  ['Mat/snacks', /mat|snacks|kjeks|godteri|drikke|vannflaske|niste|tyggis|egg|brød|pålegg|ost|skinke|yoghurt|melk|juice|kaffe|te|frukt|banan|eple|middag|frokost|lunsj|taco|pasta|ris|grill|pølser|sjokolade|chips/i],
  ['Søvn/overnatting', /pute|dyne|sovepose|laken|sengetøy|sengetrekk|dynetrekk|putetrekk|teppe|madrass|luftmadrass|nattøy|pysj|ørepropper|sovemaske/i],
  ['Barn', /bleie|vogn|smokk|bamse|leke|barn|baby|barnesete/i]
]
function inferPackingCategory(title = ''){
  const row = packingCategoryRules.find(([, pattern]) => pattern.test(title))
  return row?.[0] || 'Diverse'
}
function smartPackingCategory(item){
  const inferred = inferPackingCategory(item?.title || '')
  return !item?.category || item.category === 'Diverse' ? inferred : item.category
}
function normalizePackingTemplateItems(items = []){
  const seen = new Set()
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const title = typeof item === 'string' ? item : item?.title
      const cleanTitle = String(title || '').trim()
      if(!cleanTitle) return null
      const key = cleanTitle.toLowerCase()
      if(seen.has(key)) return null
      seen.add(key)
      return { title: cleanTitle, category: typeof item === 'string' ? inferPackingCategory(cleanTitle) : (item.category || inferPackingCategory(cleanTitle)) }
    })
    .filter(Boolean)
}
function defaultPackingItemsForTripType(type){
  const normalizedType = String(type || '').toLowerCase()
  const typeItems = normalizedType === 'cup' ? standardPackingByType.cup : []
  return normalizePackingTemplateItems([...typeItems, ...standardPackingByType.default])
}
function packingRowsFromItems(items = [], prefix = 'pack'){
  return normalizePackingTemplateItems(items).map((item, index) => ({
    id: `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: item.title,
    category: item.category || inferPackingCategory(item.title),
    assignedTo: null,
    packed: false,
    mustBuy: false
  }))
}
function parsePackingTemplateLines(text = ''){
  return normalizePackingTemplateItems(String(text || '').split('\n').map(line => line.trim()).filter(Boolean))
}
function normalizePackingTemplates(templates = []){
  return (Array.isArray(templates) ? templates : [])
    .map(template => ({
      id: template.id || createClientId('packing-template'),
      name: String(template.name || '').trim(),
      items: normalizePackingTemplateItems(template.items)
    }))
    .filter(template => template.name && template.items.length)
}
function readCustomPackingTemplates(){
  if(typeof window === 'undefined') return []
  try{
    const storage = window.localStorage
    const parsed = JSON.parse(storage.getItem(customPackingTemplatesKey) || '[]')
    return normalizePackingTemplates(parsed)
  }catch{
    return []
  }
}
function writeCustomPackingTemplates(templates = []){
  if(typeof window === 'undefined') return
  try{
    window.localStorage.setItem(customPackingTemplatesKey, JSON.stringify(templates.map(template => ({
      id: template.id,
      name: template.name,
      items: normalizePackingTemplateItems(template.items)
    }))))
  }catch{}
}

function captureHouseholdInviteFromUrl(){
  if(typeof window === 'undefined') return ''
  try{
    const url = new URL(window.location.href)
    const token = url.searchParams.get('householdInvite') || url.searchParams.get('invite') || ''
    if(!token) return window.localStorage.getItem(pendingHouseholdInviteKey) || ''
    window.localStorage.setItem(pendingHouseholdInviteKey, token)
    url.searchParams.delete('householdInvite')
    url.searchParams.delete('invite')
    const next = `${url.pathname}${url.search}${url.hash}` || '/'
    window.history.replaceState({}, document.title, next)
    return token
  }catch{
    return ''
  }
}
function readPendingHouseholdInvite(){
  if(typeof window === 'undefined') return ''
  try{
    return window.localStorage.getItem(pendingHouseholdInviteKey) || ''
  }catch{
    return ''
  }
}
function clearPendingHouseholdInvite(){
  if(typeof window === 'undefined') return
  try{ window.localStorage.removeItem(pendingHouseholdInviteKey) }catch{}
}
function readActiveHouseholdId(){
  if(typeof window === 'undefined') return ''
  try{
    return window.localStorage.getItem(activeHouseholdIdKey) || ''
  }catch{
    return ''
  }
}
function writeActiveHouseholdId(householdId){
  if(typeof window === 'undefined' || !householdId) return
  try{ window.localStorage.setItem(activeHouseholdIdKey, householdId) }catch{}
}
function seedStartContent(create){
  const content = create.startContent || defaultStartContent(create.type)
  const logistics = normalizeLogistics(create.logistics)
  const events = []
  const packing = []
  const documents = []
  const logisticsEvents = []
  const fallbackLocation = create.locationMeta?.name || create.location?.trim() || 'reisemålet'
  if(hasAccommodation(logistics.accommodation)){
    const stay = logistics.accommodation
    const hotelTitle = stay.name.trim() || 'Overnatting'
    const hotelPlace = stay.place.trim() || stay.name.trim() || fallbackLocation
    const hotelNotes = stay.notes.trim()
    if(stay.checkIn || stay.name || stay.place){
      logisticsEvents.push({
        id: `event-hotel-in-${Date.now()}`,
        day: stay.checkIn ? formatDate(stay.checkIn) : create.start ? formatDate(create.start) : 'Uten dato',
        date: stay.checkIn || create.start || '',
        time: '',
        title: `Innsjekk ${hotelTitle}`,
        place: hotelPlace,
        type: 'hotel',
        status: 'Planlagt',
        note: hotelNotes || `Overnatting: ${hotelTitle}`,
        document: null
      })
    }
    if(stay.checkOut){
      logisticsEvents.push({
        id: `event-hotel-out-${Date.now()}`,
        day: formatDate(stay.checkOut),
        date: stay.checkOut,
        time: '',
        title: `Utsjekk ${hotelTitle}`,
        place: hotelPlace,
        type: 'hotel',
        status: 'Planlagt',
        note: hotelNotes || `Sjekk ut fra ${hotelTitle}.`,
        document: null
      })
    }
  }
  logistics.transports.forEach((item, index) => {
    const modeLabel = transportModeLabel(item.mode, item.customMode)
    logisticsEvents.push({
      id: `event-${item.id || `travel-${Date.now()}-${index}`}`,
      day: item.date ? formatDate(item.date) : 'Uten dato',
      date: item.date || '',
      time: item.time || '',
      title: item.title.trim() || modeLabel,
      place: item.place.trim() || '',
      type: transportEventType(item.mode),
      status: 'Planlagt',
      note: item.note.trim() || `${modeLabel} ${item.direction === 'return' ? 'hjem' : item.direction === 'outbound' ? 'dit' : 'underveis'}.`,
      document: null
    })
  })
  events.push(...logisticsEvents)
  if(content.plan && !logisticsEvents.length){
    const location = create.locationMeta?.name || create.location?.trim() || 'reisemålet'
    events.push({
      id: `event-${Date.now()}`,
      day: create.start ? formatDate(create.start) : 'Uten dato',
      date: create.start || '',
      time: '',
      title: `Ankomst ${location}`,
      place: location,
      type: create.type === 'cup' ? 'transport' : 'activity',
      status: 'Planlagt',
      note: 'Automatisk startpunkt. Rediger eller fjern.',
      document: null
    })
  }
  if(content.packing){
    const items = defaultPackingItemsForTripType(create.type)
    items.forEach((item, index) => packing.push({ id: `std-${Date.now()}-${index}`, title: item.title, category: item.category || inferPackingCategory(item.title), assignedTo: null, packed: false, mustBuy: false }))
  }
  if(content.documents){
    documents.push({ id: `doc-${Date.now()}`, title: 'Billetter og reisedokumenter', type: 'PDF' })
  }
  return { events, packing, documents, logistics }
}
function startFeatures(create){
  const content = create.startContent || defaultStartContent(create.type)
  return { expenses: content.expenses !== false, matches: Boolean(content.matches) || create.type === 'cup' }
}
function tripFeatures(trip){
  return trip?.features || { expenses: true, matches: trip?.type === 'cup' }
}
function tripToEditDraft(trip){
  return {
    type: trip?.type || 'family',
    title: trip?.title === 'Ny tur' ? '' : (trip?.title || ''),
    durationDays: trip?.durationDays || durationFromDateRange(trip?.startDate, trip?.endDate) || '',
    start: trip?.startDate || '',
    end: trip?.endDate || '',
    location: trip?.location === 'Ukjent sted' ? '' : (trip?.location || ''),
    locationMeta: trip?.locationMeta || null,
    description: trip?.description || '',
    logistics: normalizeLogistics(trip?.logistics)
  }
}
function draftToTripPatch(draft, trip){
  return {
    ...trip,
    title: draft.title.trim(),
    type: draft.type || 'family',
    date: dateLabel(draft.start, draft.end),
    location: draft.locationMeta?.name || draft.location.trim(),
    locationMeta: draft.locationMeta || null,
    startDate: draft.start || null,
    endDate: draft.end || null,
    durationDays: tripDurationDays(draft) || null,
    description: draft.description?.trim() || '',
    logistics: normalizeLogistics(draft.logistics || trip?.logistics),
    status: statusForTrip(draft.start, draft.end)
  }
}
function emptyTripDetails(members = []){
  return { members, events: [], packing: [], expenses: [], matches: [], messages: [], documents: [], photos: [], logistics: emptyLogistics() }
}
function serializeDocumentsForTripState(documents = []){
  return (Array.isArray(documents) ? documents : []).map(document => {
    const { url, ...serializable } = document || {}
    return serializable
  })
}
function normalizeTripAppState(appState = {}){
  return {
    events: Array.isArray(appState.events) ? appState.events : [],
    packing: Array.isArray(appState.packing) ? appState.packing : [],
    expenses: Array.isArray(appState.expenses) ? appState.expenses : [],
    matches: Array.isArray(appState.matches) ? appState.matches : [],
    messages: Array.isArray(appState.messages) ? appState.messages : [],
    documents: Array.isArray(appState.documents) ? appState.documents : [],
    photos: Array.isArray(appState.photos) ? appState.photos : [],
    logistics: normalizeLogistics(appState.logistics)
  }
}
function buildTripAppState({ events, packing, expenses, matches, messages, documents, photos, logistics }){
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    events: Array.isArray(events) ? events : [],
    packing: Array.isArray(packing) ? packing : [],
    expenses: Array.isArray(expenses) ? expenses : [],
    matches: Array.isArray(matches) ? matches : [],
    messages: Array.isArray(messages) ? messages : [],
    documents: serializeDocumentsForTripState(documents),
    photos: Array.isArray(photos) ? photos : [],
    logistics: normalizeLogistics(logistics)
  }
}

function emptyHouseholdState(){
  return { shopping: [], messages: [], calendarEvents: [], tasks: [], calendarSources: { google: emptyGoogleCalendarSource() } }
}
function emptyGoogleCalendarSource(){
  return { connected: false, selectedCalendarIds: [], calendarNames: {}, lastImportAt: null, lastImportCount: 0 }
}
function normalizeShoppingItems(items = []){
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const title = String(typeof item === 'string' ? item : item?.title || '').trim()
      if(!title) return null
      return {
        id: typeof item === 'string' ? `shop-${index}` : (item.id || createClientId('shop')),
        title,
        quantity: typeof item === 'string' ? '' : String(item.quantity || '').trim(),
        note: typeof item === 'string' ? '' : String(item.note || item.notes || '').trim(),
        category: typeof item === 'string' ? '' : String(item.category || '').trim(),
        checked: typeof item === 'string' ? false : Boolean(item.checked || item.done || item.completed),
        source: typeof item === 'string' ? 'family' : (item.source || 'family'),
        sourceRef: typeof item === 'string' ? '' : String(item.sourceRef || item.source_ref || '').trim(),
        createdAt: typeof item === 'string' ? new Date().toISOString() : (item.createdAt || item.created_at || new Date().toISOString()),
        updatedAt: typeof item === 'string' ? null : (item.updatedAt || item.updated_at || null)
      }
    })
    .filter(Boolean)
}
function normalizeFamilyMessages(messages = []){
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => {
      const text = String(message?.text || message?.message || '').trim()
      if(!text) return null
      return {
        id: message.id || createClientId('family-msg'),
        author: message.author || message.authorName || 'Du',
        text,
        createdAt: message.createdAt || message.created_at || new Date(Date.now() + index).toISOString(),
        threadId: message.threadId || message.thread_id || 'family',
        threadTitle: message.threadTitle || message.thread_title || ''
      }
    })
    .filter(Boolean)
}

function normalizeHouseholdTasks(tasks = []){
  return (Array.isArray(tasks) ? tasks : [])
    .map((task, index) => {
      const title = String(typeof task === 'string' ? task : task?.title || '').trim()
      if(!title) return null
      return {
        id: typeof task === 'string' ? `task-${index}` : (task.id || createClientId('task')),
        title,
        done: typeof task === 'string' ? false : Boolean(task.done || task.checked || task.completed),
        priority: typeof task === 'string' ? 'normal' : (task.priority || 'normal'),
        dueDate: typeof task === 'string' ? '' : (task.dueDate || task.due_date || ''),
        person: typeof task === 'string' ? '' : String(task.person || task.assignedTo || task.assigned_to || '').trim(),
        source: typeof task === 'string' ? 'family' : (task.source || 'family'),
        sourceRef: typeof task === 'string' ? '' : String(task.sourceRef || task.source_ref || '').trim(),
        notes: typeof task === 'string' ? '' : String(task.notes || task.note || '').trim(),
        createdAt: typeof task === 'string' ? new Date().toISOString() : (task.createdAt || task.created_at || new Date(Date.now() + index).toISOString()),
        updatedAt: typeof task === 'string' ? null : (task.updatedAt || task.updated_at || null)
      }
    })
    .filter(Boolean)
}
function normalizeFamilyCalendarEvents(events = []){
  return (Array.isArray(events) ? events : [])
    .map((event, index) => {
      const title = String(event?.title || '').trim()
      if(!title) return null
      const source = event.source || event.sourceLabel || 'Manuell'
      return {
        id: event.id || event.sourceKey || createClientId('family-event'),
        title,
        date: event.date || event.startDate || event.start_date || '',
        time: event.time || event.startTime || event.start_time || '',
        endDate: event.endDate || event.end_date || '',
        endTime: event.endTime || event.end_time || '',
        person: String(event.person || event.assignedTo || event.assigned_to || '').trim(),
        source,
        sourceType: event.sourceType || event.source_type || (source === 'Google Kalender' || source === 'Spond via Google' ? 'google' : 'manual'),
        sourceEventId: event.sourceEventId || event.source_event_id || '',
        sourceKey: event.sourceKey || event.source_key || '',
        sourceRef: event.sourceRef || event.source_ref || '',
        calendarId: event.calendarId || event.calendar_id || '',
        calendarName: event.calendarName || event.calendar_name || '',
        externalLink: event.externalLink || event.external_link || '',
        location: String(event.location || event.place || '').trim(),
        notes: String(event.notes || event.note || '').trim(),
        allDay: Boolean(event.allDay || event.all_day),
        createdAt: event.createdAt || event.created_at || new Date(Date.now() + index).toISOString(),
        syncedAt: event.syncedAt || event.synced_at || null
      }
    })
    .filter(Boolean)
}
function normalizeCalendarSources(sources = {}){
  const source = sources && typeof sources === 'object' ? sources : {}
  const google = source.google && typeof source.google === 'object' ? source.google : {}
  const calendarNames = google.calendarNames && typeof google.calendarNames === 'object' ? google.calendarNames : {}
  return {
    google: {
      connected: Boolean(google.connected),
      selectedCalendarIds: Array.isArray(google.selectedCalendarIds) ? google.selectedCalendarIds.filter(Boolean) : [],
      calendarNames,
      lastImportAt: google.lastImportAt || null,
      lastImportCount: Number.isFinite(Number(google.lastImportCount)) ? Number(google.lastImportCount) : 0
    }
  }
}
function normalizeHouseholdState(state = {}){
  const source = state && typeof state === 'object' ? state : {}
  return {
    shopping: normalizeShoppingItems(source.shopping || source.shoppingItems || source.grocery || []),
    messages: normalizeFamilyMessages(source.messages || source.familyMessages || source.chat || []),
    calendarEvents: normalizeFamilyCalendarEvents(source.calendarEvents || source.events || source.familyCalendar || []),
    tasks: normalizeHouseholdTasks(source.tasks || source.todos || source.toDos || source.familyTasks || []),
    calendarSources: normalizeCalendarSources(source.calendarSources || source.sources || {})
  }
}
function householdFromUserAppState(appState = {}){
  const source = appState?.household && typeof appState.household === 'object' ? appState.household : appState
  return normalizeHouseholdState(source)
}
function buildUserAppState({ packingTemplates = [], household = emptyHouseholdState() } = {}){
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    packingTemplates: normalizePackingTemplates(packingTemplates),
    household: normalizeHouseholdState(household)
  }
}
function householdHasTableContent(state = {}){
  const normalized = normalizeHouseholdState(state)
  return normalized.shopping.length > 0 || normalized.messages.length > 0 || normalized.calendarEvents.length > 0 || normalized.tasks.length > 0
}
function householdStorageStatusLabel(storage = {}){
  if(storage.mode === 'tables') return storage.realtime ? 'Supabase Realtime aktiv' : 'Supabase-tabeller aktiv'
  if(storage.mode === 'app_state') return 'Kompatibel lagring i app_state'
  return 'Lokal testmodus'
}
function mergeHouseholdTableData(base, tableData){
  const current = normalizeHouseholdState(base)
  const remote = normalizeHouseholdState(tableData || {})
  return normalizeHouseholdState({
    ...current,
    shopping: remote.shopping,
    messages: remote.messages,
    calendarEvents: remote.calendarEvents,
    tasks: remote.tasks,
    calendarSources: current.calendarSources
  })
}
function sortableDateTime(date = '', time = ''){
  return `${date || '9999-12-31'}T${time || '99:99'}`
}
function formatShortDate(dateString){
  if(!dateString) return 'Uten dato'
  const today = isoToday()
  const tomorrow = addDaysDate(today, 1)
  if(dateString === today) return 'I dag'
  if(dateString === tomorrow) return 'I morgen'
  return formatDate(dateString)
}
function formatAgendaMeta(row){
  const bits = []
  if(row.date) bits.push(formatShortDate(row.date))
  if(row.time) bits.push(`kl. ${row.time}`)
  if(row.person) bits.push(row.person)
  if(row.place) bits.push(row.place)
  if(row.sourceLabel) bits.push(row.sourceLabel)
  return bits.join(' · ') || 'Uten tidspunkt'
}
function buildFamilyAgenda(household, trips = []){
  const normalizedHousehold = normalizeHouseholdState(household)
  const today = isoToday()
  const calendarRows = normalizedHousehold.calendarEvents.map(event => ({
    id: event.id,
    kind: 'calendar',
    title: event.title,
    date: event.date,
    time: event.time,
    person: event.person,
    place: event.location || event.place || '',
    sourceLabel: event.source,
    note: event.notes,
    event
  }))
  const taskRows = normalizedHousehold.tasks
    .filter(task => !task.done)
    .map(task => ({
      id: `task-${task.id}`,
      kind: 'task',
      title: task.title,
      date: task.dueDate || '',
      time: '',
      person: task.person,
      place: '',
      sourceLabel: 'Må ordnes',
      note: task.notes,
      task
    }))
  const tripRows = (Array.isArray(trips) ? trips : [])
    .filter(trip => trip.status !== 'Tidligere')
    .map(trip => ({
      id: `trip-${trip.id}`,
      kind: 'trip',
      title: trip.title,
      date: trip.startDate || '',
      time: '',
      person: '',
      sourceLabel: trip.type === 'cup' ? 'Cup/reise' : 'Reise',
      note: [trip.location, trip.date].filter(Boolean).join(' · '),
      trip
    }))
  return [...calendarRows, ...taskRows, ...tripRows]
    .filter(row => !row.date || row.date >= today)
    .sort((a, b) => sortableDateTime(a.date, a.time).localeCompare(sortableDateTime(b.date, b.time)))
}


function isGoogleCalendarEvent(event = {}){
  return event.sourceType === 'google' || event.source === 'Google Kalender' || event.source === 'Spond via Google'
}
function calendarEventDedupKey(event = {}){
  if(event.sourceKey) return event.sourceKey
  if(event.sourceRef) return event.sourceRef
  if(event.sourceType && event.sourceEventId) return `${event.sourceType}:${event.calendarId || ''}:${event.sourceEventId}:${event.date || ''}:${event.time || ''}`
  return event.id || createClientId('family-event')
}
function sortCalendarEvents(events = []){
  return normalizeFamilyCalendarEvents(events).sort((a, b) => sortableDateTime(a.date, a.time).localeCompare(sortableDateTime(b.date, b.time)))
}
function mergeImportedGoogleCalendarEvents(currentEvents = [], importedEvents = [], selectedCalendarIds = []){
  const selected = new Set((selectedCalendarIds || []).filter(Boolean))
  const preserved = normalizeFamilyCalendarEvents(currentEvents).filter(event => {
    if(!isGoogleCalendarEvent(event)) return true
    return selected.size > 0 && !selected.has(event.calendarId)
  })
  const rowsByKey = new Map()
  for(const event of [...preserved, ...normalizeFamilyCalendarEvents(importedEvents)]){
    rowsByKey.set(calendarEventDedupKey(event), event)
  }
  return sortCalendarEvents([...rowsByKey.values()])
}
function compactDateTime(value){
  if(!value) return ''
  try{
    return new Date(value).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }catch{
    return value
  }
}


function simpleHash(value = ''){
  let hash = 0
  for(const char of String(value || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash).toString(36)
}
function unfoldIcsLines(text = ''){
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r/g, '\n').split('\n')
}
function unescapeIcsText(value = ''){
  return String(value || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}
function parseIcsDateTime(value = ''){
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?Z?$/)
  if(!match) return { date: '', time: '' }
  const [, year, month, day, hour, minute] = match
  return { date: `${year}-${month}-${day}`, time: hour && minute ? `${hour}:${minute}` : '' }
}
async function readUploadedText(file){
  if(!file) return ''
  if(typeof file.text === 'function') return file.text()
  if(typeof FileReader !== 'undefined'){
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('Klarte ikke å lese filen.'))
      reader.readAsText(file)
    })
  }
  return ''
}
function parseIcsEvents(text = '', sourceLabel = 'iCal-import'){
  const lines = unfoldIcsLines(text)
  const blocks = []
  let current = null
  for(const line of lines){
    const clean = line.trim()
    if(clean === 'BEGIN:VEVENT') current = []
    else if(clean === 'END:VEVENT'){
      if(current) blocks.push(current)
      current = null
    }else if(current){
      current.push(line)
    }
  }
  return blocks.map(block => {
    const fields = {}
    for(const line of block){
      const splitIndex = line.indexOf(':')
      if(splitIndex < 0) continue
      const rawName = line.slice(0, splitIndex).split(';')[0].toUpperCase()
      const value = unescapeIcsText(line.slice(splitIndex + 1))
      if(!fields[rawName]) fields[rawName] = value
    }
    const start = parseIcsDateTime(fields.DTSTART)
    const end = parseIcsDateTime(fields.DTEND)
    const title = String(fields.SUMMARY || 'Kalenderavtale').trim()
    if(!title || !start.date) return null
    const uid = fields.UID || simpleHash(`${title}-${start.date}-${start.time}-${fields.LOCATION || ''}`)
    return {
      id: `ics-${simpleHash(`${sourceLabel}-${uid}`)}`,
      title,
      date: start.date,
      time: start.time,
      endDate: end.date,
      endTime: end.time,
      person: '',
      location: fields.LOCATION || '',
      source: sourceLabel,
      sourceKey: `ics:${uid}`,
      sourceEventId: uid,
      sourceType: 'ics',
      notes: fields.DESCRIPTION || '',
      createdAt: new Date().toISOString()
    }
  }).filter(Boolean)
}
function createShoppingItemFromTitle(title, extra = {}){
  return {
    id: createClientId('shop'),
    title: String(title || '').trim(),
    checked: false,
    quantity: '',
    note: '',
    category: '',
    source: 'family',
    sourceRef: '',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...extra
  }
}
function createTaskFromTitle(title, extra = {}){
  return {
    id: createClientId('task'),
    title: String(title || '').trim(),
    done: false,
    priority: 'normal',
    dueDate: '',
    person: '',
    source: 'family',
    sourceRef: '',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...extra
  }
}

function isStaleParsedDocument(document = {}){
  const data = document.extractedData || {}
  const label = `${document.title || ''} ${document.fileName || ''} ${data.summary || ''}`
  const staleSource = document.source === 'parsed-only' || document.savedFile === false || data.source === 'filename-heuristic' || data.source === 'empty'
  const staleHotel = /hotels?\.com|72074282776328/i.test(label) && !documentHasImportableDetails(document)
  return staleSource || staleHotel
}
function isIncompleteImportedEvent(event = {}){
  if(!event.sourceDocumentId) return false
  const label = `${event.title || ''} ${event.place || ''} ${event.note || ''} ${event.document || ''}`
  const hasSpecificTitle = event.title && !/^overnatting$/i.test(event.title) && !/hotels?\.com|72074282776328|^ticket(?:\.pdf)?$/i.test(event.title)
  const hasSpecificPlace = event.place && event.place !== 'Ikke satt' && !/hotels?\.com|72074282776328|^ticket(?:\.pdf)?$/i.test(event.place)
  const staleHotel = event.type === 'hotel' && /hotels?\.com|72074282776328|smartforslag/i.test(label) && (!hasSpecificTitle || !hasSpecificPlace)
  const staleTicket = event.type === 'activity' && /ticket(?:\.pdf)?|billett/i.test(label) && (!hasSpecificTitle || !hasSpecificPlace)
  return staleHotel || staleTicket
}
function sanitizeTestDetails(details = {}){
  const logistics = normalizeLogistics(details.logistics)
  const accommodationLabel = `${logistics.accommodation.name || ''} ${logistics.accommodation.notes || ''}`
  const staleAccommodation = /hotels?\.com|72074282776328/i.test(accommodationLabel) &&
    !logistics.accommodation.place &&
    !logistics.accommodation.checkIn &&
    !logistics.accommodation.checkOut &&
    !logistics.accommodation.nights
  return {
    ...details,
    events: Array.isArray(details.events) ? details.events.filter(event => !isIncompleteImportedEvent(event)) : [],
    documents: Array.isArray(details.documents) ? details.documents.filter(document => !isStaleParsedDocument(document)) : [],
    logistics: staleAccommodation ? { ...logistics, accommodation: emptyAccommodation() } : logistics
  }
}
function loadTestState(){
  try{
    legacyTestStateKeys.forEach(key => window.localStorage.removeItem(key))
    const parsed = JSON.parse(window.localStorage.getItem(testStateKey) || '{}')
    const trips = Array.isArray(parsed.trips)
      ? parsed.trips.filter(trip => !legacyDemoTripIds.has(trip.id) && !legacyDemoTripTitles.has(trip.title))
      : []
    const detailsByTrip = parsed.detailsByTrip && typeof parsed.detailsByTrip === 'object'
      ? Object.fromEntries(Object.entries(parsed.detailsByTrip)
        .filter(([tripId]) => !legacyDemoTripIds.has(tripId))
        .map(([tripId, details]) => [tripId, sanitizeTestDetails(details)]))
      : {}
    const family = Array.isArray(parsed.family)
      ? parsed.family.filter(member => member && (member.name || member.email))
      : []
    const household = normalizeHouseholdState(parsed.household || {})
    return {
      trips,
      detailsByTrip,
      family,
      household
    }
  }catch{
    return { trips: [], detailsByTrip: {}, family: [], household: emptyHouseholdState() }
  }
}
function saveTestState(trips, detailsByTrip, family, household){
  window.localStorage.setItem(testStateKey, JSON.stringify({ trips, detailsByTrip, family, household: normalizeHouseholdState(household) }))
}
function importFailureMessage(failures = []){
  const details = failures.filter(Boolean).join(' ')
  return `Fant ikke lesbare reisedetaljer i dokumentet. ${details}`.trim()
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
  return ''
}
function createLocalTripWithMembers(create, session){
  const tripId = `local-${Date.now()}`
  const participantPeople = normalizeParticipants(create.participants, session)
  const members = participantPeople.map((person, index) => ({
    id: `${tripId}-member-${index}`,
    familyMemberId: person.familyMemberId || null,
    name: person.name || person.email?.split('@')[0] || 'Deltaker',
    email: person.email || '',
    relation: person.relation,
    role: index === 0 ? 'Eier' : relationLabel(person.relation),
    status: index === 0 ? 'active' : person.email && person.invite ? 'test' : 'active'
  }))
  const trip = {
    id: tripId,
    title: create.title.trim(),
    type: create.type || 'family',
    date: dateLabelWithDuration(create.start, create.end, tripDurationDays(create)),
    location: create.locationMeta?.name || create.location?.trim() || '',
    locationMeta: create.locationMeta || null,
    members: members.length,
    status: statusForTrip(create.start, create.end),
    next: 'Legg til første hendelse',
    startDate: create.start || null,
    endDate: create.end || null,
    durationDays: tripDurationDays(create) || null,
    description: create.description?.trim() || '',
    source: 'local',
    features: startFeatures(create),
    logistics: normalizeLogistics(create.logistics),
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    localMembers: members
  }
  const seeded = seedStartContent(create)
  return { trip, members, seeded }
}


function eventSortKey(event){
  const date = event.date || '9999-12-31'
  const time = event.time && event.time !== 'Ikke satt' ? event.time : '99:99'
  return `${date}T${time}`
}
function sortEvents(events){
  return [...events].sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
}
function nextUpcomingEvent(events){
  const sorted = sortEvents(events)
  const today = isoToday()
  return sorted.find(event => !event.date || event.date >= today) || sorted[0] || null
}
function isSupersededImportEvent(event, importEvents = []){
  if(!event?.sourceDocumentId) return false
  if(!importEvents.length) return false
  const importTypes = new Set(importEvents.map(row => row.type).filter(Boolean))
  if(!importTypes.has(event.type)) return false
  if(event.type === 'hotel' || event.type === 'activity') return true
  const importDocuments = new Set(importEvents.map(row => row.document).filter(Boolean))
  return Boolean(event.document && importDocuments.has(event.document))
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
  if(localTestModeEnabled) return <App testMode />
  return authEnabled ? <AuthGate /> : <MissingSupabaseConfig />
}

function activeFamilyNavId(view){
  if(view === 'family' || view === 'profile') return 'profile'
  if(view === 'shopping' || view === 'familyChat') return 'home'
  return familyNavItems.some(([id]) => id === view) ? view : 'home'
}

function readGoogleCalendarProviderToken(){
  if(typeof window === 'undefined') return ''
  return window.localStorage.getItem(googleCalendarProviderTokenKey) || ''
}

function persistGoogleCalendarProviderToken(session){
  if(typeof window === 'undefined') return
  if(session?.provider_token){
    window.localStorage.setItem(googleCalendarProviderTokenKey, session.provider_token)
  }
}

function clearGoogleCalendarProviderToken(){
  if(typeof window === 'undefined') return
  window.localStorage.removeItem(googleCalendarProviderTokenKey)
}

function LoadingSplash({ progress = 65, loadingText = 'Laster inn turer, billetter, dokumenter og minner ...', footerText = 'Synkroniserer innhold ...' }){
  const safeProgress = Math.max(8, Math.min(100, Number(progress) || 65))
  const loadingCards = [
    { title: 'Turer', text: 'Henter kommende og tidligere turer', icon: CalendarDays },
    { title: 'Dokumenter', text: 'Klargjør billetter og vedlegg', icon: FileText },
    { title: 'Familie', text: 'Synker deltakere og invitasjoner', icon: Users }
  ]

  return <section className="screen loadingScreen" aria-busy="true" aria-label="Travelvault laster innhold">
    <header className="appHeader loadingHeader">
      <div className="brandRow">
        <img src="/logo-mark.png" alt="Travelvault"/>
        <div>
          <h1>Travelvault</h1>
          <p>Alt fra turen samlet på ett sted</p>
        </div>
      </div>
    </header>

    <div className="content gap-xl loadingContent">
      <section className="hero loadingHero">
        <small>Oppstart</small>
        <h2>Samler reisen din</h2>
        <p>{loadingText}</p>
        <div className="loadingProgressRow">
          <div className="loadingProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(safeProgress)}>
            <span style={{ width: `${safeProgress}%` }}></span>
          </div>
          <b>{Math.round(safeProgress)}%</b>
        </div>
        <div className="loadingSync"><RefreshCw size={16}/><span>{footerText}</span></div>
      </section>

      <section>
        <h2 className="sectionTitle">Klargjør innhold</h2>
        <div className="loadingStack">
          {loadingCards.map(({ title, text, icon: Icon }) => <article className="tripCard loadingCard" key={title}>
            <div className="eventTop">
              <span className="iconTile"><Icon size={18}/></span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <span className="loadingDot"></span>
            </div>
            <div className="loadingSkeleton wide"></div>
            <div className="loadingSkeleton mid"></div>
            <div className="nextPill blue loadingPill"><span></span>Henter siste endringer</div>
          </article>)}
        </div>
      </section>
    </div>
  </section>
}

function AuthGate(){
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [pendingInviteToken, setPendingInviteToken] = useState(() => captureHouseholdInviteFromUrl())
  const [inviteAccepting, setInviteAccepting] = useState(false)

  useEffect(() => {
    if(!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => {
      persistGoogleCalendarProviderToken(data.session)
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if(event === 'SIGNED_OUT') clearGoogleCalendarProviderToken()
      else persistGoogleCalendarProviderToken(nextSession)
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

  useEffect(() => {
    if(!supabase || !session?.user) return undefined
    const token = pendingInviteToken || readPendingHouseholdInvite()
    if(!token) return undefined
    let cancelled = false
    async function acceptInvite(){
      setInviteAccepting(true)
      setAuthError('')
      setMessage('')
      try{
        const result = await acceptHouseholdInvite(token)
        if(cancelled) return
        if(result.householdId) writeActiveHouseholdId(result.householdId)
        clearPendingHouseholdInvite()
        setPendingInviteToken('')
        setMessage(`Invitasjonen er godtatt. Du er koblet til ${result.householdName || 'familiehjemmet'}.`)
      }catch(error){
        if(cancelled) return
        setAuthError(error.message || 'Klarte ikke å godta familieinvitasjonen.')
      }finally{
        if(!cancelled) setInviteAccepting(false)
      }
    }
    acceptInvite()
    return () => { cancelled = true }
  }, [session?.user?.id, pendingInviteToken])

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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: `openid email profile ${GOOGLE_CALENDAR_SCOPE}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        },
        skipBrowserRedirect: true
      }
    })
    if(error){
      const missingSecret = error.message?.toLowerCase().includes('oauth secret')
      setAuthError(missingSecret ? 'Google-innlogging mangler OAuth secret i Supabase. Bruk e-postlenke, eller legg inn Google Client ID og Client Secret i Supabase Auth.' : error.message)
      return
    }
    if(data?.url){
      window.sessionStorage.setItem('travelvault-google-login-started', new Date().toISOString())
      window.location.replace(data.url)
    }
  }

  if(!supabase) return <MissingSupabaseConfig />

  if(loading || inviteAccepting){
    return <div className="page"><main className="phone"><LoadingSplash progress={inviteAccepting ? 78 : 62} loadingText={inviteAccepting ? 'Godtar familieinvitasjon ...' : 'Laster innlogging og reisedata ...'} footerText={inviteAccepting ? 'Kobler deg til familiehjemmet ...' : 'Klargjør Travelvault ...'}/></main></div>
  }

  if(!session){
    return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Alt fra turen samlet på ett sted.</p>{pendingInviteToken && <div className="authMsg ok">Familieinvitasjonen er klar. Logg inn med e-posten invitasjonen ble sendt til.</div>}{googleAuthEnabled && <><button className="googleBtn" onClick={signInWithGoogle} type="button"><span>G</span>Fortsett med Google</button><div className="authDivider"><span></span><b>eller</b><span></span></div></>}<label className="field"><span>E-post</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="navn@epost.no"/></label>{authError && <div className="authMsg error">{authError}</div>}{message && <div className="authMsg ok">{message}</div>}<button className="primary" onClick={signIn}>Logg inn med e-postlenke</button><small>{googleAuthEnabled ? 'Google-innlogging ber også om lesetilgang til Google Kalender, slik at Spond-aktiviteter som ligger der kan importeres.' : 'Google-innlogging er skjult til OAuth er konfigurert i Supabase. Bruk e-postlenke for testing nå.'}</small><div className="policyLinks"><a href="/privacy">Personvern</a><a href="/terms">Vilkår</a></div></div></section></main></div>
  }

  return <App session={session} />
}

function MissingSupabaseConfig(){
  return <div className="page"><main className="phone"><section className="screen authScreen"><div className="authCard"><img src="/logo-mark.png" alt="Travelvault"/><h1>Travelvault</h1><p>Innlogging er ikke riktig konfigurert.</p><div className="authMsg error">Travelvault krever Supabase Auth. Legg inn VITE_SUPABASE_URL og VITE_SUPABASE_PUBLISHABLE_KEY eller VITE_SUPABASE_ANON_KEY i miljøvariablene.</div><small>Lokalt leses dette fra .env.local i prosjektroten etter restart av Vite. På Netlify må de samme VITE_-variablene ligge i Site environment variables.</small></div></section></main></div>
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

export function App({ session, testMode = false }){
  const supabaseMode = Boolean(!testMode && supabase && session)
  const [storedTestState] = useState(() => testMode ? loadTestState() : { trips: [], detailsByTrip: {}, family: [], household: emptyHouseholdState() })
  const [view, setView] = useState('home')
  const [trips, setTrips] = useState(() => testMode ? storedTestState.trips : [])
  const [detailsByTrip, setDetailsByTrip] = useState(() => testMode ? storedTestState.detailsByTrip : {})
  const [family, setFamily] = useState(() => testMode ? storedTestState.family : [])
  const [household, setHousehold] = useState(() => testMode ? normalizeHouseholdState(storedTestState.household) : emptyHouseholdState())
  const [householdStorage, setHouseholdStorage] = useState(() => testMode ? { mode: 'local', householdId: null, tablesReady: false, realtime: false } : { mode: 'app_state', householdId: null, tablesReady: false, realtime: false })
  const [packingTemplates, setPackingTemplates] = useState(() => testMode ? readCustomPackingTemplates() : [])
  const [familyLoading, setFamilyLoading] = useState(supabaseMode)
  const [familyError, setFamilyError] = useState('')
  const [tripsLoading, setTripsLoading] = useState(supabaseMode)
  const [tripsError, setTripsError] = useState('')
  const [remoteStateReadyTripId, setRemoteStateReadyTripId] = useState(null)
  const [activeTrip, setActiveTrip] = useState(null)
  const [tab, setTab] = useState('na')
  const [mer, setMer] = useState('list')
  const [older, setOlder] = useState(false)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [packing, setPacking] = useState([])
  const [expenses, setExpenses] = useState([])
  const [matches, setMatches] = useState([])
  const [messages, setMessages] = useState([])
  const [documents, setDocuments] = useState([])
  const [documentTarget, setDocumentTarget] = useState(null)
  const [photos, setPhotos] = useState([])
  const [logistics, setLogistics] = useState(() => emptyLogistics())
  const [savingCreate, setSavingCreate] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [create, setCreate] = useState(() => createTripDraft(session))
  const [startupSplashDone] = useState(true)
  const [userStateReady, setUserStateReady] = useState(!supabaseMode)
  const reprocessedDocumentKeys = useRef(new Set())
  const remoteSaveErrorRef = useRef('')
  const skipNextHouseholdSaveRef = useRef(false)

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

  const loadFamily = useCallback(async () => {
    if(!supabaseMode) return
    setFamilyLoading(true)
    setFamilyError('')
    try{
      const rows = await fetchFamilyMembersForUser()
      setFamily(rows)
    }catch(error){
      setFamilyError(error.message || 'Klarte ikke å hente familie fra Supabase.')
    }finally{
      setFamilyLoading(false)
    }
  }, [supabaseMode])

  const loadUserState = useCallback(async () => {
    if(!supabaseMode) return
    setUserStateReady(false)
    try{
      const appState = await fetchUserAppState()
      const legacyHousehold = householdFromUserAppState(appState)
      setPackingTemplates(normalizePackingTemplates(appState.packingTemplates || appState.packing_templates || []))

      try{
        const remoteHousehold = await fetchHouseholdData({ householdId: readActiveHouseholdId() })
        if(remoteHousehold.householdId) writeActiveHouseholdId(remoteHousehold.householdId)
        const tableHousehold = normalizeHouseholdState(remoteHousehold.household || {})
        const hasTableContent = householdHasTableContent(tableHousehold)
        const nextHousehold = hasTableContent
          ? mergeHouseholdTableData(legacyHousehold, tableHousehold)
          : legacyHousehold
        skipNextHouseholdSaveRef.current = true
        setHousehold(nextHousehold)
        setHouseholdStorage({ mode: 'tables', householdId: remoteHousehold.householdId, tablesReady: true, realtime: true })
        if(!hasTableContent && householdHasTableContent(legacyHousehold)){
          await saveHouseholdData({ householdId: remoteHousehold.householdId, household: legacyHousehold })
        }
      }catch(remoteError){
        if(!isMissingHouseholdTablesError(remoteError)) throw remoteError
        setHousehold(legacyHousehold)
        setHouseholdStorage({ mode: 'app_state', householdId: null, tablesReady: false, realtime: false })
      }
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å hente brukerlagring fra Supabase.')
    }finally{
      setUserStateReady(true)
    }
  }, [supabaseMode])

  useEffect(() => { loadTrips() }, [loadTrips])
  useEffect(() => { loadFamily() }, [loadFamily])
  useEffect(() => { loadUserState() }, [loadUserState])

  const savePackingTemplates = useCallback(async (nextTemplates) => {
    const normalized = normalizePackingTemplates(nextTemplates)
    setPackingTemplates(normalized)
    if(!supabaseMode) writeCustomPackingTemplates(normalized)
  }, [supabaseMode])

  const updateHousehold = useCallback((updater) => {
    setHousehold(current => {
      const base = normalizeHouseholdState(current)
      const patch = typeof updater === 'function' ? updater(base) : updater
      return normalizeHouseholdState({ ...base, ...(patch || {}) })
    })
  }, [])

  useEffect(() => {
    if(testMode) saveTestState(trips, detailsByTrip, family, household)
  }, [testMode, trips, detailsByTrip, family, household])

  useEffect(() => {
    if(!supabaseMode || !userStateReady) return undefined
    if(skipNextHouseholdSaveRef.current){
      skipNextHouseholdSaveRef.current = false
      return undefined
    }
    const timer = window.setTimeout(async () => {
      try{
        const normalizedHousehold = normalizeHouseholdState(household)
        await updateUserAppState(buildUserAppState({ packingTemplates, household: normalizedHousehold }))
        if(householdStorage.tablesReady && householdStorage.householdId){
          await saveHouseholdData({ householdId: householdStorage.householdId, household: normalizedHousehold })
        }
      }catch(error){
        if(isMissingHouseholdTablesError(error)){
          setHouseholdStorage({ mode: 'app_state', householdId: null, tablesReady: false, realtime: false })
          return
        }
        setTripsError(error.message || 'Klarte ikke å lagre familieoversikten.')
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [supabaseMode, userStateReady, packingTemplates, household, householdStorage.tablesReady, householdStorage.householdId])

  useEffect(() => {
    if(!supabaseMode || !householdStorage.tablesReady || !householdStorage.householdId) return undefined
    let refreshTimer = null
    let cancelled = false
    const unsubscribe = subscribeToHouseholdData({
      householdId: householdStorage.householdId,
      onChange: () => {
        if(refreshTimer) window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(async () => {
          try{
            const remoteHousehold = await fetchHouseholdData({ householdId: householdStorage.householdId })
            if(cancelled) return
            skipNextHouseholdSaveRef.current = true
            setHousehold(current => mergeHouseholdTableData(current, remoteHousehold.household || {}))
          }catch(error){
            if(!isMissingHouseholdTablesError(error)) setTripsError(error.message || 'Klarte ikke å oppdatere familiehjemmet i sanntid.')
          }
        }, 350)
      }
    })
    return () => {
      cancelled = true
      if(refreshTimer) window.clearTimeout(refreshTimer)
      unsubscribe?.()
    }
  }, [supabaseMode, householdStorage.tablesReady, householdStorage.householdId])

  useEffect(() => {
    if(!testMode || !activeTrip) return
    setDetailsByTrip(current => ({
      ...current,
      [activeTrip.id]: { members, events, packing, expenses, matches, messages, documents, photos, logistics }
    }))
  }, [testMode, activeTrip, members, events, packing, expenses, matches, messages, documents, photos, logistics])

  useEffect(() => {
    if(!supabaseMode || !activeTrip || activeTrip.source === 'local' || remoteStateReadyTripId !== activeTrip.id) return undefined
    const payload = buildTripAppState({ events, packing, expenses, matches, messages, documents, photos, logistics })
    const timer = window.setTimeout(async () => {
      try{
        const savedAppState = await updateTripAppState({ tripId: activeTrip.id, appState: payload })
        remoteSaveErrorRef.current = ''
        setActiveTrip(current => current && current.id === activeTrip.id ? { ...current, appState: savedAppState } : current)
        setTrips(current => current.map(trip => trip.id === activeTrip.id ? { ...trip, appState: savedAppState } : trip))
      }catch(error){
        const message = error.message || 'Klarte ikke å lagre turinnholdet.'
        if(remoteSaveErrorRef.current !== message){
          remoteSaveErrorRef.current = message
          setTripsError(message)
        }
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [supabaseMode, activeTrip?.id, activeTrip?.source, remoteStateReadyTripId, events, packing, expenses, matches, messages, documents, photos, logistics])

  useEffect(() => {
    if(!activeTrip) return
    const nextEvent = nextUpcomingEvent(events)
    const nextMatch = matches[0]
    const next = nextEvent ? `${nextEvent.title}${nextEvent.time && nextEvent.time !== 'Ikke satt' ? ` kl. ${nextEvent.time}` : ''}` : nextMatch ? `Kamp mot ${nextMatch.opponent}${nextMatch.start ? ` kl. ${nextMatch.start}` : ''}` : 'Legg til første hendelse'
    const memberCount = Math.max(1, members.length)
    setActiveTrip(current => current && current.id === activeTrip.id ? { ...current, members: memberCount, next } : current)
    setTrips(current => current.map(trip => trip.id === activeTrip.id ? { ...trip, members: memberCount, next } : trip))
  }, [activeTrip?.id, members, events, matches])

  const resetContentForTrip = () => {
    setMembers(emptyTripContent.members)
    setEvents(emptyTripContent.events)
    setPacking(emptyTripContent.packing)
    setExpenses(emptyTripContent.expenses)
    setMatches(emptyTripContent.matches)
    setMessages(emptyTripContent.messages)
    setDocuments([])
    setDocumentTarget(null)
    setPhotos([])
    setLogistics(emptyLogistics())
  }

  const openTrip = async (trip) => {
    setRemoteStateReadyTripId(null)
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
      setMessages(details.messages || [])
      setDocuments(details.documents || [])
      setPhotos(details.photos || [])
      setLogistics(normalizeLogistics(details.logistics || trip.logistics))
      return
    }

    const savedState = normalizeTripAppState(trip.appState || {})
    setEvents(savedState.events)
    setPacking(savedState.packing)
    setExpenses(savedState.expenses)
    setMatches(savedState.matches)
    setMessages(savedState.messages)
    setPhotos(savedState.photos)
    setLogistics(logisticsHasContent(savedState.logistics) ? savedState.logistics : normalizeLogistics(trip.logistics))
    try{
      const [tripMembers, tripDocuments] = await Promise.all([
        fetchMembersForTrip(trip.id),
        fetchDocumentsForTrip(trip.id)
      ])
      setMembers(tripMembers)
      setDocuments(tripDocuments.length ? tripDocuments : savedState.documents)
      setRemoteStateReadyTripId(trip.id)
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å hente turinnhold.')
    }
  }

  const finishCreate = async () => {
    setTripsError('')
    const validationMessage = tripDraftValidationMessage(create)
    if(validationMessage){
      setTripsError(validationMessage)
      return
    }
    setSavingCreate(true)

    if(!supabaseMode){
      const { trip, members: createdMembers, seeded } = createLocalTripWithMembers(create, session)
      const details = { ...emptyTripDetails(createdMembers), events: seeded.events, packing: seeded.packing, documents: seeded.documents, logistics: seeded.logistics }
      setTrips(current => [trip, ...current.filter(item => item.id !== trip.id)])
      setDetailsByTrip(current => ({ ...current, [trip.id]: details }))
      setActiveTrip(trip)
      setMembers(createdMembers)
      setEvents(seeded.events)
      setPacking(seeded.packing)
      setExpenses([])
      setMatches([])
      setMessages([])
      setDocuments(seeded.documents)
      setDocumentTarget(null)
      setPhotos([])
      setLogistics(seeded.logistics)
      setRemoteStateReadyTripId(trip.id)
      setView('trip')
      setTab('mer')
      setMer('dokumenter')
      setCreate(createTripDraft(session))
      setSavingCreate(false)
      return
    }

    try{
      const { trip: savedTrip, members: createdMembers } = await createTripWithMembers({ create, session })
      const trip = { ...savedTrip, features: startFeatures(create), logistics: normalizeLogistics(create.logistics) }
      const seeded = seedStartContent(create)
      setTrips(current => [trip, ...current.filter(item => item.id !== trip.id)])
      setActiveTrip(trip)
      setMembers(createdMembers)
      setEvents(seeded.events)
      setPacking(seeded.packing)
      setExpenses([])
      setMatches([])
      setMessages([])
      setDocuments(seeded.documents)
      setDocumentTarget(null)
      setPhotos([])
      setLogistics(seeded.logistics)
      setRemoteStateReadyTripId(trip.id)
      setView('trip')
      setTab('mer')
      setMer('dokumenter')
      setCreate(createTripDraft(session))
      await loadTrips()
      await loadFamily()
    }catch(error){
      setTripsError(error.message || 'Klarte ikke å lagre turen.')
    }finally{
      setSavingCreate(false)
    }
  }

  const joinByInviteCode = async (code) => {
    const normalized = code.trim().toUpperCase()
    if(!normalized) return { ok: false, message: 'Skriv inn en invitasjonskode.' }
    const trip = trips.find(item => item.inviteCode === normalized)
    if(!trip) return { ok: false, message: 'Fant ingen lokal testtur med den koden.' }
    await openTrip(trip)
    return { ok: true }
  }

  const deleteActiveTrip = async () => {
    if(!activeTrip) return
    const nextTripId = activeTrip.id
    if(supabaseMode && activeTrip.source !== 'local'){
      await deleteTripById(nextTripId)
    }
    setTrips(current => current.filter(trip => trip.id !== nextTripId))
    setDetailsByTrip(current => {
      const next = { ...current }
      delete next[nextTripId]
      return next
    })
    setActiveTrip(null)
    setRemoteStateReadyTripId(null)
    setView('trips')
    setTab('na')
    setMer('list')
    if(supabaseMode) await loadTrips()
  }

  const saveTripEdits = async (draft) => {
    setEditError('')
    const validationMessage = tripDraftValidationMessage(draft)
    if(validationMessage){
      setEditError(validationMessage)
      return
    }
    setSavingEdit(true)
    try{
      let nextTrip = draftToTripPatch(draft, activeTrip)
      if(supabaseMode && activeTrip.source !== 'local'){
        const saved = await updateTripDetails({ tripId: activeTrip.id, create: draft })
        nextTrip = { ...saved, members: activeTrip.members, next: activeTrip.next, logistics: logisticsHasContent(saved.logistics) ? saved.logistics : activeTrip.logistics }
      }
      setActiveTrip(nextTrip)
      setTrips(current => current.map(trip => trip.id === nextTrip.id ? nextTrip : trip))
      setView('trip')
      setTab('mer')
      setMer('innstillinger')
      if(supabaseMode) await loadTrips()
    }catch(error){
      setEditError(error.message || 'Klarte ikke å lagre endringene.')
    }finally{
      setSavingEdit(false)
    }
  }

  const applyDocumentTripSuggestions = async (suggestion) => {
    if(!activeTrip || !suggestion?.hasSuggestions) return
    const suggestedLogistics = normalizeLogistics({ accommodation: suggestion.accommodation, transports: suggestion.transports })
    const currentLogistics = normalizeLogistics(logistics || activeTrip.logistics)
    const nextLogistics = {
      accommodation: hasAccommodation(suggestedLogistics.accommodation) ? suggestedLogistics.accommodation : currentLogistics.accommodation,
      transports: suggestedLogistics.transports.length ? suggestedLogistics.transports : currentLogistics.transports
    }
    const nextDraft = {
      ...tripToEditDraft(activeTrip),
      durationDays: suggestion.durationDays || activeTrip.durationDays || durationFromDateRange(activeTrip.startDate, activeTrip.endDate) || '',
      start: suggestion.startDate || activeTrip.startDate || '',
      end: suggestion.endDate || activeTrip.endDate || '',
      location: suggestion.destination || activeTrip.location || '',
      locationMeta: suggestion.destination ? null : activeTrip.locationMeta || null,
      logistics: nextLogistics
    }
    let nextTrip = draftToTripPatch(nextDraft, activeTrip)
    if(supabaseMode && activeTrip.source !== 'local'){
      try{
        const saved = await updateTripDetails({ tripId: activeTrip.id, create: nextDraft })
        nextTrip = { ...saved, members: activeTrip.members, next: activeTrip.next, features: activeTrip.features, logistics: nextLogistics }
      }catch(error){
        setTripsError(error.message || 'Klarte ikke å lagre smartforslagene på turen.')
      }
    }
    const importEvents = Array.isArray(suggestion.events) ? suggestion.events : []
    setEvents(current => {
      const currentEvents = current.filter(event => !isSupersededImportEvent(event, importEvents))
      const replacementByDocumentId = new Map(importEvents.filter(event => event.sourceDocumentId).map(event => [event.sourceDocumentId, event]))
      const existingDocumentIds = new Set(currentEvents.map(event => event.sourceDocumentId).filter(Boolean))
      const existingTitles = new Set(currentEvents.map(event => `${event.title}-${event.date || ''}`))
      const replaced = currentEvents.map(event => replacementByDocumentId.has(event.sourceDocumentId) ? replacementByDocumentId.get(event.sourceDocumentId) : event)
      const fresh = importEvents.filter(event => {
        if(event.sourceDocumentId && existingDocumentIds.has(event.sourceDocumentId)) return false
        return !existingTitles.has(`${event.title}-${event.date || ''}`)
      })
      return [...replaced, ...fresh]
    })
    setLogistics(nextLogistics)
    setActiveTrip(nextTrip)
    setTrips(current => current.map(trip => trip.id === nextTrip.id ? nextTrip : trip))
    setTab('na')
    setMer('list')
  }

  useEffect(() => {
    if(!activeTrip || !documents.length) return undefined
    let cancelled = false
    async function reprocessOldDocumentData(){
      const candidates = documents
        .filter(documentNeedsReprocess)
        .filter(document => !reprocessedDocumentKeys.current.has(`${activeTrip.id}:${document.id}`))
        .slice(0, 3)

      for(const document of candidates){
        const key = `${activeTrip.id}:${document.id}`
        reprocessedDocumentKeys.current.add(key)
        const nextDocument = await reprocessStoredDocument(document)
        if(cancelled || !nextDocument) continue
        setDocuments(current => current.map(row => row.id === nextDocument.id ? { ...row, ...nextDocument } : row))
        const suggestion = buildTripImportSuggestion([nextDocument])
        if(suggestion.hasSuggestions) await applyDocumentTripSuggestions(suggestion)
      }
    }
    reprocessOldDocumentData()
    return () => { cancelled = true }
  }, [activeTrip?.id, documents])

  const appDataLoading = tripsLoading || familyLoading
  const shouldShowStartupSplash = !startupSplashDone || (supabaseMode && appDataLoading && !trips.length && !family.length)
  const startupProgress = !startupSplashDone ? 65 : appDataLoading ? 82 : 100

  if(shouldShowStartupSplash){
    return <div className="page"><main className="phone"><LoadingSplash progress={startupProgress}/></main></div>
  }

  const familyNavVisible = familyNavViews.has(view)
  const shellClass = ['phone', familyNavVisible ? 'familyNavActive' : ''].filter(Boolean).join(' ')

  return <div className="page"><main className={shellClass}>
    {view === 'home' && <FamilyHome trips={trips} family={family} household={household} updateHousehold={updateHousehold} openTrip={openTrip} setView={setView} loading={tripsLoading || familyLoading} error={tripsError || familyError} showSignOut={supabaseMode} householdStorage={householdStorage}/>} 
    {view === 'calendar' && <FamilyCalendarView household={household} updateHousehold={updateHousehold} trips={trips} openTrip={openTrip} setView={setView} session={session}/>} 
    {view === 'shopping' && <ShoppingListView household={household} updateHousehold={updateHousehold} setView={setView}/>} 
    {view === 'tasks' && <HouseholdTasksView household={household} updateHousehold={updateHousehold} family={family} setView={setView}/>} 
    {view === 'familyChat' && <FamilyChatView household={household} updateHousehold={updateHousehold} family={family} trips={trips} setView={setView}/>} 
    {view === 'trips' && <TripsView older={older} setOlder={setOlder} openTrip={openTrip} setView={setView} trips={trips} loading={tripsLoading} error={tripsError || familyError} testMode={testMode} showSignOut={supabaseMode} onJoinByCode={joinByInviteCode} familyCount={family.length}/>}
    {view === 'create' && <CreateTrip create={create} setCreate={setCreate} setView={setView} finishCreate={finishCreate} saving={savingCreate} error={tripsError} family={family}/>}
    {view === 'trip' && activeTrip && <TripShell trip={activeTrip} setView={setView} tab={tab} setTab={setTab} mer={mer} setMer={setMer} members={members} setMembers={setMembers} events={events} setEvents={setEvents} packing={packing} setPacking={setPacking} packingTemplates={packingTemplates} savePackingTemplates={savePackingTemplates} expenses={expenses} setExpenses={setExpenses} matches={matches} setMatches={setMatches} messages={messages} setMessages={setMessages} documents={documents} setDocuments={setDocuments} documentTarget={documentTarget} setDocumentTarget={setDocumentTarget} photos={photos} setPhotos={setPhotos} logistics={logistics} setLogistics={setLogistics} deleteTrip={deleteActiveTrip} supabaseMode={supabaseMode} session={session} family={family} setFamily={setFamily} onApplyDocumentSuggestions={applyDocumentTripSuggestions} household={household} updateHousehold={updateHousehold}/>}
    {view === 'editTrip' && activeTrip && <EditTrip trip={activeTrip} setView={setView} saveTripEdits={saveTripEdits} saving={savingEdit} error={editError}/>}
    {view === 'family' && <FamilyView family={family} setFamily={setFamily} setView={setView} loading={familyLoading} supabaseMode={supabaseMode} session={session} householdStorage={householdStorage} reloadFamily={loadFamily}/>}
    {view === 'profile' && <ProfileView session={session} family={family} householdStorage={householdStorage} setView={setView} supabaseMode={supabaseMode}/>}
    {familyNavVisible && <FamilyBottomNav view={view} setView={setView}/>}
  </main></div>
}



function FamilyHome({ trips, family, household, updateHousehold, openTrip, setView, loading, error, showSignOut, householdStorage }){
  const normalized = normalizeHouseholdState(household)
  const agenda = buildFamilyAgenda(normalized, trips)
  const nextAgenda = agenda[0]
  const openShopping = normalized.shopping.filter(item => !item.checked)
  const openTasks = normalized.tasks.filter(task => !task.done)
  const latestMessages = normalized.messages.slice(-2)
  const upcomingTrips = (Array.isArray(trips) ? trips : []).filter(trip => trip.status !== 'Tidligere').slice(0, 3)

  return <section className="screen familyHomeScreen unifiedHomeScreen">
    <header className="appHeader familyHomeTop">
      <div className="brandRow"><img src="/logo-mark.png" alt="Travelvault"/><div><h1>Travelvault</h1><p>Familie, hverdag og reiser samlet</p></div></div>
      {showSignOut && <button className="signOutBtn" onClick={() => supabase.auth.signOut()}>Logg ut</button>}
    </header>
    <div className="content gap-xl familyHomeContent">
      {error && <div className="authMsg error">{error}</div>}
      <section className="homeStatusGrid" aria-label="Oversikt">
        <button className="homeStatusCard nextStatus" type="button" onClick={() => setView('calendar')}>
          <small>Neste</small>
          <b>{nextAgenda ? nextAgenda.title : 'Ingen avtaler i dag'}</b>
          <span>{nextAgenda ? formatAgendaMeta(nextAgenda) : 'Legg inn en avtale, oppgave eller tur når noe skal planlegges.'}</span>
        </button>
        <button className="homeStatusCard" type="button" onClick={() => setView('calendar')}><small>Kalender</small><b>{agenda.length}</b><span>kommende punkt</span></button>
        <button className="homeStatusCard" type="button" onClick={() => setView('tasks')}><small>Må ordnes</small><b>{openTasks.length}</b><span>åpne oppgaver</span></button>
        <button className="homeStatusCard" type="button" onClick={() => setView('shopping')}><small>Handleliste</small><b>{openShopping.length}</b><span>varer mangler</span></button>
      </section>
      <p className="storageLine">{householdStorageStatusLabel(householdStorage)}</p>

      <section className="familyActionGrid compactActions">
        <FamilyHomeTile icon={CalendarDays} title="Kalender" text="Avtaler, oppgaver og reiser" onClick={() => setView('calendar')}/>
        <FamilyHomeTile icon={ClipboardList} title="Må ordnes" text={`${openTasks.length || 'Ingen'} åpne oppgaver`} onClick={() => setView('tasks')}/>
        <FamilyHomeTile icon={ListChecks} title="Handleliste" text={`${openShopping.length || 'Ingen'} varer mangler`} onClick={() => setView('shopping')}/>
        <FamilyHomeTile icon={MessageSquare} title="Chat" text={latestMessages.length ? 'Siste meldinger klare' : 'Start felles chat'} onClick={() => setView('familyChat')}/>
        <FamilyHomeTile icon={Plane} title="Planer og reiser" text={`${upcomingTrips.length} kommende`} onClick={() => setView('trips')}/>
        <FamilyHomeTile icon={Users} title="Min familie" text={`${family.length || 'Legg til'} medlemmer`} onClick={() => setView('family')}/>
      </section>

      <section className="familyHomeGrid">
        <div className="dashboardPanel familyPanel"><div className="dashboardSectionHead"><h2>Denne uken</h2><button className="textButton" type="button" onClick={() => setView('calendar')}>Åpne kalender</button></div><AgendaPreview agenda={agenda} openTrip={openTrip} openCalendar={() => setView('calendar')} openTasks={() => setView('tasks')}/></div>
        <div className="dashboardAside"><HomeTasksPreview household={normalized} updateHousehold={updateHousehold} setView={setView}/><HomeShoppingPreview household={normalized} updateHousehold={updateHousehold} setView={setView}/><HomeChatPreview household={normalized} updateHousehold={updateHousehold} setView={setView}/></div>
      </section>

      <section><div className="dashboardSectionHead"><h2>Planer og reiser</h2><button className="textButton" type="button" onClick={() => setView('trips')}>Se alle</button></div>{loading && <Empty title="Henter planer" text="Laster familie, turer og brukerdata."/>}{!loading && upcomingTrips.length ? upcomingTrips.map(trip => <TripCard key={trip.id} trip={trip} openTrip={openTrip}/>) : !loading && <Empty title="Ingen turer ennå" text="Opprett første tur, cup eller helgeplan." action="Opprett ny tur" onAction={() => setView('create')}/>}</section>
    </div>
  </section>
}

function FamilyHomeTile({ icon: Icon, title, text, onClick }){
  return <button className="familyHomeTile" type="button" onClick={onClick}><span className="iconTile"><Icon size={18}/></span><b>{title}</b><small>{text}</small></button>
}

function FamilyBottomNav({ view, setView }){
  const activeId = activeFamilyNavId(view)
  return <nav className="familyBottomNav" aria-label="Hovedmeny">
    {familyNavItems.map(([id, Icon, label]) => <button key={id} type="button" className={activeId === id ? 'active' : ''} aria-current={activeId === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={20}/><span>{label}</span></button>)}
  </nav>
}

function ProfileView({ session, family, householdStorage, setView, supabaseMode }){
  const user = session?.user || {}
  const metadata = user.user_metadata || {}
  const displayName = metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Travelvault-bruker'
  const avatarUrl = metadata.avatar_url || metadata.picture || ''
  const usesGoogle = user.app_metadata?.provider === 'google' || user.identities?.some(identity => identity.provider === 'google')
  const loginMethod = supabaseMode ? (usesGoogle ? 'Google' : 'E-postlenke') : 'Lokal testmodus'
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TV'

  return <section className="screen with-actions profileScreen">
    <TopLine title="Profil" onBack={() => setView('home')}/>
    <div className="content gap-xl">
      <section className="profileHeroCard card">
        <div className="profileIdentity">
          {avatarUrl ? <img src={avatarUrl} alt="" className="profileAvatar"/> : <span className="profileAvatar fallback">{initials}</span>}
          <div>
            <h2>{displayName}</h2>
            <p>{user.email || 'Ingen e-post i lokal testmodus'}</p>
          </div>
        </div>
        <div className="profileMetaGrid">
          <div><small>Innlogging</small><b>{loginMethod}</b></div>
          <div><small>Familie</small><b>{family.length || 0} medlemmer</b></div>
          <div><small>Lagring</small><b>{householdStorageStatusLabel(householdStorage)}</b></div>
        </div>
      </section>

      <section className="profileActionList card">
        <button type="button" onClick={() => setView('family')}><Users size={18}/><span>Min familie</span></button>
        <button type="button" onClick={() => setView('calendar')}><CalendarDays size={18}/><span>Kalender og Spond via Google</span></button>
        <button type="button" onClick={() => setView('trips')}><Plane size={18}/><span>Planer og reiser</span></button>
        {supabaseMode && <button className="dangerText" type="button" onClick={() => supabase?.auth.signOut()}><LogOut size={18}/><span>Logg ut</span></button>}
      </section>
    </div>
  </section>
}

function AgendaPreview({ agenda, openTrip, openCalendar, openTasks }){
  const rows = agenda.slice(0, 5)
  if(!rows.length) return <Empty title="Ingen avtaler lagt inn" text="Legg inn trening, skole, bursdag, Spond/iCal eller andre avtaler familien må huske." action="Legg til avtale" onAction={openCalendar}/>
  const openRow = row => {
    if(row.trip) openTrip(row.trip)
    else if(row.task && openTasks) openTasks()
    else openCalendar()
  }
  return <div className="agendaList">{rows.map(row => <button className="agendaRow" key={row.id} type="button" onClick={() => openRow(row)}><span>{formatShortDate(row.date)}</span><div><b>{row.title}</b><small>{formatAgendaMeta(row)}{row.note ? ` · ${row.note}` : ''}</small></div><em>{row.kind === 'trip' ? 'Plan' : row.sourceLabel}</em></button>)}</div>
}
function HomeTasksPreview({ household, updateHousehold, setView }){
  const [draft, setDraft] = useState('')
  const tasks = normalizeHouseholdState(household).tasks
  const openTasks = tasks.filter(task => !task.done)
  const add = () => {
    const title = draft.trim()
    if(!title) return
    updateHousehold(current => ({ tasks: [createTaskFromTitle(title), ...current.tasks] }))
    setDraft('')
  }
  const toggle = (id) => updateHousehold(current => ({ tasks: current.tasks.map(task => task.id === id ? { ...task, done: !task.done, updatedAt: new Date().toISOString() } : task) }))
  return <section className="dashboardPanel compactPanel"><div className="dashboardSectionHead"><h2>Må ordnes</h2><button className="textButton" type="button" onClick={() => setView('tasks')}>Åpne</button></div><div className="miniComposer"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); add() } }} placeholder="Legg til oppgave"/><button type="button" onClick={add}>Legg til</button></div>{openTasks.slice(0, 4).map(task => <div className="familyMiniRow" key={task.id}><button className={`checkButton ${task.done ? 'checked' : ''}`} type="button" onClick={() => toggle(task.id)}>{task.done ? '✓' : ''}</button><span>{task.title}</span>{task.dueDate && <small>{formatShortDate(task.dueDate)}</small>}</div>)}{!openTasks.length && <p className="softText">Ingen åpne oppgaver.</p>}</section>
}
function HomeShoppingPreview({ household, updateHousehold, setView }){
  const [draft, setDraft] = useState('')
  const shopping = normalizeHouseholdState(household).shopping
  const openItems = shopping.filter(item => !item.checked)
  const add = () => {
    const title = draft.trim()
    if(!title) return
    updateHousehold(current => ({ shopping: [createShoppingItemFromTitle(title), ...current.shopping] }))
    setDraft('')
  }
  const toggle = (id) => updateHousehold(current => ({ shopping: current.shopping.map(item => item.id === id ? { ...item, checked: !item.checked, updatedAt: new Date().toISOString() } : item) }))
  return <section className="dashboardPanel compactPanel"><div className="dashboardSectionHead"><h2>Handleliste</h2><button className="textButton" type="button" onClick={() => setView('shopping')}>Åpne</button></div><div className="miniComposer"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); add() } }} placeholder="Legg til vare"/><button type="button" onClick={add}>Legg til</button></div>{openItems.slice(0, 4).map(item => <div className="familyMiniRow" key={item.id}><button className={`checkButton ${item.checked ? 'checked' : ''}`} type="button" onClick={() => toggle(item.id)}>{item.checked ? '✓' : ''}</button><span>{item.title}</span></div>)}{!openItems.length && <p className="softText">Handlelisten er tom.</p>}</section>
}
function HomeChatPreview({ household, updateHousehold, setView }){
  const [draft, setDraft] = useState('')
  const messages = normalizeHouseholdState(household).messages
  const send = () => {
    const text = draft.trim()
    if(!text) return
    updateHousehold(current => ({ messages: [...current.messages, { id: createClientId('family-msg'), author: 'Du', text, createdAt: new Date().toISOString(), threadId: 'family', threadTitle: 'Familien' }] }))
    setDraft('')
  }
  return <section className="dashboardPanel compactPanel"><div className="dashboardSectionHead"><h2>Chat</h2><button className="textButton" type="button" onClick={() => setView('familyChat')}>Åpne</button></div>{messages.slice(-2).map(message => <div className="familyMessagePreview" key={message.id}><b>{message.threadTitle || message.author}</b><p>{message.text}</p></div>)}{!messages.length && <p className="softText">Ingen meldinger ennå.</p>}<div className="miniComposer"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); send() } }} placeholder="Skriv rask beskjed"/><button type="button" onClick={send}>Send</button></div></section>
}
function ShoppingListView({ household, updateHousehold, setView }){
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('Mangler')
  const shopping = normalizeHouseholdState(household).shopping
  const rows = shopping.filter(item => filter === 'Alle' || (filter === 'Kjøpt' ? item.checked : !item.checked))
  const add = () => {
    const title = draft.trim()
    if(!title) return
    updateHousehold(current => ({ shopping: [createShoppingItemFromTitle(title), ...current.shopping] }))
    setDraft('')
  }
  const toggle = (id) => updateHousehold(current => ({ shopping: current.shopping.map(item => item.id === id ? { ...item, checked: !item.checked, updatedAt: new Date().toISOString() } : item) }))
  const remove = (id) => updateHousehold(current => ({ shopping: current.shopping.filter(item => item.id !== id) }))
  return <section className="screen"><TopLine title="Handleliste" onBack={() => setView('home')}/><div className="content gap-xl"><section className="familyHeaderCard card"><div><h2>Felles handleliste</h2><p>Alle i familien deler samme liste. Pakkelistens «må kjøpes» kan nå sendes hit fra en tur.</p></div></section><div className="keepComposer card"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); add() } }} placeholder="Skriv f.eks. melk, brød, solkrem …"/><button className="primary" type="button" onClick={add}>Legg til</button></div><div className="chips">{['Alle', 'Mangler', 'Kjøpt'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{rows.length ? rows.map(item => <div className="householdListRow" key={item.id}><button className={`checkButton ${item.checked ? 'checked' : ''}`} type="button" onClick={() => toggle(item.id)}>{item.checked ? '✓' : ''}</button><div><b className={item.checked ? 'done' : ''}>{item.title}</b><small>{[item.source === 'trip' ? 'Fra tur/pakkeliste' : 'Familieliste', item.note].filter(Boolean).join(' · ')}</small></div><button className="rowAction" type="button" onClick={() => remove(item.id)}>Fjern</button></div>) : <Empty title="Ingen varer" text="Legg til det familien må handle."/>}</div></section>
}
function HouseholdTasksView({ household, updateHousehold, family, setView }){
  const [filter, setFilter] = useState('Åpne')
  const [draft, setDraft] = useState({ title: '', dueDate: '', person: '', priority: 'normal', notes: '' })
  const tasks = normalizeHouseholdState(household).tasks
  const rows = tasks
    .filter(task => filter === 'Alle' || (filter === 'Ferdig' ? task.done : !task.done))
    .sort((a, b) => sortableDateTime(a.dueDate, '').localeCompare(sortableDateTime(b.dueDate, '')) || a.createdAt.localeCompare(b.createdAt))
  const updateDraft = patch => setDraft(current => ({ ...current, ...patch }))
  const add = () => {
    const title = draft.title.trim()
    if(!title) return
    updateHousehold(current => ({ tasks: [createTaskFromTitle(title, { dueDate: draft.dueDate, person: draft.person.trim(), priority: draft.priority, notes: draft.notes.trim() }), ...current.tasks] }))
    setDraft({ title: '', dueDate: '', person: '', priority: 'normal', notes: '' })
  }
  const toggle = (id) => updateHousehold(current => ({ tasks: current.tasks.map(task => task.id === id ? { ...task, done: !task.done, updatedAt: new Date().toISOString() } : task) }))
  const remove = (id) => updateHousehold(current => ({ tasks: current.tasks.filter(task => task.id !== id) }))
  return <section className="screen"><TopLine title="Må ordnes" onBack={() => setView('home')}/><div className="content gap-xl"><section className="familyHeaderCard card"><div><h2>Familiens oppgaver</h2><p>Ting som må huskes, bestilles, betales eller avklares. Oppgaver med frist vises også i familiehjemmet og kalenderoversikten.</p></div></section><div className="inlineForm expanded taskForm"><input value={draft.title} onChange={e => updateDraft({ title: e.target.value })} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); add() } }} placeholder="Hva må ordnes?"/><div className="two"><input type="date" value={draft.dueDate} onChange={e => updateDraft({ dueDate: e.target.value })}/><select value={draft.priority} onChange={e => updateDraft({ priority: e.target.value })}><option value="normal">Normal</option><option value="high">Viktig</option><option value="low">Lav</option></select></div><input value={draft.person} onChange={e => updateDraft({ person: e.target.value })} placeholder={family.length ? 'Hvem? F.eks. Ola' : 'Hvem gjelder det?'}/><textarea value={draft.notes} onChange={e => updateDraft({ notes: e.target.value })} placeholder="Notat"/><div><button type="button" onClick={() => setDraft({ title: '', dueDate: '', person: '', priority: 'normal', notes: '' })}>Tøm</button><button type="button" onClick={add}>Legg til oppgave</button></div></div><div className="chips">{['Åpne', 'Ferdig', 'Alle'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{rows.length ? rows.map(task => <div className="householdListRow taskListRow" key={task.id}><button className={`checkButton ${task.done ? 'checked' : ''}`} type="button" onClick={() => toggle(task.id)}>{task.done ? '✓' : ''}</button><div><b className={task.done ? 'done' : ''}>{task.title}</b><small>{[task.dueDate ? formatShortDate(task.dueDate) : '', task.person, task.priority === 'high' ? 'Viktig' : '', task.notes].filter(Boolean).join(' · ') || 'Ingen frist'}</small></div><button className="rowAction" type="button" onClick={() => remove(task.id)}>Fjern</button></div>) : <Empty title="Ingen oppgaver" text="Legg til noe familien må ordne."/>}</div></section>
}
function FamilyChatView({ household, updateHousehold, family, trips = [], setView }){
  const [draft, setDraft] = useState('')
  const agendaThreads = buildFamilyAgenda(household, trips).slice(0, 5).map(row => ({ id: `agenda:${row.id}`, title: row.title, subtitle: row.sourceLabel }))
  const threads = [{ id: 'family', title: 'Familien', subtitle: 'Felles chat' }, ...agendaThreads]
  const [threadId, setThreadId] = useState('family')
  const activeThread = threads.find(thread => thread.id === threadId) || threads[0]
  const messages = normalizeHouseholdState(household).messages
  const visibleMessages = messages.filter(message => (message.threadId || 'family') === activeThread.id)
  const send = () => {
    const text = draft.trim()
    if(!text) return
    updateHousehold(current => ({ messages: [...current.messages, { id: createClientId('family-msg'), author: 'Du', text, createdAt: new Date().toISOString(), threadId: activeThread.id, threadTitle: activeThread.title }] }))
    setDraft('')
  }
  return <section className="screen with-actions"><TopLine title="Chat" onBack={() => setView('home')}/><div className="content gap-xl"><section className="familyHeaderCard card"><div><h2>Felles chat</h2><p>Beskjeder til hele familien, med egne tråder for kommende avtaler og planer.</p></div></section><div className="chips chatThreadChips">{threads.map(thread => <button className={threadId === thread.id ? 'active' : ''} type="button" onClick={() => setThreadId(thread.id)} key={thread.id}>{thread.title}</button>)}</div><div className="chatScreen"><div className="chatMessages">{visibleMessages.length ? visibleMessages.map(message => <div className={`chatBubble ${message.author === 'Du' ? 'mine' : ''}`} key={message.id}><b>{message.author}</b><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div>) : <Empty title="Ingen meldinger ennå" text={activeThread.id === 'family' ? (family.length ? `Start samtalen med ${family.length} familiemedlemmer.` : 'Legg til familien, eller skriv første beskjed her.') : `Start tråden for ${activeThread.title}.`}/>}</div><div className="chatComposer"><small>{activeThread.title}</small><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Skriv melding til familien"></textarea><button type="button" className="primary" onClick={send}>Send melding</button></div></div></div></section>
}
function CalendarIntegrationPanel({ household, updateHousehold, setImportMessage, session }){
  const normalized = normalizeHouseholdState(household)
  const [googleToken, setGoogleToken] = useState(() => session?.provider_token || readGoogleCalendarProviderToken())
  const [calendars, setCalendars] = useState([])
  const [selectedCalendarIds, setSelectedCalendarIds] = useState(() => normalized.calendarSources.google.selectedCalendarIds)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const providerTokenReady = Boolean(googleToken || session?.provider_token || readGoogleCalendarProviderToken())
  const googleSource = normalized.calendarSources.google
  const daysAhead = googleCalendarConfig().daysAhead

  useEffect(() => {
    const token = session?.provider_token || readGoogleCalendarProviderToken()
    if(token) setGoogleToken(token)
  }, [session?.provider_token])

  const getCalendarToken = () => {
    const existing = googleToken || session?.provider_token || readGoogleCalendarProviderToken()
    if(existing){
      setGoogleToken(existing)
      return existing
    }
    throw new Error('Google-innloggingen mangler kalender-token. Logg ut og inn med Google igjen, og godkjenn lesetilgang til Google Kalender.')
  }

  const loadGoogleCalendars = async (token) => {
    try{
      return { token, rows: await fetchGoogleCalendars(token) }
    }catch(error){
      const authLikeError = /auth|token|scope|permission|forbidden|unauthorized|401|403/i.test(error.message || '')
      if(authLikeError){
        clearGoogleCalendarProviderToken()
        setGoogleToken('')
        throw new Error('Google-tokenet mangler kalendertilgang eller er utløpt. Logg ut og inn med Google igjen, og godkjenn lesetilgang til Google Kalender.')
      }
      throw error
    }
  }

  const upsertGoogleSource = (patch) => updateHousehold(current => ({ calendarSources: { ...current.calendarSources, google: { ...current.calendarSources.google, ...patch } } }))
  const connectGoogle = async () => {
    setSyncing(true)
    setSyncError('')
    setSyncMessage('')
    try{
      const initialToken = getCalendarToken()
      const { token, rows } = await loadGoogleCalendars(initialToken)
      setGoogleToken(token)
      setCalendars(rows)
      const saved = normalized.calendarSources.google.selectedCalendarIds
      const initialSelection = saved.length ? saved : rows.filter(calendar => calendar.primary).map(calendar => calendar.id)
      setSelectedCalendarIds(initialSelection.length ? initialSelection : rows.slice(0, 3).map(calendar => calendar.id))
      upsertGoogleSource({ connected: true, calendarNames: Object.fromEntries(rows.map(calendar => [calendar.id, calendar.name])) })
      setSyncMessage(rows.length ? 'Google Kalender er koblet. Velg kalenderne som inneholder familie- og Spond-aktivitet, og trykk synkroniser.' : 'Google Kalender er koblet, men ingen lesbare kalendere ble funnet.')
    }catch(error){
      setSyncError(error.message || 'Klarte ikke å koble Google Kalender.')
    }finally{
      setSyncing(false)
    }
  }
  const toggleCalendar = id => setSelectedCalendarIds(current => current.includes(id) ? current.filter(row => row !== id) : [...current, id])
  const syncGoogle = async () => {
    setSyncing(true)
    setSyncError('')
    setSyncMessage('')
    try{
      let token = getCalendarToken()
      let rows = calendars
      if(!rows.length){
        const loaded = await loadGoogleCalendars(token)
        token = loaded.token
        rows = loaded.rows
        setCalendars(rows)
      }
      const selectedIds = selectedCalendarIds.length ? selectedCalendarIds : (googleSource.selectedCalendarIds.length ? googleSource.selectedCalendarIds : rows.filter(calendar => calendar.primary).map(calendar => calendar.id))
      const selectedCalendars = rows.filter(calendar => selectedIds.includes(calendar.id))
      if(!selectedCalendars.length) throw new Error('Velg minst én kalender før synkronisering.')
      const result = await fetchGoogleCalendarEvents({ accessToken: token, calendars: selectedCalendars, daysAhead })
      const selectedSet = new Set(selectedCalendars.map(calendar => calendar.id))
      updateHousehold(current => {
        const base = normalizeHouseholdState(current)
        const kept = base.calendarEvents.filter(event => !(event.sourceType === 'google' && selectedSet.has(event.calendarId)))
        return {
          calendarEvents: [...kept, ...result.events],
          calendarSources: {
            ...base.calendarSources,
            google: {
              connected: true,
              selectedCalendarIds: selectedCalendars.map(calendar => calendar.id),
              calendarNames: Object.fromEntries(rows.map(calendar => [calendar.id, calendar.name])),
              lastImportAt: new Date().toISOString(),
              lastImportCount: result.events.length
            }
          }
        }
      })
      const warning = result.errors.length ? ` Noen kalendere feilet: ${result.errors.join(' ')}` : ''
      const spondCount = result.events.filter(event => event.source === 'Spond via Google').length
      const spondPart = spondCount ? ` ${spondCount} av dem er merket som Spond-aktivitet.` : ''
      setSyncMessage(`${result.events.length} avtaler hentet fra Google for de neste ${daysAhead} dagene.${spondPart}${warning}`)
    }catch(error){
      setSyncError(error.message || 'Klarte ikke å synkronisere Google Kalender.')
    }finally{
      setSyncing(false)
    }
  }
  const importIcsFile = async (event) => {
    const file = event.target.files?.[0]
    if(!file) return
    try{
      const text = await readUploadedText(file)
      const sourceLabel = /spond/i.test(file.name) ? 'Spond/iCal' : /google/i.test(file.name) ? 'Google iCal' : 'iCal-import'
      const parsed = parseIcsEvents(text, sourceLabel)
      if(!parsed.length){
        setImportMessage('Fant ingen avtaler i iCal-filen.')
        return
      }
      const current = normalizeHouseholdState(household)
      const existingKeys = new Set(current.calendarEvents.map(row => row.sourceKey || `${row.source}-${row.title}-${row.date}-${row.time}`))
      const fresh = parsed.filter(row => !existingKeys.has(row.sourceKey || `${row.source}-${row.title}-${row.date}-${row.time}`))
      updateHousehold({ calendarEvents: [...current.calendarEvents, ...fresh] })
      setImportMessage(`${fresh.length} av ${parsed.length} avtaler importert fra ${file.name}.`)
    }catch(error){
      setImportMessage(error.message || 'Klarte ikke å lese iCal-filen.')
    }finally{
      event.target.value = ''
    }
  }

  return <section className="calendarIntegration card"><div><h2>Importer kalender</h2><p>Google Kalender kan hente inn både vanlige avtaler og Spond-aktiviteter som allerede ligger i kalenderen din. iCal/ICS kan fortsatt brukes manuelt.</p>{googleSource.lastImportAt && <small>Sist Google-sync: {new Date(googleSource.lastImportAt).toLocaleString('nb-NO')} · {googleSource.lastImportCount} avtaler</small>}</div><div className="integrationTools"><div className="integrationBadges"><span>Spond via Google: klar</span><span>iCal: klar</span>{providerTokenReady && <span>Google Kalender: via innlogging</span>}</div>{providerTokenReady && <div className="calendarConnectBox"><div className="miniActionsWide"><button className="secondary" type="button" onClick={connectGoogle} disabled={syncing}>{googleSource.connected ? 'Oppdater kalendere' : 'Hent kalendere'}</button><button className="primary" type="button" onClick={syncGoogle} disabled={syncing}>{syncing ? 'Synker …' : 'Synkroniser'}</button></div>{calendars.length > 0 && <div className="calendarChoices">{calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={selectedCalendarIds.includes(calendar.id)} onChange={() => toggleCalendar(calendar.id)}/><span>{calendar.name}</span></label>)}</div>}</div>}<label className="icsImportButton"><input aria-label="Velg .ics-fil" type="file" accept=".ics,text/calendar" onChange={importIcsFile}/><Upload size={16}/>Importer .ics-fil</label>{!providerTokenReady && <small>Logg inn med Google og godkjenn kalenderlesing for å synkronisere direkte. Ingen egen Google API-kobling brukes her.</small>}{syncError && <div className="authMsg error">{syncError}</div>}{syncMessage && <div className="authMsg ok">{syncMessage}</div>}</div></section>
}
function FamilyCalendarView({ household, updateHousehold, trips, openTrip, setView, session }){
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', date: isoToday(), time: '', person: '', location: '', source: 'Manuell', notes: '' })
  const [importMessage, setImportMessage] = useState('')
  const agenda = buildFamilyAgenda(household, trips)
  const updateDraft = patch => setDraft(current => ({ ...current, ...patch }))
  const add = () => {
    if(!draft.title.trim()) return
    updateHousehold(current => ({ calendarEvents: [...current.calendarEvents, { ...draft, id: createClientId('family-event'), title: draft.title.trim(), sourceType: 'manual', createdAt: new Date().toISOString() }] }))
    setDraft({ title: '', date: isoToday(), time: '', person: '', location: '', source: 'Manuell', notes: '' })
    setFormOpen(false)
  }
  const remove = (id) => updateHousehold(current => ({ calendarEvents: current.calendarEvents.filter(event => event.id !== id) }))
  const openRow = row => {
    if(row.trip) openTrip(row.trip)
    else if(row.task) setView('tasks')
  }
  return <section className="screen"><TopLine title="Kalender" onBack={() => setView('home')}/><div className="content gap-xl"><CalendarIntegrationPanel household={household} updateHousehold={updateHousehold} setImportMessage={setImportMessage} session={session}/>{importMessage && <div className="authMsg ok">{importMessage}</div>}<section><div className="dashboardSectionHead"><h2>Avtaler og planer</h2><button className="primary mini" type="button" onClick={() => setFormOpen(true)}><Plus size={16}/>Legg til</button></div>{formOpen && <div className="inlineForm expanded familyCalendarForm"><input value={draft.title} onChange={e => updateDraft({ title: e.target.value })} placeholder="Tittel, f.eks. Trening"/><div className="two"><input type="date" value={draft.date} onChange={e => updateDraft({ date: e.target.value })}/><input type="time" value={draft.time} onChange={e => updateDraft({ time: e.target.value })}/></div><input value={draft.person} onChange={e => updateDraft({ person: e.target.value })} placeholder="Hvem gjelder det?"/><input value={draft.location} onChange={e => updateDraft({ location: e.target.value })} placeholder="Sted"/><select value={draft.source} onChange={e => updateDraft({ source: e.target.value })}><option>Manuell</option><option>Google Kalender</option><option>Spond</option><option>Skole</option></select><textarea value={draft.notes} onChange={e => updateDraft({ notes: e.target.value })} placeholder="Notat"/><div><button type="button" onClick={() => setFormOpen(false)}>Avbryt</button><button type="button" onClick={add}>Lagre avtale</button></div></div>}{agenda.length ? <div className="agendaList">{agenda.map(row => <div className="agendaRow calendarFullRow" key={row.id}><button type="button" onClick={() => openRow(row)}><span>{formatShortDate(row.date)}</span><div><b>{row.title}</b><small>{formatAgendaMeta(row)}{row.note ? ` · ${row.note}` : ''}</small></div><em>{row.kind === 'trip' ? 'Plan' : row.sourceLabel}</em></button>{row.kind === 'calendar' && <button className="rowAction" type="button" onClick={() => remove(row.id)}>Fjern</button>}</div>)}</div> : <Empty title="Ingen avtaler" text="Legg inn første avtale manuelt, importer .ics eller koble Google Kalender." action="Legg til avtale" onAction={() => setFormOpen(true)}/>}</section></div></section>
}

function TripsView({ older, setOlder, openTrip, setView, trips, loading, error, testMode, showSignOut, onJoinByCode, familyCount }){
  const [joining, setJoining] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const ongoing = trips.filter(t => t.status === 'Pågår')
  const upcoming = trips.filter(t => t.status === 'Kommende')
  const previous = trips.filter(t => t.status === 'Tidligere')
  const hasTrips = trips.length > 0
  const join = async () => {
    const result = await onJoinByCode(joinCode)
    if(result?.ok){
      setJoinError('')
      setJoinCode('')
      setJoining(false)
      return
    }
    setJoinError(result?.message || 'Klarte ikke å bruke invitasjonskoden.')
  }

  const emptyText = testMode ? 'Opprett første tur for å teste flyten lokalt. Ingenting krever innlogging akkurat nå.' : 'Opprett første tur, så lagres den i Supabase og vises her neste gang du logger inn.'

  return <section className="screen with-actions"><header className="appHeader"><div className="brandRow"><img src="/logo-mark.png" alt="Travelvault"/><div><h1>Planer og reiser</h1><p>Turer, cuper og ferier i samme Travelvault</p></div></div>{showSignOut && <button className="signOutBtn" onClick={() => supabase.auth.signOut()}>Logg ut</button>}</header><div className="content gap-xl">
    {error && <div className="authMsg error">{error}</div>}
    {joinError && <div className="authMsg error">{joinError}</div>}
    {joining && <div className="inlineForm"><input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Invitasjonskode"/><div><button onClick={() => setJoining(false)} type="button">Avbryt</button><button onClick={join} type="button">Bli med</button></div></div>}
    {loading && <Empty title="Henter turer" text="Laster dine Travelvault-turer fra Supabase." />}
    {!loading && !hasTrips && <Empty title="Ingen turer ennå" text={emptyText} action="Opprett ny tur" onAction={() => setView('create')} />}
    {!!ongoing.length && <TripSection title="Pågående" trips={ongoing} openTrip={openTrip}/>} 
    {!!upcoming.length && <TripSection title="Kommende" trips={upcoming} openTrip={openTrip}/>} 
    {!!previous.length && <div><button className="sectionToggle" onClick={() => setOlder(!older)}><span>Tidligere turer</span><b>{older ? 'Skjul' : 'Vis'}</b></button>{older && previous.map(trip => <TripCard key={trip.id} trip={trip} muted openTrip={openTrip}/>)}</div>}
  </div><div className="bottomActions"><button className="primary withIcon" onClick={() => setView('create')}><Plus size={18}/>Opprett ny tur</button><button className="secondary withIcon" type="button" onClick={() => setView('family')}><Users size={18}/>Min familie{familyCount ? ` (${familyCount})` : ''}</button><button className="secondary withIcon" type="button" onClick={() => setJoining(true)}><UserPlus size={18}/>Bli med via invitasjonskode</button></div></section>
}

function TripSection({ title, trips, openTrip }){
  return <div><h2 className="sectionTitle">{title}</h2>{trips.map(trip => <TripCard key={trip.id} trip={trip} openTrip={openTrip}/>)}</div>
}

function TripCard({ trip, muted, openTrip }){
  const meta = [trip.date, trip.location, `${trip.members} deltakere`].filter(Boolean).join(' · ')
  return <button className={`tripCard ${muted ? 'muted' : ''}`} onClick={() => openTrip(trip)}>{trip.status === 'Pågår' && <span className="badge green">Pågår</span>}<h3>{trip.title}</h3>{meta && <p>{meta}</p>}<div className={`nextPill ${trip.status === 'Pågår' ? 'green' : 'blue'}`}><span></span>{trip.next}</div></button>
}

function FamilyView({ family, setFamily, setView, loading, supabaseMode, householdStorage = {}, reloadFamily }){
  const [draft, setDraft] = useState({ name: '', email: '', relation: 'adult', invite: true })
  const [formOpen, setFormOpen] = useState(() => family.length === 0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const updateDraft = (patch) => setDraft(current => ({ ...current, ...patch }))

  const resetDraft = () => setDraft({ name: '', email: '', relation: 'adult', invite: true })
  const canRemoveMember = member => member && member.relation !== 'self' && member.householdRole !== 'owner'
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleFamily = normalizedSearch
    ? family.filter(member => [
      member.name,
      member.email,
      relationLabel(member.relation),
      inviteStatusLabel(member.inviteStatus)
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch))
    : family

  const add = async () => {
    setError('')
    setMessage('')
    if(!draft.name.trim()){
      setError('Skriv inn navn.')
      return
    }
    if(draft.email && !isValidEmail(draft.email)){
      setError('Skriv inn en gyldig e-postadresse.')
      return
    }
    setSaving(true)
    try{
      if(!supabaseMode){
        const member = {
          id: createClientId('local-family'),
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          relation: draft.relation,
          inviteStatus: draft.email && draft.invite ? 'test' : draft.email ? 'not_sent' : 'not_needed'
        }
        setFamily(current => [...current, member])
        setMessage('Familiemedlem lagt til.')
      }else{
        const saved = await saveFamilyMember({ member: draft })
        let nextMember = saved
        if(saved.email && draft.invite){
          try{
            await inviteFamilyMember({ email: saved.email, displayName: saved.name, relation: saved.relation, familyMemberId: saved.id, householdId: householdStorage.householdId })
            nextMember = { ...saved, inviteStatus: 'invite_sent', invitedAt: new Date().toISOString() }
            setMessage('Familiemedlem lagret og invitasjon sendt.')
          }catch{
            nextMember = { ...saved, inviteStatus: 'invite_failed' }
            setMessage('Familiemedlem lagret, men invitasjonen feilet.')
          }
        }else{
          setMessage('Familiemedlem lagret.')
        }
        setFamily(current => [...current.filter(member => member.id !== nextMember.id), nextMember])
        if(typeof reloadFamily === 'function') await reloadFamily()
      }
      resetDraft()
      setFormOpen(false)
    }catch(saveError){
      setError(saveError.message || 'Klarte ikke å lagre familiemedlem.')
    }finally{
      setSaving(false)
    }
  }

  const remove = async (memberId) => {
    setError('')
    setMessage('')
    const member = family.find(row => row.id === memberId)
    if(!member) return
    if(!canRemoveMember(member)){
      setError('Eier eller egen bruker kan ikke fjernes her.')
      return
    }
    setFamily(current => current.filter(row => row.id !== memberId))
    if(supabaseMode && !String(member.id).startsWith('local-')){
      try{
        if(member.householdMemberId && member.userId) await deleteHouseholdMember(member.householdMemberId)
        if(member.source === 'family_members') await deleteFamilyMember(member.id)
        if(typeof reloadFamily === 'function') await reloadFamily()
      }catch(removeError){
        setFamily(current => [...current, member])
        setError(removeError.message || 'Klarte ikke å fjerne familiemedlem.')
      }
    }
  }

  const resendInvite = async (member) => {
    if(!member.email) return
    setError('')
    setMessage('')
    if(!supabaseMode){
      setFamily(current => current.map(row => row.id === member.id ? { ...row, inviteStatus: 'test' } : row))
      setMessage('Invitasjon simulert i testmodus.')
      return
    }
    try{
      await inviteFamilyMember({ email: member.email, displayName: member.name, relation: member.relation, familyMemberId: member.source === 'family_members' ? member.id : member.familyMemberId, householdId: householdStorage.householdId })
      setFamily(current => current.map(row => row.id === member.id ? { ...row, inviteStatus: 'invite_sent', invitedAt: new Date().toISOString() } : row))
      if(typeof reloadFamily === 'function') await reloadFamily()
      setMessage('Invitasjon sendt på nytt.')
    }catch(inviteError){
      setFamily(current => current.map(row => row.id === member.id ? { ...row, inviteStatus: 'invite_failed' } : row))
      setError(inviteError.message || 'Klarte ikke å sende invitasjon.')
    }
  }

  return <section className="screen"><TopLine title="Min familie" onBack={() => setView('home')}/><div className="content gap-xl familyPage">
    <div className="familyHeaderCard card"><div><h2>Min familie</h2><p>Personene som deler familiehjemmet. De kan brukes i kalender, chat, handleliste og turer.</p></div><button className="primary withIcon" type="button" onClick={() => setFormOpen(true)}><Plus size={18}/>Legg til familie</button></div>
    {loading && <Empty title="Henter familie" text="Laster lagrede familiemedlemmer."/>}
    {message && <div className="authMsg ok">{message}</div>}
    {error && <div className="authMsg error">{error}</div>}
    {family.length > 0 && <label className="field familySearch"><span>Søk familie</span><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Søk etter navn, e-post, relasjon eller status"/></label>}
    <div className="familyGrid">{family.length ? (visibleFamily.length ? visibleFamily.map(member => <article className="familyPersonCard" key={member.id}><div className="familyPersonTop"><Avatar name={member.name}/><div><h3>{member.name}</h3><p>{relationLabel(member.relation)}</p></div></div>{member.email && <p className="familyEmail">{member.email}</p>}<div className="familyPersonBottom"><em className={member.inviteStatus === 'invite_failed' || member.inviteStatus === 'failed' ? 'red' : 'green'}>{inviteStatusLabel(member.inviteStatus)}</em><div className="miniActions">{member.email && member.inviteStatus !== 'accepted' && <button onClick={() => resendInvite(member)} type="button" title="Send invitasjon"><Mail size={15}/></button>}{canRemoveMember(member) && <button onClick={() => remove(member.id)} type="button" title="Fjern"><Trash2 size={15}/></button>}</div></div></article>) : <Empty title="Ingen treff" text="Prøv navn, e-post, relasjon eller invitasjonsstatus."/>) : <Empty title="Ingen familie registrert" text="Legg inn partner, barn eller andre som skal bruke familiehjemmet."/>}</div>
    {formOpen && <div className="familyDrawer card"><div className="familyDrawerHead"><div><h2>Legg til familie</h2><p>Fyll inn det som trengs. E-post er valgfritt, men brukes til invitasjon senere.</p></div><button className="rowAction neutral" type="button" onClick={() => { setFormOpen(false); resetDraft() }}>Lukk</button></div><div className="inlineForm familyForm expanded"><input value={draft.name} onChange={e => updateDraft({ name: e.target.value })} placeholder="Navn"/><input type="email" value={draft.email} onChange={e => updateDraft({ email: e.target.value })} placeholder="E-post for invitasjon"/><select value={draft.relation} onChange={e => updateDraft({ relation: e.target.value })}>{relationOptions.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><label className="checkRow"><input type="checkbox" checked={draft.invite} onChange={e => updateDraft({ invite: e.target.checked })}/><span>Send invitasjon automatisk når e-post finnes</span></label><div><button onClick={() => { resetDraft(); setFormOpen(false) }} type="button">Avbryt</button><button onClick={add} type="button" disabled={saving}>{saving ? 'Lagrer …' : 'Legg til i familie'}</button></div></div></div>}
  </div></section>
}

function CreateTrip({ create, setCreate, setView, finishCreate, saving, error }){
  const validationMessage = tripDraftValidationMessage(create)
  const primaryDisabled = saving || !canSaveTripDraft(create)
  const setPatch = (patch) => setCreate({ ...create, ...patch })
  const step = create.step > 1 && create.type ? 2 : 1
  const selectedTypeLabel = tripTypeLabel(create.type).toLowerCase()
  const chooseType = (type) => setPatch({ type, step: 2, startContent: { ...(create.startContent || defaultStartContent(type)), matches: type === 'cup' } })
  const setDuration = (durationDays) => {
    const days = normalizeDurationDays(durationDays)
    setPatch({ durationDays, end: create.start && days ? addDaysDate(create.start, days - 1) : create.end })
  }
  const setStart = (start) => {
    const days = normalizeDurationDays(create.durationDays)
    setPatch({ start, end: start && days ? addDaysDate(start, days - 1) : create.end })
  }

  if(step === 1){
    return <section className="screen with-actions"><TopLine title="Opprett ny tur" onBack={() => setView('trips')}/><div className="content gap-xl">
      <section className="quickCreateIntro"><h2>Hva slags tur?</h2><p className="lead">Velg turtype først. Deretter går du videre til navn og lengde på egen skjerm.</p></section>
      <section>{tripTypeOptions.map(([id, Icon, label]) => <button key={id} type="button" onClick={() => chooseType(id)} className={`choice ${create.type === id ? 'selected' : ''}`}><span className="choiceLabel"><Icon size={18}/>{label}</span><span>{create.type === id ? '✓' : ''}</span></button>)}</section>
    </div><div className="bottomActions"><button className="secondary" onClick={() => setView('trips')} disabled={saving}>Avbryt</button></div></section>
  }

  return <section className="screen with-actions"><TopLine title="Opprett ny tur" onBack={() => setView('trips')}/><div className="content gap-xl">
    <section className="quickCreateIntro"><h2>Lag {selectedTypeLabel}en først.</h2><p className="lead">Gi reisen et navn og legg inn varighet. Etterpå velger du dokumenter, så foreslår Travelvault sted, datoer, overnatting og planpunkter.</p></section>
    {error && <div className="authMsg error">{error}</div>}
    {validationMessage && <div className="authMsg error">{validationMessage}</div>}
    <section>
      <h2>Navn og lengde</h2>
      <Field label="Navn på reisen" value={create.title} onChange={title => setPatch({ title })} placeholder="F.eks. Sommerferie i Danmark"/>
      <div className="two"><Field label="Startdato (valgfritt)" type="date" value={create.start} onChange={setStart}/><Field label="Antall dager" type="number" value={create.durationDays} onChange={setDuration} placeholder="F.eks. 7"/></div>
      {create.start && create.end && <div className="smartMiniNote">Sluttdato settes automatisk til {formatDate(create.end)} basert på lengden.</div>}
    </section>
  </div><div className="bottomActions row"><button className="secondary" onClick={() => setPatch({ step: 1 })} disabled={saving}>Tilbake</button><button className="primary" onClick={finishCreate} disabled={primaryDisabled}>{saving ? 'Lagrer …' : 'Opprett og last opp dokumenter'}</button></div></section>
}

function EditTrip({ trip, setView, saveTripEdits, saving, error }){
  const [draft, setDraft] = useState(() => tripToEditDraft(trip))
  const validationMessage = tripDraftValidationMessage(draft)
  const setPatch = (patch) => setDraft(current => ({ ...current, ...patch }))

  return <section className="screen with-actions"><TopLine title="Rediger tur" trip={trip} onBack={() => setView('trip')}/><div className="content gap-xl">
    {error && <div className="authMsg error">{error}</div>}
    {validationMessage && <div className="authMsg error">{validationMessage}</div>}
    <section>
      <h2>Grunninfo</h2>
      <label className="field"><span>Turtype</span><select value={draft.type} onChange={e => setPatch({ type: e.target.value })}>{tripTypeOptions.map(([id,, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      <Field label="Navn på tur" value={draft.title} onChange={title => setPatch({ title })} placeholder="F.eks. Familietur til Lillehammer"/>
      <div className="two"><Field label="Startdato" type="date" value={draft.start} onChange={start => setPatch({ start })}/><Field label="Sluttdato" type="date" value={draft.end} onChange={end => setPatch({ end })}/></div>
      <label className="field"><span>Beskrivelse</span><textarea value={draft.description} onChange={e => setPatch({ description: e.target.value })} placeholder="Frivillig: kort notat om turen"/></label>
    </section>
    <section><LocationStep create={draft} setCreate={setDraft}/></section>
  </div><div className="bottomActions row"><button className="secondary" onClick={() => setView('trip')} disabled={saving}>Avbryt</button><button className="primary" onClick={() => saveTripEdits(draft)} disabled={saving || !canSaveTripDraft(draft)}>{saving ? 'Lagrer …' : 'Lagre endringer'}</button></div></section>
}

function TripBasicsStep({ create, setCreate }){
  return <><h2>Navn og dato</h2><p className="lead">Gi turen et navn først. Sted velges i neste steg, der du kan søke i kartdata.</p><Field label="Navn på tur" value={create.title} onChange={title => setCreate({ ...create, title })} placeholder="F.eks. Familietur til Lillehammer"/><div className="two"><Field label="Startdato" type="date" value={create.start} onChange={start => setCreate({ ...create, start })}/><Field label="Sluttdato" type="date" value={create.end} onChange={end => setCreate({ ...create, end })}/></div><label className="field"><span>Beskrivelse</span><textarea value={create.description} onChange={e => setCreate({ ...create, description: e.target.value })} placeholder="Frivillig: kort notat om turen"/></label></>
}

function LocationStep({ create, setCreate }){
  const [query, setQuery] = useState(create.location || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const selected = create.locationMeta

  const updateManualLocation = (value) => {
    setQuery(value)
    setCreate({ ...create, location: value, locationMeta: null })
  }

  const runSearch = async () => {
    const cleanQuery = query.trim()
    if(cleanQuery.length < 2){
      setMessage('Skriv minst to tegn for å søke etter sted.')
      setResults([])
      return
    }
    setLoading(true)
    setMessage('')
    try{
      const rows = await searchLocations(cleanQuery)
      setResults(rows)
      if(!rows.length) setMessage('Fant ingen treff. Du kan likevel bruke teksten du har skrevet.')
    }catch(error){
      setMessage(error.message || 'Klarte ikke å søke etter sted akkurat nå.')
      setResults([])
    }finally{
      setLoading(false)
    }
  }

  const chooseLocation = (location) => {
    const nextTitle = create.title?.trim() ? create.title : `${create.type === 'family' ? 'Familietur' : 'Tur'} til ${location.name}`
    setQuery(location.name)
    setResults([])
    setMessage('Sted valgt fra kartdata.')
    setCreate({ ...create, title: nextTitle, location: location.name, locationMeta: location })
  }

  const mapUrl = selected ? osmEmbedUrl(selected) : ''
  const openUrl = selected ? osmOpenUrl(selected) : ''

  return <><h2>Hvor?</h2><p className="lead">Søk etter reisemålet og velg riktig sted. Da kan Travelvault lagre kartnavn, adresse og koordinater for turen.</p><div className="locationSearchBox"><label className="field"><span>Søk i kartdata</span><div className="searchRow"><input value={query} onChange={e => updateManualLocation(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); runSearch() } }} placeholder="F.eks. Lillehammer"/><button type="button" onClick={runSearch} disabled={loading}><Search size={17}/>{loading ? 'Søker …' : 'Søk'}</button></div></label><button className="hintChip" type="button" onClick={() => { setQuery('Lillehammer'); setCreate({ ...create, location: 'Lillehammer', locationMeta: null }) }}>Eksempel: Lillehammer</button>{message && <div className={`authMsg ${selected ? 'ok' : 'error'}`}>{message}</div>}{results.length > 0 && <div className="locationResults">{results.map(result => <button type="button" className="locationResult" key={result.id} onClick={() => chooseLocation(result)}><span><b>{result.name}</b><small>{result.shortAddress || result.displayName}</small></span><em>{result.type}</em></button>)}</div>}{selected && <div className="mapPreview"><div><b>{selected.name}</b><small>{selected.displayName}</small></div><iframe title={`Kart over ${selected.name}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade"></iframe><a href={openUrl} target="_blank" rel="noreferrer">Åpne i OpenStreetMap</a></div>}{!selected && create.location && <div className="manualLocation"><b>Bruker skrevet sted:</b><span>{create.location}</span><small>Søk og velg fra listen for å hente kartdata.</small></div>}</div></>
}

function osmOpenUrl(location){
  const lat = Number(location.lat)
  const lon = Number(location.lon)
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=12/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`
}

function osmEmbedUrl(location){
  const lat = Number(location.lat)
  const lon = Number(location.lon)
  const bbox = Array.isArray(location.boundingbox) && location.boundingbox.length === 4
    ? [Number(location.boundingbox[2]), Number(location.boundingbox[0]), Number(location.boundingbox[3]), Number(location.boundingbox[1])]
    : [lon - 0.08, lat - 0.05, lon + 0.08, lat + 0.05]
  const safeBbox = bbox.map(value => Number.isFinite(value) ? value : 0).join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(safeBbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`
}

function ParticipantsDraft({ create, setCreate, family = [] }){
  const [person, setPerson] = useState({ name: '', email: '', relation: 'adult', invite: true })
  const participants = normalizeParticipants(create.participants)
  const selectedKeys = new Set(participants.map(row => row.familyMemberId || row.email || row.name))
  const updatePerson = (patch) => setPerson(current => ({ ...current, ...patch }))
  const setParticipants = (nextParticipants) => setCreate({ ...create, participants: nextParticipants })

  const addPerson = () => {
    if(!person.name.trim()) return
    if(person.email && !isValidEmail(person.email)) return
    setParticipants([...participants, { ...person, id: createClientId('participant'), name: person.name.trim(), email: person.email.trim().toLowerCase() }])
    setPerson({ name: '', email: '', relation: 'adult', invite: true })
  }

  const addFromFamily = (member) => {
    const key = member.id || member.email || member.name
    if(selectedKeys.has(key)) return
    setParticipants([...participants, {
      id: createClientId('participant'),
      familyMemberId: member.id,
      name: member.name,
      email: member.email || '',
      relation: member.relation || 'family',
      invite: Boolean(member.email)
    }])
  }

  const remove = (index) => {
    if(index === 0) return
    setParticipants(participants.filter((_, rowIndex) => rowIndex !== index))
  }

  return <><h2>Familie og deltakere</h2><p className="lead">Registrer familien med e-post. Når ekte innlogging er aktivert, sendes invitasjon automatisk til de som har e-post og er krysset av for invitasjon.</p>
    {family.length > 0 && <><h2 className="sectionTitle">Legg til fra familien</h2><div className="memberList compactList">{family.map(member => { const key = member.id || member.email || member.name; const selected = selectedKeys.has(key); return <button className="familyPick" key={key} onClick={() => addFromFamily(member)} type="button" disabled={selected}><Avatar name={member.name}/><span><b>{member.name}</b><small>{member.email || relationLabel(member.relation)}</small></span><em>{selected ? 'Valgt' : 'Legg til'}</em></button> })}</div></>}
    <h2 className="sectionTitle">Valgt for turen</h2><div className="memberList">{participants.map((participant, index) => <div className="member" key={`${participant.id}-${index}`}><Avatar name={participant.name || participant.email}/><span>{participant.name || participant.email}<small>{participant.email ? ` · ${participant.email}` : ''}</small></span><b>{index === 0 ? 'Eier' : relationLabel(participant.relation)}</b>{index > 0 && <button onClick={() => remove(index)} type="button">Fjern</button>}</div>)}</div>
    <h2 className="sectionTitle">Ny deltaker</h2><div className="inlineForm familyForm"><input value={person.name} onChange={e => updatePerson({ name: e.target.value })} placeholder="Navn på deltaker"/><input type="email" value={person.email} onChange={e => updatePerson({ email: e.target.value })} placeholder="E-post for invitasjon"/><select value={person.relation} onChange={e => updatePerson({ relation: e.target.value })}>{relationOptions.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><label className="checkRow"><input type="checkbox" checked={person.invite} onChange={e => updatePerson({ invite: e.target.checked })}/><span>Send invitasjon automatisk</span></label><button onClick={addPerson} type="button">Legg til deltaker</button></div></>
}


function LogisticsDraft({ create, setCreate }){
  const logistics = normalizeLogistics(create.logistics)
  const accommodation = logistics.accommodation
  const [travelDraft, setTravelDraft] = useState({
    mode: 'flight',
    customMode: '',
    direction: 'outbound',
    title: '',
    date: create.start || '',
    time: '',
    place: '',
    note: ''
  })
  const setLogistics = (nextLogistics) => setCreate({ ...create, logistics: normalizeLogistics(nextLogistics) })
  const updateAccommodation = (patch) => setLogistics({ ...logistics, accommodation: { ...accommodation, ...patch } })
  const updateTravelDraft = (patch) => setTravelDraft(current => ({ ...current, ...patch }))
  const addTravel = () => {
    const item = normalizeTransportItem({ ...travelDraft, id: createClientId('travel') }, logistics.transports.length)
    if(!item.title.trim() && !item.place.trim() && !item.date && !item.time && !item.customMode.trim() && !item.note.trim()) return
    setLogistics({ ...logistics, transports: [...logistics.transports, item] })
    setTravelDraft({
      mode: travelDraft.mode,
      customMode: '',
      direction: travelDraft.direction === 'outbound' ? 'return' : 'outbound',
      title: '',
      date: travelDraft.direction === 'outbound' ? create.end || '' : create.start || '',
      time: '',
      place: '',
      note: ''
    })
  }
  const removeTravel = (id) => setLogistics({ ...logistics, transports: logistics.transports.filter(item => item.id !== id) })

  return <section className="logisticsDraft">
    <h2>Reise og opphold</h2>
    <p className="lead">Legg inn hotell, fly, båt, bil eller andre reisedetaljer nå. Du kan også fylle ut dette senere i Plan.</p>
    <div className="logisticsPanel">
      <h3>Overnatting</h3>
      <Field label="Hotell/overnatting" value={accommodation.name} onChange={name => updateAccommodation({ name })} placeholder="F.eks. Scandic København"/>
      <Field label="Sted" value={accommodation.place} onChange={place => updateAccommodation({ place })} placeholder="Adresse eller område"/>
      <div className="two"><Field label="Innsjekk" type="date" value={accommodation.checkIn} onChange={checkIn => updateAccommodation({ checkIn })}/><Field label="Utsjekk" type="date" value={accommodation.checkOut} onChange={checkOut => updateAccommodation({ checkOut })}/></div>
      <label className="field"><span>Notat</span><textarea value={accommodation.notes} onChange={e => updateAccommodation({ notes: e.target.value })} placeholder="Bookingnummer, romtype eller annet dere vil huske"/></label>
    </div>
    <div className="logisticsPanel">
      <h3>Transport</h3>
      <div className="two">
        <label className="field"><span>Type</span><select value={travelDraft.mode} onChange={e => updateTravelDraft({ mode: e.target.value })}>{transportModeOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="field"><span>Retning</span><select value={travelDraft.direction} onChange={e => updateTravelDraft({ direction: e.target.value })}><option value="outbound">Reise dit</option><option value="return">Hjemreise</option><option value="during">Underveis</option></select></label>
      </div>
      {travelDraft.mode === 'other' && <Field label="Egen type" value={travelDraft.customMode} onChange={customMode => updateTravelDraft({ customMode })} placeholder="F.eks. taxi, sykkel, leiebil"/>}
      <Field label="Tittel" value={travelDraft.title} onChange={title => updateTravelDraft({ title })} placeholder="F.eks. Fly Oslo-Roma"/>
      <div className="two"><Field label="Dato" type="date" value={travelDraft.date} onChange={date => updateTravelDraft({ date })}/><Field label="Tid" type="time" value={travelDraft.time} onChange={time => updateTravelDraft({ time })}/></div>
      <Field label="Sted" value={travelDraft.place} onChange={place => updateTravelDraft({ place })} placeholder="Gate, terminal, brygge eller adresse"/>
      <label className="field"><span>Notat</span><textarea value={travelDraft.note} onChange={e => updateTravelDraft({ note: e.target.value })} placeholder="Flightnummer, registreringsnummer, sete, oppmøte eller lenke"/></label>
      <button className="dashed compactDash" type="button" onClick={addTravel}><Plus size={18}/>Legg til reise</button>
      {logistics.transports.length > 0 && <div className="logisticsList">{logistics.transports.map(item => <div className="logisticsRow" key={item.id}><span className="iconTile">{React.createElement(iconMap[transportEventType(item.mode)] || Ship, { size: 17 })}</span><div><b>{item.title || transportModeLabel(item.mode, item.customMode)}</b><small>{[transportModeLabel(item.mode, item.customMode), item.date ? formatDate(item.date) : '', item.time, item.place].filter(Boolean).join(' · ')}</small></div><button type="button" onClick={() => removeTravel(item.id)}>Fjern</button></div>)}</div>}
    </div>
  </section>
}

function StartContentStep({ create, setCreate }){
  const content = create.startContent || defaultStartContent(create.type)
  const toggle = (key) => setCreate({ ...create, startContent: { ...content, [key]: !content[key] } })
  return <><LogisticsDraft create={create} setCreate={setCreate}/><h2>Startinnhold</h2><p className="lead">Velg hva turen skal starte med. Alt kan endres etterpå.</p>{startContentRows.map(([key, label]) => <button type="button" className="toggleRow toggleButton" key={key} onClick={() => toggle(key)} aria-pressed={Boolean(content[key])}><span>{label}</span><b className={content[key] ? 'on' : ''}></b></button>)}</>
}

function TripTypeStep({ create, setCreate }){
  const chooseType = (type) => setCreate({ ...create, type, step: 2, startContent: { ...(create.startContent || defaultStartContent(type)), matches: type === 'cup' } })
  return <><h2>Hva slags tur?</h2><p className="lead">Velg turtype, så går du automatisk videre til grunninfo.</p>{tripTypeOptions.map(([id, Icon, label]) => <button key={id} type="button" onClick={() => chooseType(id)} className={`choice ${create.type === id ? 'selected' : ''}`}><span className="choiceLabel"><Icon size={18}/>{label}</span><span>{create.type === id ? '✓' : ''}</span></button>)}</>
}

function Field({ label, value, onChange, placeholder, type = 'text' }){
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>
}

function TopLine({ title, trip, onBack }){
  return <header className="topLine"><button onClick={onBack} aria-label={`Tilbake fra ${title}`}><ChevronLeft size={20}/></button><div><h1>{title}</h1>{trip && <p>{trip.date} · {trip.members} deltakere</p>}</div></header>
}

function TripShell(props){
  const { trip, setView, tab, setTab, mer, setMer, members } = props
  const features = tripFeatures(trip)
  const visibleTabs = tabs.filter(([id]) => id !== 'utlegg' || features.expenses)
  const activeTab = visibleTabs.some(([id]) => id === tab) ? tab : 'na'
  const activeNav = activeTab === 'mer' ? mer : activeTab
  const isDesktopLayout = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 980px)').matches
  const tripCaption = trip.date || dateLabel(trip.startDate, trip.endDate)
  const ownerLabel = members?.[0]?.name || trip.title || 'Travelvault'
  const navigate = (id) => {
    if(id === 'chat'){
      setTab('mer')
      setMer('chat')
      return
    }
    if(['dokumenter', 'bilder', 'deltakere', 'kamper', 'innstillinger'].includes(id)){
      setTab('mer')
      setMer(id)
      return
    }
    setTab(id)
    setMer('list')
  }
  const shoppingItems = normalizeHouseholdState(props.household).shopping
  const addPackingItemsToShopping = (items) => {
    if(!props.updateHousehold || !Array.isArray(items) || !items.length) return
    props.updateHousehold(current => ({ shopping: [...items, ...current.shopping] }))
  }

  const navGroups = [
    {
      label: tripCaption,
      rows: [
        ['na', Home, 'Nå'],
        ['plan', CalendarDays, 'Plan'],
        ['chat', MessageSquare, 'Chat'],
        ['pakk', ListChecks, 'Pakk'],
        ...(features.expenses ? [['utlegg', PiggyBank, 'Utlegg']] : [])
      ]
    },
    {
      label: '',
      rows: [
        ['dokumenter', FileText, 'Dokumenter'],
        ['bilder', Camera, 'Bilder'],
        ['deltakere', Users, 'Deltakere'],
        ...(tripFeatures(trip).matches ? [['kamper', Trophy, 'Kamper']] : []),
        ['innstillinger', Settings, 'Innstillinger']
      ]
    }
  ]

  return <section className="screen tripScreen">
    {isDesktopLayout && <div className="tripDesktopTop desktopOnly">
      <div className="tripBrand"><img src="/logo-mark.png" alt="Travelvault"/><span>Travelvault</span></div>
      <div className="tripBreadcrumb">› <span>{trip.title}</span></div>
      <div className="desktopAvatar">{initials(ownerLabel).slice(0,1)}</div>
    </div>}
    <div className="tripLayout">
      {isDesktopLayout && <aside className="desktopSidebar desktopOnly">
        {navGroups.map((group, groupIndex) => <div className={`desktopNavGroup ${groupIndex > 0 ? 'secondary' : ''}`} key={`group-${groupIndex}`}>
          {group.label ? <p className="desktopNavLabel">{group.label}</p> : <div className="desktopDivider"></div>}
          {group.rows.map(([id, Icon, label]) => <button key={id} type="button" className={`desktopNavItem ${activeNav === id ? 'active' : ''}`} onClick={() => navigate(id)}><span className="desktopNavIcon"><AppNavIcon id={id}/></span><span>{label}</span></button>)}
        </div>)}
      </aside>}
      <div className="tripMain">
        <TopLine title={trip.title} trip={trip} onBack={() => setView('trips')}/>
        <div className="content tripMainContent">
          {activeTab === 'na' && <NowView {...props}/>} 
          {activeTab === 'plan' && <PlanView events={props.events} setEvents={props.setEvents} documents={props.documents} setTab={setTab} setMer={setMer} setDocumentTarget={props.setDocumentTarget}/>} 
          {activeTab === 'pakk' && <PackingView members={props.members} packing={props.packing} setPacking={props.setPacking} tripType={trip.type} customTemplates={props.packingTemplates} onCustomTemplatesChange={props.savePackingTemplates} tripId={trip.id} tripTitle={trip.title} shoppingItems={shoppingItems} onAddShoppingItems={addPackingItemsToShopping}/>} 
          {activeTab === 'utlegg' && <ExpensesView members={props.members} expenses={props.expenses} setExpenses={props.setExpenses}/>} 
          {activeTab === 'mer' && <MoreView {...props} mer={mer} setMer={setMer}/>} 
        </div>
      </div>
    </div>
    <nav className="tabbar mobileOnly" style={{ gridTemplateColumns: `repeat(${visibleTabs.length},1fr)` }}>{visibleTabs.map(([id, Icon, label]) => <button key={id} onClick={() => { setTab(id); setMer('list') }} className={activeTab === id ? 'active' : ''}><AppNavIcon id={id}/><span>{label}</span></button>)}</nav>
  </section>
}

function logisticsDateSpan(accommodation){
  const stay = normalizeAccommodation(accommodation)
  const dates = [stay.checkIn ? formatDate(stay.checkIn) : '', stay.checkOut ? formatDate(stay.checkOut) : ''].filter(Boolean)
  if(dates.length === 2) return `${dates[0]}-${dates[1]}`
  return dates[0] || ''
}
function eventDashboardSubtitle(event){
  return [event.day, event.time && event.time !== 'Ikke satt' ? event.time : '', event.place && event.place !== 'Ikke satt' ? event.place : ''].filter(Boolean).join(' · ')
}
function transportDashboardRows(events, logistics){
  const eventRows = sortEvents(events)
    .filter(isTransportEvent)
    .map(event => ({
      id: event.id,
      type: event.type,
      title: event.title,
      subtitle: eventDashboardSubtitle(event),
      direction: event.direction || ''
    }))
  if(eventRows.length) return eventRows
  return normalizeLogistics(logistics).transports.map(item => ({
    id: item.id,
    type: transportEventType(item.mode),
    title: item.title || transportModeLabel(item.mode, item.customMode),
    subtitle: [transportModeLabel(item.mode, item.customMode), item.date ? formatDate(item.date) : '', item.time, item.place].filter(Boolean).join(' · '),
    direction: item.direction
  }))
}
function travelDashboardCards({ trip, events, matches, logistics, setTab, setMer }){
  const cards = []
  const normalized = normalizeLogistics(logistics || trip?.logistics)
  const openPlan = () => { setMer('list'); setTab('plan') }
  const openMatches = () => { setTab('mer'); setMer('kamper') }
  if(hasAccommodation(normalized.accommodation)){
    const stay = normalized.accommodation
    const subtitle = [logisticsDateSpan(stay), nightLabel(stay.nights), stay.place, stay.roomType].filter(Boolean).join(' · ')
    cards.push({ id: 'accommodation', type: 'hotel', label: 'Overnatting', title: stay.name || 'Overnatting', subtitle, open: openPlan })
  }
  const transportRows = transportDashboardRows(events, normalized)
  const outbound = transportRows[0]
  const inbound = transportRows.find(row => row.direction === 'return' && row.id !== outbound?.id) || (transportRows.length > 1 ? transportRows[transportRows.length - 1] : null)
  if(outbound) cards.push({ ...outbound, id: `out-${outbound.id}`, label: 'Reise dit', open: openPlan })
  if(inbound && inbound.id !== outbound?.id) cards.push({ ...inbound, id: `in-${inbound.id}`, label: 'Hjemreise', open: openPlan })
  if(tripFeatures(trip).matches && matches.length){
    const nextMatch = matches[0]
    cards.push({
      id: 'matches',
      type: 'match',
      label: 'Kamper',
      title: `${matches.length} ${matches.length === 1 ? 'kamp' : 'kamper'} planlagt`,
      subtitle: [`Neste: ${nextMatch.opponent || 'kamp'}`, nextMatch.start].filter(Boolean).join(' · '),
      open: openMatches
    })
  }
  return cards
}
function LogisticsCard({ card }){
  const Icon = iconMap[card.type] || MapPin
  return <button className="logisticsCard" type="button" onClick={card.open}><span className="iconTile"><Icon size={18}/></span><small>{card.label}</small><b>{card.title}</b><em>{card.subtitle}</em></button>
}

function visualVariant(value = ''){
  return Array.from(String(value || '')).reduce((sum, char) => (sum + char.charCodeAt(0)) % 4, 0) + 1
}

function TravelCardMedia({ card }){
  const Icon = iconMap[card.type] || MapPin
  if(card.thumbnailUrl){
    return <span className="travelThumb travelThumbImage" style={{ backgroundImage: `url("${card.thumbnailUrl}")` }} aria-hidden="true"></span>
  }
  if(card.type === 'hotel'){
    return <span className={`travelThumb hotelThumb hotelThumb${visualVariant(card.title)}`} aria-hidden="true"><span className="hotelThumbSun"></span><span className="hotelThumbBuilding"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>
  }
  return <span className="iconTile"><Icon size={18}/></span>
}

function daysUntilTrip(startDate){
  if(!startDate) return ''
  const start = new Date(`${startDate}T00:00:00`)
  const today = new Date(`${isoToday()}T00:00:00`)
  return Math.round((start - today) / 86400000)
}
function dashboardDateRange(trip){
  return trip.date || dateLabel(trip.startDate, trip.endDate)
}
function buildDashboardAlerts({ trip, packing, expenses, matches, events }){
  const alerts = []
  const unpacked = packing.filter(item => !item.packed).length
  if(unpacked > 0) alerts.push({ color: 'yellow', text: `${unpacked} ${unpacked === 1 ? 'pakkepunkt mangler' : 'pakkepunkter mangler'}` })
  if(expenses.length > 0) alerts.push({ color: 'blue', text: `${expenses.length} ${expenses.length === 1 ? 'utlegg er registrert' : 'utlegg er registrert'}` })
  if(tripFeatures(trip).matches && matches.length){
    const nextMatch = matches[0]
    alerts.push({ color: 'red', text: [`Neste kamp: ${nextMatch.opponent || 'kamp'}`, nextMatch.start].filter(Boolean).join(' · ') })
  }else{
    const nextEvent = nextUpcomingEvent(events)
    if(nextEvent?.title) alerts.push({ color: 'red', text: `Neste planpunkt: ${nextEvent.title}` })
  }
  return alerts.slice(0, 3)
}
function buildTravelDetailCards({ logistics, events }){
  const normalized = normalizeLogistics(logistics)
  const cards = []
  if(hasAccommodation(normalized.accommodation)){
    const stay = normalized.accommodation
    cards.push({
      id: 'stay',
      type: 'hotel',
      label: 'Overnatting',
      title: stay.name || 'Overnatting',
      thumbnailUrl: stay.thumbnailUrl || stay.photoUrl || stay.imageUrl || '',
      subtitle: [stay.checkIn && stay.checkOut ? `${formatDate(stay.checkIn)}-${formatDate(stay.checkOut)}` : logisticsDateSpan(stay), nightLabel(stay.nights)].filter(Boolean).join(' · '),
      fields: [
        ['Innsjekk', stay.checkIn ? formatDate(stay.checkIn) : ''],
        ['Utsjekk', stay.checkOut ? formatDate(stay.checkOut) : ''],
        ['Varighet', nightLabel(stay.nights) || ''],
        ['Adresse', stay.place || ''],
        ['Romtype', stay.roomType || '']
      ]
    })
  }
  const transportRows = transportDashboardRows(events, normalized)
  const outbound = transportRows.find(row => row.direction !== 'return') || transportRows[0]
  const inbound = transportRows.find(row => row.direction === 'return' && row.id !== outbound?.id) || (transportRows.length > 1 ? transportRows[transportRows.length - 1] : null)
  const makeTransportCard = (row, label, id) => row ? {
    id,
    type: row.type,
    label,
    title: row.title || label,
    subtitle: row.subtitle,
    fields: row.subtitle.split(' · ').filter(Boolean).map((value, index) => [index === 0 ? 'Detalj' : index === 1 ? 'Tidspunkt' : 'Sted', value])
  } : null
  const outboundCard = makeTransportCard(outbound, 'Reise dit', 'outbound')
  const inboundCard = makeTransportCard(inbound, 'Hjemreise', 'inbound')
  if(outboundCard) cards.push(outboundCard)
  if(inboundCard && inboundCard.title !== outboundCard?.title) cards.push(inboundCard)
  return cards
}
function StatCard({ icon: Icon, value, label }){
  return <div className="statCard"><div className="statIcon"><Icon size={18}/></div><b>{value}</b><span>{label}</span></div>
}
function DashboardAlert({ color, text }){
  return <div className={`dashboardAlert ${color}`}><span className="alertDot"></span><p>{text}</p><b>›</b></div>
}
function TravelDetailCard({ card, onOpen }){
  return <button type="button" className="travelDetailCard" onClick={onOpen}><div className="travelCardHeader"><TravelCardMedia card={card}/><div><small>{card.label}</small><h3>{card.title}</h3>{card.subtitle && <p>{card.subtitle}</p>}</div><span className="travelChevron">›</span></div><div className="travelFieldGrid">{card.fields.filter(([, value]) => value && value !== 'Ikke satt').slice(0, 5).map(([label, value]) => <div className="travelField" key={`${card.id}-${label}`}><span>{label}</span><b>{value}</b></div>)}</div></button>
}

function NowView({ trip, events, packing, expenses, matches, logistics, setTab, setMer }){
  const timelineRows = sortEvents(events).slice(0, 4)
  const packedCount = packing.filter(item => item.packed).length
  const packingPercent = packing.length ? Math.round((packedCount / packing.length) * 100) : 0
  const alerts = buildDashboardAlerts({ trip, packing, expenses, matches, events })
  const travelCards = buildTravelDetailCards({ logistics, events })
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const daysLeft = daysUntilTrip(trip.startDate)
  const stats = [
    { icon: CalendarDays, value: Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : (trip.durationDays || 0), label: Number.isFinite(daysLeft) && daysLeft > 0 ? 'dager igjen' : 'reisedager' },
    { icon: ListChecks, value: `${packingPercent}%`, label: 'pakket' },
    { icon: Bell, value: alerts.length, label: 'varsler' },
    { icon: PiggyBank, value: formatMoney(totalExpenses), label: 'brukt totalt' }
  ]
  const openPlan = () => {
    setTab('plan')
    setMer('list')
  }

  return <div className="dashboardView"><span className="srOnly">Neste nå</span>
    <div className="dashboardStats">{stats.map((stat, index) => <StatCard key={index} {...stat}/>)}</div>
    <div className="dashboardGrid">
      <section className="dashboardPanel timelinePanel">
        <div className="dashboardSectionHead"><h2>Dagens tidslinje</h2>{timelineRows.length > 0 && <button type="button" className="textButton" onClick={openPlan}>Se hele</button>}</div>
        {timelineRows.length > 0 ? <div className="timelineList">{timelineRows.map(event => <div className="timelineItem" key={event.id}><span className="timelineDot"></span><div className="timelineTime">{event.time && event.time !== 'Ikke satt' ? event.time : 'Hele dagen'}</div><div className="timelineText"><b>{event.title}</b><p>{[event.day, event.place && event.place !== 'Ikke satt' ? event.place : ''].filter(Boolean).join(' · ')}</p></div></div>)}</div> : <div className="emptyPanel"><h3>Ingen planpunkter ennå</h3><p>Legg inn kamp, reise, aktiviteter eller middager i planfanen.</p><button type="button" className="secondary mini" onClick={openPlan}>Gå til plan</button></div>}
      </section>
      <aside className="dashboardAside">
        <section className="dashboardPanel progressPanel"><div className="dashboardSectionHead"><h2>Pakkefremdrift</h2></div><div className="progressHeader"><b>{packedCount} av {packing.length || 0} punkter</b><span>{packingPercent}%</span></div><div className="progressTrack"><span style={{ width: `${packingPercent}%` }}></span></div></section>
        <section className="dashboardPanel alertsPanel"><div className="dashboardSectionHead"><h2>Viktige varsler</h2></div><div className="dashboardAlertList">{alerts.length ? alerts.map((alert, index) => <DashboardAlert key={`${alert.color}-${index}`} {...alert}/>) : <p className="softText">Ingen varsler akkurat nå.</p>}</div></section>
      </aside>
    </div>
    <section className="travelOverview">
      <div className="dashboardSectionHead"><h2>Reise og opphold</h2><span className="dashboardTripDate">{dashboardDateRange(trip)}</span></div>
      {travelCards.length ? <div className="travelCardsDetailed">{travelCards.map(card => <TravelDetailCard key={card.id} card={card} onOpen={openPlan}/>)}</div> : <div className="emptyPanel compact"><h3>Ingen reise- og oppholdsdetaljer ennå</h3><p>Last opp dokumenter eller legg dem inn i planfanen.</p></div>}
    </section>
  </div>
}

function Alert({ color, text }){
  return <div className={`alert ${color}`}><span></span>{text}</div>
}

function PlanView({ events, setEvents, documents = [], setTab, setMer, setDocumentTarget }){
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const sorted = sortEvents(events)
  const days = [...new Set(sorted.map(event => event.day))]
  const uploadForEvent = (event) => {
    setDocumentTarget?.({
      eventId: event.id,
      eventTitle: event.title,
      type: eventTypeToDocumentType(event.type)
    })
    setMer?.('dokumenter')
    setTab?.('mer')
  }
  return <>{!events.length && <Empty title="Ingen planpunkter" text="Legg inn fly, hotell, aktivitet eller oppmøte." action="Legg til planpunkt" onAction={() => setAdding(true)}/>} {days.map(day => <div key={day}><h2 className="dayTitle">{day}</h2>{sorted.filter(event => event.day === day).map(event => <EventCard key={event.id} event={event} events={events} setEvents={setEvents} documents={documents.filter(document => document.linkedEventId === event.id)} open={open === event.id} onClick={() => setOpen(open === event.id ? null : event.id)} onUpload={() => uploadForEvent(event)}/>)}</div>)}{!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til planpunkt</button>}{adding && <AddEvent events={events} setEvents={setEvents} close={() => setAdding(false)}/>}</>
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
      date: date || '',
      time: time || '',
      title: title.trim(),
      place: place.trim() || '',
      type,
      status: 'Planlagt',
      note: note.trim(),
      document: null
    }])
    close()
  }
  return <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tittel"/><div><input type="date" value={date} onChange={e => setDate(e.target.value)}/><input type="time" value={time} onChange={e => setTime(e.target.value)}/></div><input value={place} onChange={e => setPlace(e.target.value)} placeholder="Sted"/><select value={type} onChange={e => setType(e.target.value)}><option value="activity">Aktivitet</option><option value="flight">Fly</option><option value="ferry">Båt/ferge</option><option value="car">Bil</option><option value="train">Tog</option><option value="bus">Buss</option><option value="transport">Annen transport</option><option value="hotel">Hotell/overnatting</option><option value="match">Kamp</option><option value="food">Mat</option></select><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Notat"/><div><button onClick={close}>Avbryt</button><button onClick={add}>Legg til</button></div></div>
}

function EventCard({ event, events, setEvents, documents = [], open, onClick }){
  const Icon = iconMap[event.type] || CalendarDays
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => ({
    title: event.title || '',
    date: event.date || '',
    time: event.time && event.time !== 'Ikke satt' ? event.time : '',
    place: event.place && event.place !== 'Ikke satt' ? event.place : '',
    type: event.type || 'activity',
    status: event.status || 'Planlagt',
    note: event.note || ''
  }))
  useEffect(() => {
    if(!editing){
      setDraft({
        title: event.title || '',
        date: event.date || '',
        time: event.time && event.time !== 'Ikke satt' ? event.time : '',
        place: event.place && event.place !== 'Ikke satt' ? event.place : '',
        type: event.type || 'activity',
        status: event.status || 'Planlagt',
        note: event.note || ''
      })
    }
  }, [event.id, event.title, event.date, event.time, event.place, event.type, event.status, event.note, editing])
  const setPatch = (patch) => setDraft(current => ({ ...current, ...patch }))
  const save = (clickEvent) => {
    clickEvent.stopPropagation()
    if(!draft.title.trim()) return
    setEvents(events.map(row => row.id === event.id ? {
      ...row,
      title: draft.title.trim(),
      date: draft.date || '',
      day: draft.date ? formatDate(draft.date) : 'Uten dato',
      time: draft.time || '',
      place: draft.place.trim(),
      type: draft.type,
      status: draft.status || 'Planlagt',
      note: draft.note.trim()
    } : row))
    setEditing(false)
  }
  const openMap = (clickEvent) => {
    clickEvent.stopPropagation()
    if(draft.place || (event.place && event.place !== 'Ikke satt')) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.place || event.place)}`, '_blank', 'noopener,noreferrer')
  }
  const meta = [event.time && event.time !== 'Ikke satt' ? event.time : '', event.place && event.place !== 'Ikke satt' ? event.place : ''].filter(Boolean).join(' · ')
  return <div className="eventCard" onClick={onClick} role="button" tabIndex={0} onKeyDown={keyEvent => { if(keyEvent.key === 'Enter' || keyEvent.key === ' ') onClick() }}><div className="eventTop"><span className="iconTile"><Icon size={18}/></span><div><h3>{event.title}</h3>{meta && <p>{meta}</p>}</div><b className="status">{event.status}</b></div>{open && <div className="eventDetails">{event.note && <p>{event.note}</p>}{documents.length > 0 && <small>Vedlegg: {documents.map(document => document.title).join(', ')}</small>}{!editing && <div><button onClick={(e) => { e.stopPropagation(); setEditing(true) }} type="button">Rediger</button>{event.place && event.place !== 'Ikke satt' && <button onClick={openMap} type="button">Åpne kart</button>}</div>}{editing && <div className="eventEditForm" onClick={e => e.stopPropagation()}><input value={draft.title} onChange={e => setPatch({ title: e.target.value })} placeholder="Tittel"/><div className="two"><input type="date" value={draft.date} onChange={e => setPatch({ date: e.target.value })}/><input type="time" value={draft.time} onChange={e => setPatch({ time: e.target.value })}/></div><input value={draft.place} onChange={e => setPatch({ place: e.target.value })} placeholder="Sted"/><select value={draft.type} onChange={e => setPatch({ type: e.target.value })}><option value="activity">Aktivitet</option><option value="flight">Fly</option><option value="ferry">Båt/ferge</option><option value="car">Bil</option><option value="train">Tog</option><option value="bus">Buss</option><option value="transport">Annen transport</option><option value="hotel">Hotell/overnatting</option><option value="match">Kamp</option><option value="food">Mat</option></select><select value={draft.status} onChange={e => setPatch({ status: e.target.value })}><option>Planlagt</option><option>Bekreftet</option><option>Fullført</option><option>Avlyst</option></select><textarea value={draft.note} onChange={e => setPatch({ note: e.target.value })} placeholder="Detaljer/notat"/><div><button type="button" onClick={(e) => { e.stopPropagation(); setEditing(false) }}>Avbryt</button><button type="button" onClick={save}>Lagre</button></div></div>}</div>}</div>
}


function PackingView({ members, packing, setPacking, tripType = 'default', customTemplates: savedCustomTemplates = null, onCustomTemplatesChange = null, tripId = '', tripTitle = '', shoppingItems = [], onAddShoppingItems = null }){
  const [filter, setFilter] = useState('Alle')
  const [quickTitle, setQuickTitle] = useState('')
  const [localCustomTemplates, setLocalCustomTemplates] = useState(() => readCustomPackingTemplates())
  const [selectedTemplateId, setSelectedTemplateId] = useState('standard')
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [templateDraft, setTemplateDraft] = useState({ name: '', items: '' })
  const [shoppingBridgeMessage, setShoppingBridgeMessage] = useState('')
  const autoSeededRef = useRef(false)
  const standardTemplate = { id: 'standard', name: 'Standard pakkeliste', items: defaultPackingItemsForTripType(tripType) }
  const customTemplates = Array.isArray(savedCustomTemplates) ? savedCustomTemplates : localCustomTemplates
  const templates = [standardTemplate, ...customTemplates]
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) || standardTemplate

  useEffect(() => {
    if(autoSeededRef.current || packing.length) return
    autoSeededRef.current = true
    setPacking(packingRowsFromItems(defaultPackingItemsForTripType(tripType), 'std'))
  }, [packing.length, setPacking, tripType])

  const visible = packing.filter(item => filter === 'Alle' || (filter === 'Mangler' && !item.packed) || (filter === 'Pakket' && item.packed) || (filter === 'Må kjøpes' && item.mustBuy))
  const mustBuyItems = packing.filter(item => item.mustBuy && !item.packed)
  const shoppingRefs = new Set(normalizeShoppingItems(shoppingItems).map(item => item.sourceRef).filter(Boolean))
  const notInShopping = mustBuyItems.filter(item => !shoppingRefs.has(`trip:${tripId}:packing:${item.id}`))
  const addQuick = () => {
    const title = quickTitle.trim()
    if(!title) return
    const category = inferPackingCategory(title)
    setPacking([...packing, { id: `p${Date.now()}`, title, category, assignedTo: null, packed: false, mustBuy: false }])
    setQuickTitle('')
  }
  const applyTemplate = () => {
    setPacking(packingRowsFromItems(selectedTemplate.items, selectedTemplate.id === 'standard' ? 'std' : 'tpl'))
  }
  const createTemplate = () => {
    const name = templateDraft.name.trim()
    const items = parsePackingTemplateLines(templateDraft.items)
    if(!name || !items.length) return
    const template = { id: createClientId('packing-template'), name, items }
    const nextTemplates = [...customTemplates, template]
    if(onCustomTemplatesChange){
      onCustomTemplatesChange(nextTemplates)
    }else{
      setLocalCustomTemplates(nextTemplates)
      writeCustomPackingTemplates(nextTemplates)
    }
    setSelectedTemplateId(template.id)
    setPacking(packingRowsFromItems(items, 'tpl'))
    setTemplateDraft({ name: '', items: '' })
    setCreatingTemplate(false)
  }
  const sendMustBuyToShopping = () => {
    if(!onAddShoppingItems || !notInShopping.length) return
    const additions = notInShopping.map(item => createShoppingItemFromTitle(item.title, {
      source: 'trip',
      sourceRef: `trip:${tripId}:packing:${item.id}`,
      category: smartPackingCategory(item),
      note: tripTitle ? `Fra ${tripTitle}` : 'Fra pakkeliste'
    }))
    onAddShoppingItems(additions)
    setShoppingBridgeMessage(`${additions.length} punkt lagt i felles handleliste.`)
  }
  const categoriesToShow = categories
    .map(category => ({ category, rows: visible.filter(item => smartPackingCategory(item) === category) }))
    .filter(group => group.rows.length)
  const assignedName = id => members.find(member => member.id === id)?.name || ''

  return <div className="packingKeep">
    <section className="packingTemplatePanel card">
      <label className="field"><span>Pakkeliste</span><select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <div className="packingTemplateActions"><button className="secondary" type="button" onClick={applyTemplate}>Bruk valgt</button><button className="primary" type="button" onClick={() => setCreatingTemplate(true)}><Plus size={18}/>Ny liste</button></div>
      {creatingTemplate && <div className="packingTemplateForm"><input value={templateDraft.name} onChange={e => setTemplateDraft({ ...templateDraft, name: e.target.value })} placeholder="Navn på pakkeliste"/><textarea value={templateDraft.items} onChange={e => setTemplateDraft({ ...templateDraft, items: e.target.value })} placeholder={'Ett punkt per linje\nPute\nEgg\nLader'}/><div><button type="button" onClick={() => { setCreatingTemplate(false); setTemplateDraft({ name: '', items: '' }) }}>Avbryt</button><button type="button" onClick={createTemplate}>Opprett</button></div></div>}
    </section>
    <div className="keepComposer card"><input value={quickTitle} onChange={e => setQuickTitle(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); addQuick() } }} placeholder="Skriv f.eks. underbukser, mobil, lader …"/><button className="primary" type="button" onClick={addQuick}>Legg til</button><small>Bruk «Må kjøpes» på pakkepunkter som skal over i familiens handleliste.</small></div>
    <section className="packShoppingBridge card"><div><h2>Handlekobling</h2><p>{mustBuyItems.length ? `${mustBuyItems.length} pakkepunkt er markert som må kjøpes.` : 'Marker pakkepunkter som må kjøpes, så kan de sendes til felles handleliste.'}</p>{shoppingBridgeMessage && <small className="success">{shoppingBridgeMessage}</small>}</div><button className="primary" type="button" onClick={sendMustBuyToShopping} disabled={!notInShopping.length}>{notInShopping.length ? `Send ${notInShopping.length} til handlelisten` : 'Alt er sendt'}</button></section>
    <div className="chips">{['Alle', 'Mangler', 'Pakket', 'Må kjøpes'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
    {categoriesToShow.map(group => <section className="packingCategory" key={group.category}><h2 className="sectionTitle">{group.category} <span>{group.rows.length}</span></h2>{group.rows.map(item => <PackRow key={item.id} item={item} setPacking={setPacking} packing={packing} subtitle={item.assignedTo ? assignedName(item.assignedTo) : group.category}/>)}</section>)}
    {!categoriesToShow.length && <Empty title="Ingen treff" text="Endre filteret for å se flere pakkepunkter."/>}
  </div>
}

function PackRow({ item, packing, setPacking, subtitle = '' }){
  const update = patch => setPacking(packing.map(row => row.id === item.id ? { ...row, ...patch } : row))
  return <div className="packRow"><button className={`checkButton ${item.packed ? 'checked' : ''}`} onClick={() => update({ packed: !item.packed })} type="button">{item.packed ? '✓' : ''}</button><div><b className={item.packed ? 'done' : ''}>{item.title}</b><small>{subtitle || item.category}</small></div>{item.mustBuy && <em>Må kjøpes</em>}<button className="rowAction" onClick={() => update({ mustBuy: !item.mustBuy })} type="button">{item.mustBuy ? 'Ikke kjøp' : 'Må kjøpes'}</button><button className="rowAction" onClick={() => setPacking(packing.filter(row => row.id !== item.id))} type="button">Fjern</button></div>
}

function ExpensesView({ members, expenses, setExpenses }){
  const [settlement, setSettlement] = useState(false)
  const [adding, setAdding] = useState(false)
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  if(settlement) return <SettlementView members={members} expenses={expenses} back={() => setSettlement(false)}/>
  return <><button className="summary" onClick={() => setSettlement(true)}><div><span>Totalt brukt</span><b>{formatMoney(total)}</b></div><em>Se oppgjør →</em></button>{!expenses.length && <Empty title="Ingen utlegg ennå" text="Legg inn manuelt eller scan en kvittering." action="Legg til utlegg" onAction={() => setAdding(true)}/>} {expenses.map(expense => <ExpenseCard key={expense.id} expense={expense} members={members} expenses={expenses} setExpenses={setExpenses}/>) }<AddExpense members={members} expenses={expenses} setExpenses={setExpenses} open={adding} setOpen={setAdding}/></>
}

function ExpenseCard({ expense, members, expenses, setExpenses }){
  return <div className="expense"><div><h3>{expense.title}</h3><b>{formatMoney(expense.amount)}</b></div><p>Delt mellom {expense.participants?.length || 0} personer</p><span>{expense.category}</span><em>{expense.status}</em><button className="rowAction" onClick={() => setExpenses(expenses.filter(row => row.id !== expense.id))} type="button">Fjern</button></div>
}

function AddExpense({ members, expenses, setExpenses, open, setOpen }){
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(members[0]?.id || '')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const receiptInputRef = useRef(null)
  useEffect(() => {
    const validPayer = members.some(member => member.id === paidBy)
    if(!validPayer && members[0]?.id) setPaidBy(members[0].id)
  }, [paidBy, members])
  const openReceiptPicker = () => {
    setScanError('')
    receiptInputRef.current?.click()
  }
  const scanReceipt = async (event) => {
    const file = event.target.files?.[0]
    if(!file) return
    setOpen(true)
    setScanning(true)
    setScanError('')
    try{
      const text = await readDocumentText(file)
      const parsedAmount = parseReceiptAmount(text)
      const parsedTitle = parseReceiptTitle(text, file.name)
      if(parsedTitle) setTitle(parsedTitle)
      if(parsedAmount) setAmount(String(parsedAmount))
      if(!parsedAmount && !text) setScanError('Fant ikke lesbar tekst i kvitteringen. Prøv et tydeligere bilde, eller legg inn beløpet manuelt.')
      else if(!parsedAmount) setScanError('Fant tekst, men ikke sikkert beløp. Kontroller og fyll inn beløpet manuelt.')
    }catch{
      setScanError('Klarte ikke å lese kvitteringen. Legg inn utlegget manuelt.')
    }finally{
      setScanning(false)
      if(receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }
  const add = () => {
    const payer = members.some(member => member.id === paidBy) ? paidBy : members[0]?.id
    if(title.trim() && Number(amount) > 0 && payer){
      setExpenses([...expenses, { id: `e${Date.now()}`, title: title.trim(), amount: Number(amount), paidBy: payer, participants: members.map(member => member.id), category: 'Annet', status: 'Ikke oppgjort' }])
      setOpen(false)
      setTitle('')
      setAmount('')
      setScanError('')
    }
  }
  return <><input ref={receiptInputRef} type="file" accept="image/*,.pdf,application/pdf" onChange={scanReceipt} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} aria-label="Scan kvittering"/>{!open && <div className="expenseActions"><button className="dashed" onClick={() => setOpen(true)}><Plus size={18}/> Legg til utlegg</button><button className="dashed secondaryDashed" onClick={openReceiptPicker} type="button"><Camera size={18}/> Scan kvittering</button></div>}{open && <div className="inlineForm"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hva ble betalt?"/><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Beløp" type="number" step="0.01"/><select value={paidBy} onChange={e => setPaidBy(e.target.value)}>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>{scanError && <div className="authMsg error">{scanError}</div>}<div><button onClick={() => setOpen(false)}>Avbryt</button><button onClick={add}>Legg til</button></div><button className="secondary full" type="button" onClick={openReceiptPicker} disabled={scanning}>{scanning ? 'Scanner …' : 'Scan kvittering'}</button></div>}</>
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
    const rows = [['chat', MessageSquare, 'Chat'], ['dokumenter', FileText, 'Dokumenter'], ['bilder', Camera, 'Bilder'], ['deltakere', Users, 'Deltakere'], ...(tripFeatures(trip).matches ? [['kamper', Trophy, 'Kamper']] : []), ['innstillinger', Settings, 'Innstillinger']]
    return <div className="moreList">{rows.map(([id, Icon, label]) => <button key={id} onClick={() => setMer(id)}><AppNavIcon id={id} className="moreNavIcon"/><span>{label}</span><b>›</b></button>)}</div>
  }
  return <SubScreen {...props}/>
}

function ChatScreen({ messages, setMessages, members = [] }){
  const [draft, setDraft] = useState('')
  const send = () => {
    if(!draft.trim()) return
    setMessages([...(messages || []), { id: `msg-${Date.now()}`, author: 'Du', text: draft.trim(), createdAt: new Date().toISOString() }])
    setDraft('')
  }
  return <div className="chatScreen"><div className="chatMessages">{messages?.length ? messages.map(message => <div className={`chatBubble ${message.author === 'Du' ? 'mine' : ''}`} key={message.id}><b>{message.author}</b><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</small></div>) : <div className="empty"><h3>Ingen meldinger ennå</h3><p>{members.length > 1 ? `Start samtalen med ${members.length} deltakere på turen.` : 'Start samtalen når flere deltakere er invitert inn.'}</p></div>}</div><div className="chatComposer"><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Skriv melding til gruppen"></textarea><button type="button" className="primary" onClick={send}>Send melding</button></div></div>
}

function SubScreen(props){
  const { mer, setMer } = props
  return <><button className="backRow" onClick={() => setMer('list')}>← Mer</button>{mer === 'chat' && <ChatScreen messages={props.messages} setMessages={props.setMessages} members={props.members}/>} {mer === 'dokumenter' && <DocScreen {...props}/>} {mer === 'bilder' && <PhotoScreen photos={props.photos} setPhotos={props.setPhotos}/>} {mer === 'deltakere' && <ParticipantsScreen {...props}/>} {mer === 'kamper' && <MatchScreen {...props}/>} {mer === 'innstillinger' && <SettingsScreen trip={props.trip} deleteTrip={props.deleteTrip} setView={props.setView}/>}</>
}

function ParticipantsScreen({ trip, members, setMembers, expenses, setExpenses, packing, setPacking, supabaseMode, family = [] }){
  const [person, setPerson] = useState({ name: '', email: '', relation: 'adult', invite: true })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const rows = computeSettlements(expenses, members)
  const balance = id => rows.filter(row => row.to === id).reduce((sum, row) => sum + row.amount, 0) - rows.filter(row => row.from === id).reduce((sum, row) => sum + row.amount, 0)
  const updatePerson = (patch) => setPerson(current => ({ ...current, ...patch }))

  const addMember = async (candidate) => {
    if(!candidate.name?.trim()) return
    if(candidate.email && !isValidEmail(candidate.email)){
      setError('Skriv inn en gyldig e-postadresse.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try{
      if(supabaseMode && trip?.source !== 'local'){
        const saved = await addTripMemberToTrip({ tripId: trip.id, member: candidate })
        setMembers([...members, saved])
        if(saved?.inviteError) setError(saved.inviteError)
        else if(candidate.email && candidate.invite) setMessage('Deltaker lagt til og invitasjon sendt.')
        else setMessage('Deltaker lagt til.')
      }else{
        setMembers([...members, {
          id: `member-${Date.now()}`,
          familyMemberId: candidate.familyMemberId || null,
          name: candidate.name.trim(),
          email: candidate.email?.trim().toLowerCase() || '',
          relation: candidate.relation || 'family',
          role: relationLabel(candidate.relation || 'family'),
          status: candidate.email && candidate.invite ? 'test' : 'active'
        }])
        setMessage(candidate.email && candidate.invite ? 'Deltaker lagt til. E-postinvitasjon simuleres i testmodus.' : 'Deltaker lagt til.')
      }
      setPerson({ name: '', email: '', relation: 'adult', invite: true })
    }catch(addError){
      setError(addError.message || 'Klarte ikke å legge til deltaker.')
    }finally{
      setSaving(false)
    }
  }

  const add = () => addMember({ ...person, name: person.name.trim(), email: person.email.trim().toLowerCase(), id: createClientId('participant') })
  const addFromFamily = (member) => addMember({
    id: createClientId('participant'),
    familyMemberId: member.id,
    name: member.name,
    email: member.email || '',
    relation: member.relation || 'family',
    invite: Boolean(member.email)
  })

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

  const availableFamily = family.filter(member => !members.some(row => row.familyMemberId === member.id || (member.email && row.email === member.email)))

  return <><div className="titleRow"><h2>Deltakere</h2></div>{message && <div className="authMsg ok">{message}</div>}{error && <div className="authMsg error">{error}</div>}{members.length ? members.map(member => <div className="member card" key={member.id}><Avatar name={member.name}/><div><b>{member.name}</b><small>{memberSubtitle(member)} · Pakket {packing.filter(item => item.assignedTo === member.id && item.packed).length}/{packing.filter(item => item.assignedTo === member.id).length}</small></div><em className={balance(member.id) < 0 ? 'red' : 'green'}>{balance(member.id) === 0 ? inviteStatusLabel(member.status) : balance(member.id) > 0 ? `Til gode ${formatMoney(balance(member.id))}` : `Skylder ${formatMoney(-balance(member.id))}`}</em>{members.length > 1 && <button className="rowAction" onClick={() => remove(member.id)} type="button">Fjern</button>}</div>) : <Empty title="Ingen deltakere" text="Deltakere vises her når de er lagt inn på turen."/>}
    {availableFamily.length > 0 && <><h2 className="sectionTitle">Legg til fra familie</h2><div className="memberList compactList">{availableFamily.map(member => <button className="familyPick" key={member.id} onClick={() => addFromFamily(member)} type="button" disabled={saving}><Avatar name={member.name}/><span><b>{member.name}</b><small>{member.email || relationLabel(member.relation)}</small></span><em>Legg til</em></button>)}</div></>}
    <h2 className="sectionTitle">Ny deltaker</h2><div className="inlineForm familyForm"><input value={person.name} onChange={e => updatePerson({ name: e.target.value })} placeholder="Navn på deltaker"/><input type="email" value={person.email} onChange={e => updatePerson({ email: e.target.value })} placeholder="E-post for invitasjon"/><select value={person.relation} onChange={e => updatePerson({ relation: e.target.value })}>{relationOptions.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><label className="checkRow"><input type="checkbox" checked={person.invite} onChange={e => updatePerson({ invite: e.target.checked })}/><span>Send invitasjon automatisk</span></label><div><button onClick={() => setPerson({ name: '', email: '', relation: 'adult', invite: true })}>Tøm</button><button onClick={add} disabled={saving}>{saving ? 'Lagrer …' : 'Legg til'}</button></div></div></>
}


function MatchScreen({ trip, matches, setMatches }){
  const [adding, setAdding] = useState(false)
  return <><h2>Kamper</h2>{matches.length ? matches.map(match => {
    const rows = [['Kampstart', match.start], ['Oppmøte', match.meetup], ['Bane', match.venue]].filter(([, value]) => value)
    return <div className="match" key={match.id}><div><h3>{trip.title} – {match.opponent}</h3><b>{match.status}</b></div>{rows.length > 0 && <section>{rows.map(([label, value]) => <span key={label}><b>{value}</b>{label}</span>)}</section>}{match.kit && <p>Drakt: {match.kit}</p>}<div className="rowButtons"><button onClick={() => setMatches(matches.map(row => row.id === match.id ? { ...row, status: 'Ferdig', result: 'Registrert' } : row))}>Legg inn resultat</button><button onClick={() => setMatches(matches.filter(row => row.id !== match.id))}>Fjern</button></div></div>
  }) : <Empty title="Ingen kamper" text="Legg inn cupkamper med oppmøtetid, bane og draktfarge." action="Legg til kamp" onAction={() => setAdding(true)}/>} {!adding && <button className="dashed" onClick={() => setAdding(true)}><Plus size={18}/> Legg til kamp</button>}{adding && <AddMatch matches={matches} setMatches={setMatches} close={() => setAdding(false)}/>}</>
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

function SettingsScreen({ trip, deleteTrip, setView }){
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const location = trip.location && trip.location !== 'Ikke satt' ? trip.location : ''
  const remove = async () => {
    setWorking(true)
    setError('')
    try{
      await deleteTrip()
    }catch(removeError){
      setError(removeError.message || 'Klarte ikke å slette turen.')
      setWorking(false)
    }
  }
  return <><h2>Innstillinger</h2><div className="card info"><p><b>Turnavn</b><span>{trip.title}</span></p><p><b>Turtype</b><span>{tripTypeLabel(trip.type)}</span></p>{location && <p><b>Hovedsted</b><span>{location}</span></p>}<p><b>Invitasjonskode</b><span>{trip.inviteCode || 'Ikke laget'}</span></p><p><b>Lagring</b><span>{trip.source === 'local' ? 'Lokal testmodus' : 'Supabase'}</span></p><p><b>Din rolle</b><span>Eier</span></p></div>{error && <div className="authMsg error">{error}</div>}<div className="settingsActions"><button className="primary" type="button" onClick={() => setView('editTrip')}>Rediger tur</button>{!confirming && <button className="dangerButton" type="button" onClick={() => setConfirming(true)}>Slett tur</button>}</div>{confirming && <div className="deleteConfirm card"><h3>Slette turen?</h3><p>Dette fjerner turen fra Travelvault. Innhold som deltakere, planpunkter, dokumenter og bilder knyttet til turen fjernes også.</p><div><button className="secondary" type="button" onClick={() => setConfirming(false)} disabled={working}>Avbryt</button><button className="dangerButton" type="button" onClick={remove} disabled={working}>{working ? 'Sletter …' : 'Slett tur'}</button></div></div>}</>
}

function DocumentInsightPanel({ documents }){
  const suggestion = buildTripImportSuggestion(documents)
  if(!documents.length){
    return <section className="smartImportPanel card"><h3>Start med dokumentene</h3><p>Velg billetter, hotellbekreftelser, ferge, leiebil eller aktiviteter. TravelVault leser filen lokalt og fyller ut det den kan automatisk.</p></section>
  }
  return <section className="smartImportPanel card"><div className="smartImportTop"><span className="iconTile"><RefreshCw size={17}/></span><div><h3>Dokumenttolkning</h3><p>{suggestion.hasSuggestions ? 'Travelvault har fylt ut tydelige reisedetaljer.' : 'Dokumentene ble lest lokalt, men ga foreløpig få klare detaljer.'}</p></div></div>{suggestion.summaries.length > 0 && <div className="suggestionGrid">{suggestion.summaries.map(summary => <span key={summary}>{summary}</span>)}</div>}{suggestion.events.length > 0 && <div className="suggestedEvents"><b>Planpunkter lagt inn</b>{suggestion.events.slice(0, 5).map(event => <small key={event.id}>{event.title} · {event.day}{event.place && event.place !== 'Ikke satt' ? ` · ${event.place}` : ''}</small>)}</div>}</section>
}

function DocScreen({ trip, documents, setDocuments, events = [], members = [], supabaseMode, documentTarget, setDocumentTarget, onApplyDocumentSuggestions }){
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('other')
  const [files, setFiles] = useState([])
  const [linkedEventId, setLinkedEventId] = useState('')
  const [linkedMemberId, setLinkedMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)
  const eventLabel = id => events.find(event => event.id === id)?.title
  const memberLabel = id => members.find(member => member.id === id)?.name
  const appliesTo = document => [eventLabel(document.linkedEventId), memberLabel(document.linkedMemberId)].filter(Boolean).join(' · ') || 'Hele turen'
  const selectedAnalysis = files.length === 1 ? documentAnalysisSuggestion(type) : null
  const resetForm = () => {
    setTitle('')
    setType('other')
    setFiles([])
    setLinkedEventId('')
    setLinkedMemberId('')
    setError('')
    setDocumentTarget?.(null)
  }
  const openFilePicker = () => {
    if(saving) return
    if(fileInputRef.current){
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }
  useEffect(() => {
    if(!documentTarget) return
    setAdding(true)
    setLinkedEventId(documentTarget.eventId || '')
    setType(documentTarget.type || 'other')
    setTitle(current => current || (documentTarget.eventTitle ? `Dokument for ${documentTarget.eventTitle}` : ''))
  }, [documentTarget?.eventId])
  const selectFile = (event) => {
    const selected = Array.from(event.target.files || [])
    const unsupported = unsupportedDocumentFileNames(selected)
    setFiles(unsupported.length ? [] : selected)
    setError(unsupported.length ? `Denne filtypen støttes ikke ennå: ${unsupported.join(', ')}. Bruk PDF, Word eller bilde.` : '')
    setMessage('')
    if(!selected.length || unsupported.length) return
    const inferredType = inferDocumentType(selected[0].name)
    setType(inferredType)
    setTitle(selected.length === 1 ? suggestedDocumentTitle(selected[0].name, inferredType) : `${selected.length} reisedokumenter`)
    setAdding(true)
    save(selected)
  }
  const cancel = () => {
    resetForm()
    setAdding(false)
  }
  const save = async (selectedFiles = files) => {
    const filesToSave = Array.from(selectedFiles || [])
    if(!filesToSave.length){
      setError('Velg minst én fil først.')
      return
    }
    const unsupported = unsupportedDocumentFileNames(filesToSave)
    if(unsupported.length){
      setError(`Denne filtypen støttes ikke ennå: ${unsupported.join(', ')}. Bruk PDF, Word eller bilde.`)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try{
      const importRows = []
      const failures = []
      for(const [index, currentFile] of filesToSave.entries()){
        const documentText = await readDocumentText(currentFile)
        const currentType = inferDocumentType(currentFile.name, documentText)
        const provisionalTitle = suggestedDocumentTitle(currentFile.name, currentType)
        let extractedData = createDocumentInsight(currentFile.name, currentType, provisionalTitle, documentText, { pdfWithoutText: isPdfFile(currentFile) && !documentText })
        const documentTitle = suggestedDocumentTitle(currentFile.name, currentType, extractedData)
        if(documentTitle !== provisionalTitle){
          extractedData = createDocumentInsight(currentFile.name, currentType, documentTitle, documentText, { pdfWithoutText: isPdfFile(currentFile) && !documentText })
        }
        const importDocument = {
          id: `doc-${Date.now()}-${index}`,
          title: documentTitle,
          type: currentType,
          fileName: currentFile.name,
          fileSize: Number(currentFile.size || 0),
          mimeType: currentFile.type || '',
          linkedEventId: linkedEventId || null,
          linkedMemberId: linkedMemberId || null,
          extractedData,
          source: 'parsed-only',
          savedFile: false
        }
        if(!documentText.trim()){
          failures.push(`${currentFile.name}: ingen lesbar tekst eller OCR.`)
          continue
        }
        if(!documentHasImportableDetails(importDocument)){
          failures.push(`${currentFile.name}: fant tekst, men ikke tydelige reisedetaljer.`)
          continue
        }
        importRows.push(importDocument)
      }
      if(!importRows.length) throw new Error(importFailureMessage(failures))
      const importSuggestion = buildTripImportSuggestion(importRows)
      if(!importSuggestion.hasSuggestions) throw new Error(importFailureMessage(failures))
      await onApplyDocumentSuggestions?.(importSuggestion)
      resetForm()
      setAdding(false)
      setMessage(importRows.length === 1 ? `${documentTypeLabel(importRows[0].type)} er lest lokalt og lagt inn automatisk. Filen er ikke lagret.` : `${importRows.length} dokumenter er lest lokalt og lagt inn automatisk. Filene er ikke lagret.`)
    }catch(saveError){
      setError(saveError.message || 'Klarte ikke å lese dokumentet.')
    }finally{
      setSaving(false)
    }
  }
  const openDocument = async (document) => {
    setError('')
    try{
      let url = document.url || ''
      if(!url && supabaseMode && document.source === 'supabase') url = await createTripDocumentSignedUrl(document)
      if(!url){
        setError('Dokumentet mangler en fil som kan åpnes.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    }catch(openError){
      setError(openError.message || 'Klarte ikke å åpne dokumentet.')
    }
  }
  const remove = async (document) => {
    setError('')
    try{
      if(supabaseMode && document.source === 'supabase') await deleteTripDocumentById(document)
      if(document.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(document.url)
      setDocuments(documents.filter(row => row.id !== document.id))
    }catch(removeError){
      setError(removeError.message || 'Klarte ikke å fjerne dokumentet.')
    }
  }
  const startAdding = () => {
    setAdding(true)
    setError('')
    setMessage('')
    openFilePicker()
  }
  return <><h2>Dokumenter</h2><input ref={fileInputRef} aria-label="Velg fil" type="file" multiple accept={documentFileAccept} onChange={selectFile} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}/><DocumentInsightPanel documents={documents}/>{message && <div className="authMsg ok">{message}</div>}{error && <div className="authMsg error">{error}</div>}{documents.length ? documents.map(document => {
    const hint = document.extractedData?.summary || documentAnalysisSuggestion(document.type || 'other').summary
    const meta = [documentTypeLabel(document.type), document.fileName, formatFileSize(document.fileSize), document.savedFile === false ? 'fil ikke lagret' : ''].filter(Boolean).join(' · ')
    const canOpen = Boolean(document.url || document.fileUrl)
    return <div className="doc card" key={document.id}><FileText size={20}/><div><b>{document.title}</b><small>{meta || documentTypeLabel(document.type)} · Gjelder: {appliesTo(document)}</small><span className="docHint">Tolket: {hint}</span></div><div className="docActions">{canOpen && <button className="rowAction neutral" onClick={() => openDocument(document)} type="button"><ExternalLink size={13}/> Åpne</button>}<button className="rowAction" onClick={() => remove(document)} type="button"><Trash2 size={13}/> Fjern</button></div></div>
  }) : <Empty title="Ingen dokumenter" text="Velg flybilletter, hotellbekreftelser, kvitteringer, utflukter og andre dokumenter. Filen leses lokalt og lagres ikke." action="Les dokument" onAction={startAdding}/>} {!adding && <button className="dashed" onClick={startAdding}><Plus size={18}/> Les dokument</button>}{adding && <div className="inlineForm documentForm"><div className="analysisBox"><b>{saving ? 'Tolker og legger inn dokumentet automatisk.' : files.length > 1 ? 'Tolker og legger inn hver fil automatisk.' : files.length === 1 ? selectedAnalysis.summary : 'Velg ett eller flere dokumenter.'}</b><small>{files.length ? 'PDF, Word og bilder leses lokalt. Filene lagres ikke på server.' : 'Filvelgeren åpnes automatisk. Ingen manuell navngiving trengs.'}</small>{files.length > 0 && <small>{files.length === 1 ? `${files[0].name}${formatFileSize(files[0].size) ? ` · ${formatFileSize(files[0].size)}` : ''}` : `${files.length} filer valgt`}</small>}</div><div><button onClick={cancel} disabled={saving}>Avbryt</button><button onClick={openFilePicker} disabled={saving} type="button"><Upload size={15}/> Velg fil</button></div></div>}</>
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

const rootElement = document.getElementById('root')
if(rootElement) createRoot(rootElement).render(<RootRouter />)
