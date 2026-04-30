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
import { defaults as defaultControls } from 'ol/control.js';
import { RasterCalculator } from './calculator.js';
import { LayerExporter } from './exporter.js';
import { API_BASE_URL } from './config.js';

let aoi = null;
let currentDraw;
let activeRasters = [];
const layerMetadataStore = {};
const exporter = new LayerExporter();
const baseLayer = new TileLayer({ source: new OSM() });
const vectorSource = new VectorSource();
const vectorLayer = new VectorLayer({ source: vectorSource });

const map = new Map({
    target: 'map',
    layers: [baseLayer, vectorLayer],
    controls: defaultControls({ attribution: false, rotate: false }),
    view: new View({ center: fromLonLat([36.8, -1.3]), zoom: 10 })
});

window.olMap = map;
window.map = map;

window.applyLayerStyle = function(layerId, newBase64, opacity = 1) {
    console.log(`[STYLE-TRACE] Triggering instant update for: ${layerId}`);
    const layers = window.olMap.getLayers().getArray();
    const targetLayer = layers.find(l => l.get('id') === layerId);

    if (!targetLayer) {
        console.warn(`[STYLE-TRACE] Layer ${layerId} not found.`);
        return;
    }

    const extent = targetLayer.getSource().getImageExtent();
    const newSource = new ImageStatic({
        url: newBase64,
        imageExtent: extent,
        projection: 'EPSG:3857',
        crossOrigin: 'anonymous'
    });
    
    targetLayer.setSource(newSource);
    targetLayer.setOpacity(opacity);
    targetLayer.changed(); 
};

window.toggleRes = function(id) {
    map.getLayers().getArray().forEach(layer => {
        if (layer.get('id') === id) {
            layer.setVisible(!layer.getVisible());
        }
    });
};

function addRasterToMap(base64, aoiData, name, metadata) {
    const layerId = `layer-${Date.now()}`;
    const format = new GeoJSON();
    const geometry = format.readGeometry(aoiData);
    const imageExtent = transformExtent(geometry.getExtent(), 'EPSG:4326', 'EPSG:3857');

    const layer = new ImageLayer({
        source: new ImageStatic({ url: base64, imageExtent: imageExtent, projection: 'EPSG:3857' })
    });

    layer.set('id', layerId);
    map.addLayer(layer);

    // CRITICAL FIX: Store the raw image base64 in metadata so Styling.js can use it locally
    layerMetadataStore[layerId] = { 
        ...metadata, 
        id: layerId, 
        name: name, 
        aoi: aoiData,
        image: base64 
    };

        // Create the container for the layer item
    const list = document.getElementById('layer-list');
    const label = document.createElement('div');
    label.className = "layer-item";
    
    // Updated CSS Styles to bring checkbox and name together
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "10px";          // Controls the exact distance between box and text
    label.style.padding = "8px 12px";
    label.style.cursor = "context-menu";
    label.style.width = "100%";        // Ensures it fills the sidebar width
    label.style.borderBottom = "1px solid #f0f0f0";

    // Updated HTML: Removed ellipsis and fixed width issues
    label.innerHTML = `
        <input type="checkbox" checked 
               style="width: auto; margin: 0; cursor: pointer;" 
               onchange="window.toggleRes('${layerId}')">
        <span style="font-size: 0.9em; 
                     color: #333; 
                     white-space: nowrap; 
                     font-weight: 500;
                     user-select: none;">${name}</span>
    `;

    label.oncontextmenu = (e) => {
        e.preventDefault();
        exporter.showMenu(e.clientX, e.clientY, layerMetadataStore[layerId]);
    };
    list.appendChild(label);

}

const calculator = new RasterCalculator(
    () => activeRasters,
    async (calcData) => await runSpectralCalculation(calcData)
);

async function runSpectralCalculation(calcData) {
    if (activeRasters.length === 0) return false;
    const lastRaster = activeRasters[activeRasters.length - 1];
    const payload = { 
        expression: calcData.expression, 
        name: calcData.name, 
        aoi: aoi, 
        collection: lastRaster.collection, 
        dates: lastRaster.dates 
    };

    try {
        const response = await fetch(`${API_BASE_URL}/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.image) {
            addRasterToMap(data.image, data.aoi, calcData.name, { 
                type: 'calc', 
                collection: lastRaster.collection, 
                dates: lastRaster.dates, 
                expression: payload.expression, 
                bands: ["Index"] 
            });
            return true;
        }
    } catch (err) {
        console.error("Calculation failed", err);
        return false;
    }
}

async function search() {
    if (!aoi) {
        alert("Please draw or upload an Area of Interest (AOI).");
        return;
    }
    const btn = document.getElementById('search-btn');
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    const payload = {
        collection: document.getElementById('collection-select').value,
        cloud_cover: parseInt(document.getElementById('cloud-filter').value),
        start_date: document.getElementById('start-date').value,
        end_date: document.getElementById('end-date').value,
        bands: document.getElementById('bands-input').value.split(',').map(b => b.trim()).filter(b => b),
        aoi: aoi
    };

    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.image) {
            const displayName = `${payload.collection} (${payload.start_date})`;
            addRasterToMap(data.image, data.aoi, displayName, { 
                type: 'search', 
                collection: payload.collection, 
                dates: [payload.start_date, payload.end_date], 
                bands: payload.bands 
            });
            activeRasters.push({ 
                name: displayName, 
                bands: payload.bands, 
                collection: payload.collection, 
                dates: [payload.start_date, payload.end_date] 
            });
        }
    } catch (err) {
        alert("Search failed. Check backend logs.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

document.getElementById('search-btn').addEventListener('click', search);

document.getElementById('cloud-filter').addEventListener('input', (e) => {
    document.getElementById('cloud-val').innerText = e.target.value;
});

const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

function validateDates() {
    const start = startDateInput.value;
    const end = endDateInput.value;

    // Ensure the calendar picker for End Date doesn't allow picking past dates
    endDateInput.min = start;

    // Only compare if both dates are actually filled in
    if (start && end && end < start) {
        alert("End date cannot be earlier than start date!");
        endDateInput.value = start; // Force sync
    }
}

// Listen to both so the user can't "sneak" an invalid date in
startDateInput.addEventListener('change', validateDates);
endDateInput.addEventListener('change', validateDates);


document.getElementById('draw-type').addEventListener('change', (e) => {
    map.removeInteraction(currentDraw);
    const type = e.target.value;
    if (type === 'None') return;
    let geometryFunction, drawType = type;
    if (type === 'Box') {
        drawType = 'Circle';
        geometryFunction = createBox();
    }
    currentDraw = new Draw({ source: vectorSource, type: drawType, geometryFunction });
    map.addInteraction(currentDraw);
    currentDraw.on('drawend', (event) => {
        aoi = new GeoJSON().writeGeometryObject(event.feature.getGeometry(), { 
            featureProjection: 'EPSG:3857', 
            dataProjection: 'EPSG:4326' 
        });
    });
});

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
        if (features.length > 0) {
            map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50] });
            aoi = format.writeGeometryObject(features[0].getGeometry(), { 
                featureProjection: 'EPSG:3857', 
                dataProjection: 'EPSG:4326' 
            });
        }
    };
    reader.readAsText(file);
});

document.getElementById('base-layer-check').addEventListener('change', (e) => {
    baseLayer.setVisible(e.target.checked);
});
