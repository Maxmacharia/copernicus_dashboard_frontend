import { API_BASE_URL } from './config.js';

export class StyleManager {
    
    getFormHtml(layerData) {
        const isCalc = layerData.type === 'calc';
        const bands = isCalc ? ["Index"] : (layerData.bands || ["B04", "B03", "B02"]);
        
        return `
            <div class="radio-group" style="margin-bottom:15px; display:flex; gap:12px;">
                <label>
                    <input type="radio" name="vis-mode" value="1-band" checked> 1-band
                </label>
                ${!isCalc ? `
                <label>
                    <input type="radio" name="vis-mode" value="3-band"> RGB
                </label>` : ''}
            </div>

            <div id="v-inputs">
                <div class="style-row">
                    <label>Band</label>
                    <select id="s-band">
                        ${bands.map(b => `<option value="${b}">${b}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="style-row">
                <label>Range</label>
                <div style="display:flex; gap:8px;">
                    <input id="s-min" type="number" step="0.1" value="${isCalc ? -1 : 0}">
                    <input id="s-max" type="number" step="0.1" value="${isCalc ? 1 : 3000}">
                </div>
            </div>

            <div class="style-row">
                <label>Opacity</label>
                <input type="range" id="s-opacity" min="0" max="100" value="100">
            </div>

            <div id="ramp-row" class="style-row">
                <label>Color Ramp</label>
                <select id="s-ramp">
                    <option value="gray">Greyscale</option>
                    <option value="viridis">Viridis</option>
                    <option value="rdylgn">NDVI</option>
                </select>
            </div>
        `;
    }

    initToggle(body, layerData) {
        const bands = layerData.bands || ["B04", "B03", "B02"];
        
        body.querySelectorAll('input[name="vis-mode"]').forEach(r => {
            r.onchange = (e) => {
                const isRGB = e.target.value === '3-band';
                const container = body.querySelector('#v-inputs');
                const ramp = body.querySelector('#ramp-row');

                if (isRGB) {
                    container.innerHTML = `
                        <label>RGB</label>
                        <div style="display:flex; gap:5px;">
                            <select id="s-r">${bands.map(b => `<option>${b}</option>`).join('')}</select>
                            <select id="s-g">${bands.map(b => `<option>${b}</option>`).join('')}</select>
                            <select id="s-b">${bands.map(b => `<option>${b}</option>`).join('')}</select>
                        </div>
                    `;
                    ramp.style.display = 'none';
                } else {
                    container.innerHTML = `
                        <label>Band</label>
                        <select id="s-band">
                            ${bands.map(b => `<option>${b}</option>`).join('')}
                        </select>
                    `;
                    ramp.style.display = 'block';
                }
            };
        });
    }

    async apply(layerData, btn) {
        const mode = document.querySelector('input[name="vis-mode"]:checked').value;
        let min = parseFloat(document.getElementById('s-min').value);
        let max = parseFloat(document.getElementById('s-max').value);

        if (min === max) {
            max = min + 1;
        }

        const opacity = parseInt(document.getElementById('s-opacity').value) / 100;

        const payload = {
            ...layerData,
            style_params: {
                mode,
                min,
                max,
                opacity,
                band: document.getElementById('s-band')?.value,
                ramp: document.getElementById('s-ramp')?.value,
                r: document.getElementById('s-r')?.value,
                g: document.getElementById('s-g')?.value,
                b: document.getElementById('s-b')?.value
            }
        };

        btn.innerText = "Applying...";

        try {
            const res = await fetch(`${API_BASE_URL}/visualize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.image) {
                // Directly pass the server-rendered base64 image straight to the map!
                window.applyLayerStyle(layerData.id, data.image);

                const layers = window.olMap.getLayers().getArray();
                const layer = layers.find(l => l.get('id') === layerData.id);
                if (layer) layer.setOpacity(opacity);
            } else {
                alert("Styling failed: " + data.error);
            }
        } catch (err) {
            console.error(err);
        } finally {
            btn.innerText = "Apply";
        }
    }
}
