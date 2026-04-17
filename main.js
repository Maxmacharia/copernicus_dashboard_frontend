import Map from 'ol/Map.js';
import View from 'ol/View.js';
import OSM from 'ol/source/OSM.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import Draw, { createBox } from 'ol/interaction/Draw.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fromLonLat, transformExtent } from 'ol/proj.js';
import { RasterCalculator } from './calculator.js';
import 'ol/ol.css';

// --- State Management ---
let aoi = null;
let currentDraw;
let activeRasters = []; // Track metadata for the calculator

// --- Map Setup ---
const baseLayer = new TileLayer({ source: new OSM() });
const vectorSource = new VectorSource();
const vectorLayer = new VectorLayer({ source: vectorSource });

const map = new Map({
    target: 'map',
    layers: [baseLayer, vectorLayer],
    view: new View({ center: fromLonLat([36.8, -1.3]), zoom: 10 })
});

// --- Helper Functions ---

// Global toggle for layer visibility (Sidebar checkboxes)
window.toggleRes = function(id) {
    map.getLayers().getArray().forEach(layer => {
        if (layer.get('id') === id) {
            layer.setVisible(!layer.getVisible());
        }
    });
};

/**
 * Reusable function to add imagery to map and update the UI sidebar
 */
function addRasterToMap(base64, aoiData, name) {
    const layerId = `layer-${Date.now()}`;
    const format = new GeoJSON();
    const geometry = format.readGeometry(aoiData);
    const imageExtent = transformExtent(geometry.getExtent(), 'EPSG:4326', 'EPSG:3857');

    const layer = new ImageLayer({
        id: layerId,
        source: new ImageStatic({ url: base64, imageExtent: imageExtent })
    });
    
    map.addLayer(layer);

    const list = document.getElementById('layer-list');
    list.innerHTML += `
        <label>
            <input type="checkbox" checked onchange="window.toggleRes('${layerId}')"> ${name}
        </label>`;
}

// --- Raster Calculator Initialization ---
const calculator = new RasterCalculator(
    () => activeRasters, // Callback to get available layers
    async (calcData) => { // Callback when "Run" is clicked
        return await runSpectralCalculation(calcData);
    }
);

async function runSpectralCalculation(calcData) {
    if (activeRasters.length === 0) {
        alert("No base imagery found to calculate index from.");
        return false;
    }

    const lastRaster = activeRasters[activeRasters.length - 1];
    const payload = {
        expression: calcData.expression,
        name: calcData.name,
        aoi: aoi,
        collection: lastRaster.collection,
        dates: lastRaster.dates
    };

    try {
        // Updated endpoint based on typical FastAPI structure
        const response = await fetch("http://127.0.0.1:8000/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.image) {
            addRasterToMap(data.image, data.aoi, calcData.name);
            return true;
        }
    } catch (err) {
        console.error("Calculation Error:", err);
        return false;
    }
}

// --- UI Event Listeners ---

// Cloud Slider
document.getElementById('cloud-filter').addEventListener('input', (e) => {
    document.getElementById('cloud-val').innerText = e.target.value;
});

// Draw AOI Interaction
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

// GeoJSON Upload
document.getElementById('geojson-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const geojson = JSON.parse(event.target.result);
        const format = new GeoJSON();
        const features = format.readFeatures(geojson, { featureProjection: 'EPSG:3857' });
        
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

// Base Layer Toggle
document.getElementById('base-layer-check').addEventListener('change', (e) => {
    baseLayer.setVisible(e.target.checked);
});

// --- Search Logic ---
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.image) {
            const displayName = `${payload.collection} (${payload.start_date.substring(0, 7)})`;
            
            // Add to Map & UI
            addRasterToMap(data.image, data.aoi, displayName);

            // Register in Active Rasters for Calculator
            activeRasters.push({
                name: displayName,
                bands: payload.bands,
                collection: payload.collection,
                dates: [payload.start_date, payload.end_date]
            });

            console.log("Success: Image added to map.");
        } else {
            alert("Search finished, but no imagery was found for these settings.");
        }
    } catch (err) {
        console.error("Search Error:", err);
        alert("Search failed. Check backend terminal.");
    } finally {
        btn.innerText = "Search";
    }
}

document.getElementById('search-btn').addEventListener('click', search);
