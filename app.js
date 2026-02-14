/* Minimal photo->map application
   - Uses EXIF.js to read GPS from selected images
   - Uses Leaflet + OpenStreetMap tiles for display
   - Skips photos with no GPS (config chosen)
*/

const fileInputFiles = document.getElementById('fileInputFiles');
const fileInputPhotos = document.getElementById('fileInputPhotos');
const btnFiles = document.getElementById('btnFiles');
const btnPhotos = document.getElementById('btnPhotos');
const gallery = document.getElementById('gallery');
const status = document.getElementById('status');
const toggleList = document.getElementById('toggleList');
const fileList = document.getElementById('fileList');
const fileListItems = document.getElementById('fileListItems');

const map = L.map('map', {zoomControl:true}).setView([20,0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let bounds = L.latLngBounds();
let markers = [];
// Count of markers plotted (photos with GPS).
let markerCount = 0;
// Pending manual pin data (when user clicks "Pin" on an item)
let pendingPin = null;

// Wire up the UI buttons to the hidden inputs.
if(btnFiles) btnFiles.addEventListener('click', ()=> fileInputFiles.click());
if(btnPhotos){
  // show the Photos-specific button on Safari (desktop or mobile)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent || '');
  if(isSafari) btnPhotos.style.display = 'inline-block';
  btnPhotos.addEventListener('click', ()=> fileInputPhotos.click());
}

// Both inputs use the same handler
if(fileInputFiles) fileInputFiles.addEventListener('change', onFilesSelected);
if(fileInputPhotos) fileInputPhotos.addEventListener('change', onFilesSelected);

// Toggle file list visibility
if(toggleList && fileList){
  toggleList.addEventListener('click', ()=>{
    const expanded = toggleList.getAttribute('aria-expanded') === 'true';
    toggleList.setAttribute('aria-expanded', String(!expanded));
    if(expanded){
      fileList.classList.add('collapsed');
      fileList.setAttribute('aria-hidden','true');
      toggleList.textContent = 'Show selected files';
    } else {
      fileList.classList.remove('collapsed');
      fileList.setAttribute('aria-hidden','false');
      toggleList.textContent = 'Hide selected files';
    }
  });
}

async function onFilesSelected(ev){
  const files = Array.from(ev.target.files || []);
  if(files.length === 0) return;

  // Clear previous gallery and markers
  gallery.innerHTML = '';
  status.textContent = `Processing ${files.length} photo(s)...`;
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  markerCount = 0;
  bounds = L.latLngBounds();

  for(const f of files){
    await processFile(f);
  }

  if(bounds.isValid()){
    map.fitBounds(bounds.pad(0.2));
    status.textContent = `Plotted photos: ${markerCount} (skipped ${files.length - markerCount})`;
  } else {
    status.textContent = 'No photos with GPS found.';
  }

  // Reset the input so selecting the same files again will fire change
  try{ ev.target.value = null; }catch(e){}
}
function processFile(file){
  return new Promise((resolve) => {
    // Images: use EXIF.js to look for GPS
    if(file.type && file.type.startsWith('image/')){
      const reader = new FileReader();
      reader.onload = function(e){
        const dataUrl = e.target.result;
        const img = new Image();
        img.src = dataUrl;
        img.className = 'thumb';
        img.onload = function(){
          const wrapper = document.createElement('div');
          wrapper.appendChild(img.cloneNode());
          gallery.appendChild(wrapper);

          try{
            EXIF.getData(img, function(){
              const lat = EXIF.getTag(this, 'GPSLatitude');
              const lon = EXIF.getTag(this, 'GPSLongitude');
              const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
              const lonRef = EXIF.getTag(this, 'GPSLongitudeRef');
              const date = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');

              if(lat && lon && latRef && lonRef){
                const latDec = dmsToDecimal(lat, latRef);
                const lonDec = dmsToDecimal(lon, lonRef);
                addMarker(latDec, lonDec, file.name, date, dataUrl);
                createFileListEntry({filename: file.name, dataUrl, date, lat: latDec, lon: lonDec, isVideo: false});
              } else {
                // No GPS: show in list and allow manual pinning
                createFileListEntry({filename: file.name, dataUrl, date, lat: null, lon: null, isVideo: false});
              }
              resolve();
            });
          }catch(err){
            console.warn('EXIF read error', err);
            // fallback: show in list and allow manual pin
            createFileListEntry({filename: file.name, dataUrl, date: null, lat: null, lon: null, isVideo: false});
            resolve();
          }
        };
        img.onerror = function(){ resolve(); };
      };
      reader.onerror = function(){ resolve(); };
      reader.readAsDataURL(file);
      return;
    }

    // Videos: generate a thumbnail from the first frame, show video preview, manual pin only
    if(file.type && file.type.startsWith('video/')){
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.style.maxWidth = '220px';

      const wrapper = document.createElement('div');
      wrapper.appendChild(video);
      gallery.appendChild(wrapper);

      // create thumbnail canvas once frame is available
      video.addEventListener('loadeddata', function ondata(){
        try{
          const canvas = document.createElement('canvas');
          const w = video.videoWidth || 320;
          const h = video.videoHeight || 180;
          const maxThumb = 160;
          const scale = Math.min(1, maxThumb / Math.max(w, h));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const thumbImg = new Image();
          thumbImg.src = thumbDataUrl;
          thumbImg.className = 'thumb';
          wrapper.insertBefore(thumbImg, video);

          // show in file list and allow manual pin
          createFileListEntry({filename: file.name, dataUrl: thumbDataUrl, date: null, lat: null, lon: null, isVideo: true, videoUrl: url});
        }catch(err){
          console.warn('Video thumbnail error', err);
          createFileListEntry({filename: file.name, dataUrl: '', date: null, lat: null, lon: null, isVideo: true, videoUrl: url});
        }
        // keep the object URL so the <video> can still play; do not revoke immediately
        video.removeEventListener('loadeddata', ondata);
        resolve();
      });

      // error fallback
      video.addEventListener('error', function(){
        createPinButton(wrapper, {dataUrl: '', filename: file.name, isVideo: true});
        resolve();
      });

      return;
    }

    // Other file types: no-op
    resolve();
  });
}

function dmsToDecimal(coord, ref){
  if(!coord || coord.length < 3) return null;
  function rationalToNumber(r){ return r.numerator / r.denominator; }
  const deg = rationalToNumber(coord[0]);
  const min = rationalToNumber(coord[1]);
  const sec = rationalToNumber(coord[2]);
  let dec = deg + (min/60) + (sec/3600);
  if(ref === 'S' || ref === 'W') dec = -dec;
  return dec;
}

function addMarker(lat, lon, filename, date, dataUrl){
  const marker = L.marker([lat, lon]).addTo(map);
  const thumbHtml = `<div><strong>${escapeHtml(filename)}</strong>${date?`<div>${escapeHtml(date)}</div>`:''}${dataUrl?`<img src="${dataUrl}" alt="${escapeHtml(filename)}"/>`:''}</div>`;
  marker.bindPopup(thumbHtml);
  bounds.extend([lat, lon]);
  markerCount += 1;
  markers.push(marker);
}

function createFileListEntry({filename, dataUrl, date, lat, lon, isVideo, videoUrl}){
  if(!fileListItems) return;
  const li = document.createElement('li');
  li.className = 'file-item';

  const thumb = new Image();
  thumb.className = 'thumb-small';
  thumb.src = dataUrl || '';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const row = document.createElement('div');
  row.className = 'row';
  const title = document.createElement('div');
  title.textContent = filename || 'file';
  const expandBtn = document.createElement('button');
  expandBtn.className = 'toggle-expand';
  expandBtn.textContent = 'Details';
  row.appendChild(title);
  row.appendChild(expandBtn);

  const gpsTag = document.createElement('div');
  gpsTag.className = 'gps-tag';
  if(typeof lat === 'number' && typeof lon === 'number'){
    gpsTag.textContent = `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } else {
    gpsTag.textContent = 'No GPS';
  }

  meta.appendChild(row);
  meta.appendChild(gpsTag);

  const details = document.createElement('div');
  details.className = 'details';

  if(isVideo && videoUrl){
    const v = document.createElement('video');
    v.src = videoUrl;
    v.controls = true;
    v.style.maxWidth = '320px';
    details.appendChild(v);
  } else if(dataUrl){
    const big = new Image();
    big.src = dataUrl;
    big.style.maxWidth = '320px';
    details.appendChild(big);
  }

  if(date){
    const d = document.createElement('div');
    d.textContent = `Date: ${date}`;
    d.style.marginTop = '6px';
    details.appendChild(d);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.style.marginTop = '8px';
  if(typeof lat === 'number' && typeof lon === 'number'){
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'file-label';
    zoomBtn.textContent = 'Zoom to';
    zoomBtn.addEventListener('click', ()=>{
      map.setView([lat, lon], 14);
    });
    actions.appendChild(zoomBtn);
  } else {
    // Pin button uses existing helper
    createPinButton(actions, {dataUrl, filename, date, isVideo, videoUrl});
  }
  details.appendChild(actions);

  expandBtn.addEventListener('click', ()=>{
    const isExpanded = li.classList.toggle('expanded');
    expandBtn.textContent = isExpanded ? 'Hide' : 'Details';
  });

  li.appendChild(thumb);
  li.appendChild(meta);
  li.appendChild(details);

  fileListItems.appendChild(li);
}

function createPinButton(container, data){
  const btn = document.createElement('button');
  btn.textContent = 'Pin';
  btn.className = 'file-label';
  btn.style.display = 'inline-block';
  btn.style.marginTop = '6px';
  container.appendChild(btn);
  btn.addEventListener('click', ()=>{
    pendingPin = data;
    status.textContent = `Click the map to place "${data.filename}" (Esc to cancel)`;
  });
}

// Map click: if pendingPin exists, place marker there
map.on('click', function(e){
  if(!pendingPin) return;
  const p = pendingPin;
  addMarker(e.latlng.lat, e.latlng.lng, p.filename, p.date || null, p.dataUrl || '');
  status.textContent = `Pinned ${p.filename} at ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  pendingPin = null;
});

// Cancel pending pin with Escape
window.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && pendingPin){
    pendingPin = null;
    status.textContent = 'Pin cancelled.';
  }
});

function escapeHtml(s){
  return String(s).replace(/[&<>\"]/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c] || c));
}
