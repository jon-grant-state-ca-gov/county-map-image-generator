// --- helpers -------------------------------------------------------------
const log = (msg, cls='') => {
  const p = document.createElement('div');
  if (cls) p.className = cls;
  p.textContent = msg;
  document.getElementById('output').appendChild(p);
  console.log(msg);
};

const countyName = (props) =>
  props.NAME || props.Name || props.name ||
  props.COUNTY || props.COUNTY_NAME || props.county ||
  props.NAMELSAD || props.NAMELSAD20 || "";

// Load highlights.json (map of name -> color)
async function loadHighlightsJSON(url = 'data/highlights.json') {
  try {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) return null;    
    const raw = await resp.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const map = new Map();
    for (const [name, color] of Object.entries(raw)) {
      map.set(String(name).toLowerCase().trim(), color || '#ffcc00');
    }
    return map;
  } catch {
    return null;
  }
}

// --- main ---------------------------------------------------------------
(async function main(){
  const out = document.getElementById('output');
  out.textContent = 'Starting…';

  if (!window.L) { log('Leaflet failed to load.', 'err'); return; }
  log('Libraries OK', 'ok');

  const mapEl = document.getElementById('map');
  const map = L.map(mapEl, { zoomControl:false, attributionControl:false }).setView([37.5,-119.5], 6);
  log('Map created', 'ok');

  // Fetch GeoJSON
  const urlJSON = 'data/california-counties.geojson';
  let data;
  try {
    const resp = await fetch(urlJSON, { cache:'no-cache' });
    log(`Fetch ${urlJSON} → HTTP ${resp.status}`);
    if (!resp.ok) { log('❌ Could not fetch GeoJSON.', 'err'); return; }
    data = await resp.json();
  } catch (e) {
    log('❌ Fetch/parse error: ' + e.message, 'err'); return;
  }

  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) { 
    log('❌ Not a GeoJSON FeatureCollection.', 'err'); 
    return; 
  }

  // Load highlights
  const highlightMap = await loadHighlightsJSON();
  const hiSet = new Set(highlightMap ? Array.from(highlightMap.keys()) : []);

  // Use SVG renderer
  const renderer = L.svg();

  // Create counties layer with dynamic styling
  const layer = L.geoJSON(data, {
    renderer,
    style: (feature) => {
      const key = countyName(feature.properties).toLowerCase().trim();
      const hiColor = highlightMap && highlightMap.get(key);
      return hiColor
        ? { color:'#000', weight:3, fillColor: hiColor,  fillOpacity:1 }
        : { color:'#000', weight:2, fillColor:'#bdbdbd', fillOpacity:1 };
    }
  }).addTo(map);
  log(`Layers added: ${layer.getLayers().length}`, 'ok');

  // Compute bounds for highlighted counties only
  const highlightedOnly = L.geoJSON(data, {
    filter: f => hiSet.has(countyName(f.properties).toLowerCase().trim())
  });
  const hasHighlights = highlightedOnly.getLayers().length > 0;
  const targetBounds = hasHighlights
    ? highlightedOnly.getBounds().pad(0.05)
    : layer.getBounds().pad(0.05);

  map.fitBounds(targetBounds, { padding: [16, 16] });

  await new Promise(r => map.once('moveend', r));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Export: SVG → PNG
  const svg = map.getPanes().overlayPane.querySelector('svg');
  if (!svg) { out.textContent = 'No SVG overlay found.'; return; }

  const w = svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width || 1200;
  const h = svg.viewBox.baseVal?.height || svg.getBoundingClientRect().height || 800;

  const xml = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e6f2ff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => {
      const pngURL = URL.createObjectURL(blob);
      const outImg = document.createElement('img');
      outImg.id = 'result';
      outImg.src = pngURL;
      outImg.width = w;
      outImg.height = h;

      out.innerHTML = '';
      out.appendChild(outImg);

      const dl = document.createElement('a');
      dl.textContent = 'Download PNG';
      dl.download = 'california-counties.png';
      dl.href = pngURL;
      dl.style.display = 'inline-block';
      dl.style.marginTop = '8px';
      out.appendChild(dl);

      window.addEventListener('unload', () => URL.revokeObjectURL(pngURL));
      map.remove(); mapEl.remove();
      log('Done.', 'ok');
    }, 'image/png');
  };
  img.onerror = () => { out.textContent = 'Failed to rasterize SVG.'; };
  img.src = url;
})();