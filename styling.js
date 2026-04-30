import { ImageColorizer } from './colorizer.js';

export class StyleManager {
    constructor() {
        this.colorizer = new ImageColorizer();
    }
    
    getFormHtml(layerData) {
        const isCalc = layerData.type === 'calc';
        const bands = isCalc ? ["Index"] : (layerData.bands || ["B04", "B03", "B02"]);
        
        return `
            <div class="style-info" style="margin-bottom: 10px; font-size: 0.8em; color: #666;">
                Mode: 1-band (Instant Client-Side Styling)
            </div>

            <div id="v-inputs">
                <div class="style-row">
                    <label>Active Band</label>
                    <select id="s-band" disabled>
                        ${bands.map(b => `<option value="${b}">${b}</option>`).join('')}
                    </select>
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
    			<option value="rdylgn">NDVI (Vegetation Index)</option>
    			<option value="magma">Magma (Intensity)</option>
    			<option value="spectral">Spectral (Diverging)</option>
    			<option value="terrain">Terrain (Elevation style)</option>
		</select>

            </div>
        `;
    }

    initToggle(body, layerData) {
        // We disable complex server-side toggles here to prioritize speed.
        // The user interacts with the current greyscale data already in the browser.
        console.log("[STYLE] Local styling initialized for layer:", layerData.name);
    }

    async apply(layerData, btn) {
        // SPEED FIX: Completely bypassed fetch(`${API_BASE_URL}/visualize`)
        
        const ramp = document.getElementById('s-ramp').value;
        const opacity = parseInt(document.getElementById('s-opacity').value) / 100;

        btn.innerText = "Processing...";
        btn.disabled = true;

        try {
            console.log(`[STYLE-LOCAL] Applying ${ramp} to ${layerData.id}`);
            
            /** 
             * IMPORTANT: This requires that the 'layerData' object passed here 
             * contains the 'image' (base64 string) returned from the initial search.
             */
            if (!layerData.image) {
                throw new Error("No base image found for local styling.");
            }

            // Apply the color ramp in the browser using the CPU/GPU of the client
            const styledBase64 = await this.colorizer.colorize(layerData.image, ramp);

            // Directly update the OpenLayers layer source
            if (window.applyLayerStyle) {
                window.applyLayerStyle(layerData.id, styledBase64, opacity);
                
                // Update opacity on the map object as well
                const layers = window.olMap.getLayers().getArray();
                const layer = layers.find(l => l.get('id') === layerData.id);
                if (layer) layer.setOpacity(opacity);
                
                console.log("[STYLE-LOCAL] Success. Rendered instantly.");
            } else {
                console.error("window.applyLayerStyle not found in main.js scope.");
            }

        } catch (err) {
            console.error("[STYLE-LOCAL] Error:", err);
            alert("Styling failed: " + err.message);
        } finally {
            btn.innerText = "Apply";
            btn.disabled = false;
        }
    }
}
