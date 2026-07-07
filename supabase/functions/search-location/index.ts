const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function cleanText(value: unknown): string{
  return typeof value === 'string' ? value.trim().slice(0, 160) : ''
}

function normalizeLocationResult(result: any){
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

Deno.serve(async (request) => {
  if(request.method === 'OPTIONS'){
    return new Response('ok', { headers: corsHeaders })
  }

  if(request.method !== 'POST'){
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try{
    const body = await request.json().catch(() => ({}))
    const query = cleanText(body.query)

    if(query.length < 2){
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://travelvault.notools.no'
    const contact = Deno.env.get('NOMINATIM_CONTACT_EMAIL') || Deno.env.get('SMTP_USER') || 'travelvault@notools.no'
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      namedetails: '1',
      limit: '6',
      'accept-language': 'nb,en',
      email: contact
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Referer: appUrl,
        'User-Agent': `Travelvault/0.2 (${appUrl}; ${contact})`
      }
    })

    if(!response.ok){
      return new Response(JSON.stringify({ error: 'Karttjenesten svarte ikke akkurat nå.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const results = Array.isArray(data)
      ? data.map(normalizeLocationResult).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
      : []

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }catch(error){
    return new Response(JSON.stringify({ error: error.message || 'Klarte ikke å søke etter sted.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
