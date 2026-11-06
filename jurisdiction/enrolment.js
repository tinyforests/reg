/** Signup routing aligned with my-native-plants/app.js (7 Nov 2026).
 * Uses only pre-clearing sources. Never projects interstate results into EVC.
 */
import { vicAdapter } from './adapters/vic.js';
import { auNationalAdapter } from './adapters/au-national.js';
import { identifyPoint, queryPoint } from './arcgis.js';
import { contextRecord, provenance } from './schema.js';

const STATES = {'victoria':'VIC','new south wales':'NSW','queensland':'QLD',
  'western australia':'WA','south australia':'SA','tasmania':'TAS',
  'northern territory':'NT','australian capital territory':'ACT','jervis bay territory':'ACT'};
const SOURCES = {
  NSW: ['PCT', 'NSW SVTM 1750 PCT', 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/VIS/SVTM_NSW_1750_PCT/MapServer'],
  QLD: ['Regional Ecosystem', 'Queensland Herbarium pre-clear Regional Ecosystems', 'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/VegetationManagement/MapServer/15'],
  WA: ['Beard association', 'WA Beard Pre-European Vegetation, 1:250,000', 'https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Environment/MapServer/17']
};
const attr = (a, needle) => a?.[Object.keys(a || {}).find(k => k.toLowerCase().includes(needle))];
const valid = v => v != null && String(v).trim() !== '' && !/^(nodata|null)$/i.test(String(v).trim());

export async function resolveEnrolmentVegetation({lat, lng, state}, fetchImpl = fetch) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid coordinates');
  const jurisdiction = STATES[String(state).toLowerCase()] || String(state).toUpperCase();
  const ctx = { strictContainment: true, now: () => new Date().toISOString(),
    fetchImpl: async url => {
      const r = await fetchImpl(url, {signal: AbortSignal.timeout(12000)});
      if (!r.ok) throw new Error('Vegetation service unavailable');
      const data = await r.json();
      if (data.error) throw new Error('Vegetation service error');
      return {json: async () => data};
    }
  };
  const loc = {lat, lng};
  let local = null, note = '';
  try {
    if (jurisdiction === 'VIC') local = await vicAdapter.getOriginalVegetationContext(loc, ctx);
    else if (SOURCES[jurisdiction]) {
      const [system, source, serviceUrl] = SOURCES[jurisdiction];
      const raster = jurisdiction === 'NSW';
      const a = raster
        ? (await identifyPoint({...loc, serviceUrl, layers:'all:2', fetchImpl:ctx.fetchImpl}))[0]?.attributes
        : await queryPoint({...loc, serviceUrl, fetchImpl:ctx.fetchImpl});
      let code, name;
      if (jurisdiction === 'NSW') {
        code = a?.PCTID ?? attr(a, 'pixel value'); name = a?.PCTName || attr(a, 'pctname');
      } else if (jurisdiction === 'QLD') {
        code = a?.re || a?.re_label || a?.re1; name = valid(code) ? `Regional Ecosystem ${code}` : null;
      } else {
        code = a?.veg_assoc; name = a?.flor_desc || a?.struct_des;
      }
      local = contextRecord({system, source, code:valid(code) ? String(code) : null,
        name:valid(name) ? name : null, resolution:'state', status:valid(code) && valid(name) ? 'ok' : 'nodata',
        provenance:provenance({authority:source, dataset:source, service_url:serviceUrl,
          lookup_method:raster ? 'arcgis:identify:raster' : 'arcgis:query:point-in-polygon',
          queried_at:ctx.now(), jurisdiction})});
    }
    if (local?.status === 'ok') return {original_vegetation:local};
    if (local) note = 'No state pre-clearing classification was found here. National mapping is shown instead.';
  } catch (_) { note = 'State mapping is temporarily unavailable. National mapping is shown instead.'; }
  const national = await auNationalAdapter.getOriginalVegetationContext(loc, ctx);
  return {original_vegetation:national, ...(local ? {state_attempt:local} : {}),
    note:note || 'National pre-1750 mapping gives broad vegetation context, not a site-level assessment.'};
}
