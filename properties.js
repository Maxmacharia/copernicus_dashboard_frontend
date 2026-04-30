import { API_BASE_URL } from './config.js';

export class PropertyManager {
    async loadProperties(layerData, modalBody) {
        modalBody.innerHTML = '<p>Loading metadata...</p>';

        try {
            const res = await fetch(`${API_BASE_URL}/metadata`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(layerData)
            });

            const meta = await res.json();

            modalBody.innerHTML = `
                <div class="prop-row"><span>Bands:</span> <b>${meta.bands.join(', ')}</b></div>
                <div class="prop-row"><span>Projection:</span> <b>${meta.crs}</b></div>
                <div class="prop-row"><span>Resolution:</span> <b>${meta.resolution}</b></div>

                <p style="margin-top: 15px; font-weight: bold; margin-bottom: 5px;">Pixel Intensity Distribution</p>
                <div class="histogram-wrapper" style="display: flex; align-items: center; gap: 10px;">
                    
                    <!-- 🔥 ISSUE 4 FIX: Fixed Y-axis label placement prevents overlap -->
                    <div style="font-size: 11px; font-weight: bold; transform: rotate(-90deg); white-space: nowrap;">
                        Intensity
                    </div>

                    <div class="histogram-container" id="realtime-hist" 
                         style="position:relative; height:150px; flex: 1; border: 1px solid #ddd; padding: 5px; background: #fafafa;">
                    </div>
                </div>
            `;

            this.renderHistogram(meta.histogram);

        } catch (err) {
            modalBody.innerHTML = '<p>Error loading metadata.</p>';
        }
    }

    renderHistogram(histData) {
        const container = document.getElementById('realtime-hist');
        if (!container || !histData) return;

        const max = Math.max(...histData);

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; width:100%;">
                
                <!-- Bars -->
                <div style="flex:1; display:flex; align-items:flex-end; border-left: 2px solid #ccc; border-bottom: 2px solid #ccc;">
                    ${histData.map(v => `
                        <div style="height:${(v / max) * 100}%; flex:1; background:#0078d7; margin: 0 1px;"></div>
                    `).join('')}
                </div>

                <!-- X-axis -->
                <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:4px;">
                    <span>0</span>
                    <span style="color: #666;">Pixel Value</span>
                    <span>255</span>
                </div>
            </div>
        `;
    }
}
