import Map from 'ol/Map.js';
import View from 'ol/View.js';
import OSM from 'ol/source/OSM.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageLayer from 'ol/layer/Image.js'; // Added for static images
import ImageStatic from 'ol/source/ImageStatic.js'; // Added for Base64 data
import Draw, { createBox } from 'ol/interaction/Draw.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fromLonLat, transformExtent } from 'ol/proj.js';
import 'ol/ol.css';

let aoi = null;
let currentDraw;

const baseLayer = new TileLayer({ source: new OSM() });
const vectorSource = new VectorSource();
const vectorLayer = new VectorLayer({ source: vectorSource });

const map = new Map({
  target: 'map',
  layers: [baseLayer, vectorLayer],
  view: new View({ center: fromLonLat([36.8, -1.3]), zoom: 10 })
});

// FIX: Global toggle function
window.toggleRes = function(id) {
    map.getLayers().getArray().forEach(layer => {
        if (layer.get('id') === id) {
            layer.setVisible(!layer.getVisible());
        }
    });
};

// UI: Cloud Slider
document.getElementById('cloud-filter').addEventListener('input', (e) => {
    document.getElementById('cloud-val').innerText = e.target.value;
});

// UI: Draw AOI
document.getElementById('draw-type').addEventListener('change', (e) => {
    map.removeInteraction(currentDraw);
    const type = e.target.value;
    if (type === 'None') return;

    let geometryFunction;
    let drawType = type;
    if (type === 'Box') {
        drawType = 'Circle';
        geometryFunction = createBox();
    }

    currentDraw = new Draw({ source: vectorSource, type: drawType, geometryFunction });
    map.addInteraction(currentDraw);

    currentDraw.on('drawend', (event) => {
        const format = new GeoJSON();
        aoi = format.writeGeometryObject(event.feature.getGeometry(), {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
        });
    });
});

// UI: GeoJSON Upload
document.getElementById('geojson-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const geojson = JSON.parse(event.target.result);
        const format = new GeoJSON();
        const features = format.readFeatures(geojson, {
            featureProjection: 'EPSG:3857'
        });
        vectorSource.clear();
        vectorSource.addFeatures(features);
        map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50] });
        
        aoi = format.writeGeometryObject(features[0].getGeometry(), {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
        });
    };
    reader.readAsText(file);
});

document.getElementById('base-layer-check').addEventListener('change', (e) => {
    baseLayer.setVisible(e.target.checked);
});

// SEARCH & DISPLAY LOGIC
async function search() {
    if (!aoi) {
        alert("Please draw an area on the map or upload a GeoJSON first.");
        return;
    }

    const btn = document.getElementById('search-btn');
    btn.innerText = "Processing Pixels...";
    
    const payload = {
        collection: document.getElementById('collection-select').value,
        cloud_cover: parseInt(document.getElementById('cloud-filter').value),
        start_date: document.getElementById('start-date').value,
        end_date: document.getElementById('end-date').value,
        bands: document.getElementById('bands-input').value.split(',').map(b => b.trim()).filter(b => b),
        aoi: aoi
    };

    try {
        const response = await fetch("http://127.0.0.1:8000/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (data.image) {
            const layerId = `layer-${Date.now()}`;
            
            // 1. Calculate the bounding box for the image from the AOI
            const format = new GeoJSON();
            const geometry = format.readGeometry(data.aoi);
            const extent4326 = geometry.getExtent();
            
            // 2. Transform extent back to map projection (3857) for display
            const imageExtent = transformExtent(extent4326, 'EPSG:4326', 'EPSG:3857');

            // 3. Create Static Image Layer
            const sentinelLayer = new ImageLayer({
                id: layerId,
                source: new ImageStatic({
                    url: data.image, // The Base64 string from backend
                    imageExtent: imageExtent
                })
            });

            map.addLayer(sentinelLayer);

            // 4. Update Sidebar
            const list = document.getElementById('layer-list');
            const dateStr = payload.start_date.substring(0, 7); // Show YYYY-MM
            list.innerHTML += `<label><input type="checkbox" checked onchange="window.toggleRes('${layerId}')"> ${payload.collection} (${dateStr})</label>`;
            
            console.log("Success: Image added to map.");
        } else {
            alert("Search finished, but no imagery was found for these settings.");
        }
    } catch (err) {
        console.error(err);
        alert("Search failed. Check terminal.");
    } finally {
        btn.innerText = "Search";
    }
}

document.getElementById('search-btn').addEventListener('click', search);
