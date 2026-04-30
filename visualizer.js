import { API_BASE_URL } from './config.js';

export class LayerVisualizer {
    constructor(updateLayerCallback) {
        this.updateLayer = updateLayerCallback;
    }

    async showProperties(layerData) {
        const modal = this.createModal(`${layerData.name} Properties`);
        const res = await fetch(`${API_BASE_URL}/metadata`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify(layerData)
        });
        const meta = await res.json();

        modal.body.innerHTML = `
            <div class="prop-row"><span>Bands:</span> <b>${meta.bands.join(', ')}</b></div>
            <div class="prop-row"><span>CRS:</span> <b>${meta.crs}</b></div>
            <div class="prop-row"><span>Resolution:</span> <b>${meta.spatial_res}</b></div>
            <p style="margin-top:15px">Pixel Distribution:</p>
            <div class="histogram-cont">
                ${meta.histogram.map(val => `<div class="hist-bar" style="height:${(val/Math.max(...meta.histogram))*100}%"></div>`).join('')}
            </div>
        `;
    }

    showStyling(layerData) {
        const modal = this.createModal(`${layerData.name} Visualization Parameters`);
        modal.body.innerHTML = `
            <div class="radio-group">
                <label><input type="radio" name="vis-mode" value="grayscale" checked> 1-band(grayscale)</label>
                <label><input type="radio" name="vis-mode" value="rgb"> 3-band(RGB)</label>
            </div>
            <div id="styling-content"></div>
        `;

        const content = modal.body.querySelector('#styling-content');
        const renderGrayscale = () => {
            content.innerHTML = `
                <div class="style-row"><label>Band</label><select id="v-band">${layerData.bands.map(b => `<option>${b}</option>`)}</select></div>
                <div class="style-row"><label>Range</label><div class="range-inputs"><input id="v-min" value="0"><input id="v-max" value="3000"></div></div>
                <div class="style-row"><label>Opacity</label><input type="range" id="v-opacity" min="0" max="100" step="10" value="100"></div>
                <div class="style-row"><label>Color Ramp</label><select><option>Viridis</option><option>Greyscale</option></select></div>
            `;
        };

        renderGrayscale();
        modal.body.querySelectorAll('input[name="vis-mode"]').forEach(r => {
            r.onchange = (e) => {
                if(e.target.value === 'grayscale') renderGrayscale();
                else content.innerHTML = `<p>RGB Selectors (R, G, B dropdowns)...</p>`;
            };
        });

        modal.footer.innerHTML = `<button class="primary-btn" id="apply-style">Apply</button> <button class="secondary-btn" id="close-vis">Close</button>`;
        modal.footer.querySelector('#apply-style').onclick = () => alert("Style applied to map...");
        modal.footer.querySelector('#close-vis').onclick = () => modal.el.remove();
    }

    createModal(title) {
        const el = document.createElement('div');
        el.className = 'modal';
        el.style.display = 'block';
        el.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h2>${title}</h2></div>
                <div class="modal-body" id="m-body">Loading...</div>
                <div class="modal-footer" id="m-footer"><button class="secondary-btn" onclick="this.closest('.modal').remove()">Close</button></div>
            </div>`;
        document.body.appendChild(el);
        return { el, body: el.querySelector('#m-body'), footer: el.querySelector('#m-footer') };
    }
}
