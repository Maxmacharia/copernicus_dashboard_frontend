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
import { LayerExporter } from './exporter.js';
import 'ol/ol.css';
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
    view: new View({ center: fromLonLat([36.8, -1.3]), zoom: 10 })
});

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
        id: layerId,
        source: new ImageStatic({ url: base64, imageExtent: imageExtent })
    });
    map.addLayer(layer);

    layerMetadataStore[layerId] = { ...metadata, name, aoi: aoiData };

    const list = document.getElementById('layer-list');
    const label = document.createElement('label');
    label.setAttribute('data-id', layerId);
    label.innerHTML = `<input type="checkbox" checked onchange="window.toggleRes('${layerId}')"> ${name}`;
    
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
    if (activeRasters.length === 0) {
        alert("No base imagery found.");
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
                expression: payload.expression
            });
            return true;
        }
    } catch (err) { return false; }
}

document.getElementById('cloud-filter').addEventListener('input', (e) => {
    document.getElementById('cloud-val').innerText = e.target.value;
});

document.getElementById('draw-type').addEventListener('change', (e) => {
    map.removeInteraction(currentDraw);
    const type = e.target.value;
    if (type === 'None') return;
    let geometryFunction, drawType = type;
    if (type === 'Box') { drawType = 'Circle'; geometryFunction = createBox(); }
    currentDraw = new Draw({ source: vectorSource, type: drawType, geometryFunction });
    map.addInteraction(currentDraw);
    currentDraw.on('drawend', (event) => {
        const format = new GeoJSON();
        aoi = format.writeGeometryObject(event.feature.getGeometry(), {
            featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326'
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
        map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50] });
        aoi = format.writeGeometryObject(features[0].getGeometry(), {
            featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326'
        });
    };
    reader.readAsText(file);
});

document.getElementById('base-layer-check').addEventListener('change', (e) => {
    baseLayer.setVisible(e.target.checked);
});

async function search() {
    if (!aoi) { alert("Please draw AOI."); return; }
    const btn = document.getElementById('search-btn');
    btn.innerText = "Processing...";
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
            activeRasters.push({ name: displayName, bands: payload.bands, collection: payload.collection, dates: [payload.start_date, payload.end_date] });
        }
    } catch (err) { alert("Search failed."); } finally { btn.innerText = "Search"; }
}
document.getElementById('search-btn').addEventListener('click', search);
