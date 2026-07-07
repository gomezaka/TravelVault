import { supabase } from './supabase'

const localCache = new Map()

function normalizeLocationResult(result){
  const lat = Number(result.lat)
  const lon = Number(result.lon)
  const address = result.address || {}
  const city = address.city || address.town || address.village || address.municipality || address.county || ''
  const country = address.country || ''
  const name = result.name || result.namedetails?.name || city || result.display_name?.split(',')[0] || 'Ukjent sted'
  const shortAddress = [city && city !== name ? city : '', address.state || address.county || '', country].filter(Boolean).join(', ')
  return {
    id: `${result.osm_type || 'osm'}-${result.osm_id || result.place_id || `${lat}-${lon}`}`,
    name,
    displayName: result.display_name || name,
    shortAddress: shortAddress || result.display_name || '',
    type: result.type || result.addresstype || result.class || 'sted',
    lat,
    lon,
    boundingbox: result.boundingbox || null,
    osmType: result.osm_type || null,
    osmId: result.osm_id || null,
    source: 'OpenStreetMap'
  }
}

async function directNominatimSearch(query){
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    limit: '6',
    'accept-language': 'nb,en'
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json'
    }
  })
  if(!response.ok) throw new Error('Karttjenesten svarte ikke akkurat nå.')
  const data = await response.json()
  return Array.isArray(data) ? data.map(normalizeLocationResult).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon)) : []
}

export async function searchLocations(query){
  const cleanQuery = (query || '').trim()
  if(cleanQuery.length < 2) return []
  const cacheKey = cleanQuery.toLowerCase()
  if(localCache.has(cacheKey)) return localCache.get(cacheKey)

  if(supabase){
    try{
      const { data, error } = await supabase.functions.invoke('search-location', {
        body: { query: cleanQuery }
      })
      if(error) throw error
      const rows = Array.isArray(data?.results) ? data.results : []
      localCache.set(cacheKey, rows)
      return rows
    }catch(error){
      console.warn('Travelvault location edge search failed, falling back to direct search:', error.message)
    }
  }

  const rows = await directNominatimSearch(cleanQuery)
  localCache.set(cacheKey, rows)
  return rows
}
