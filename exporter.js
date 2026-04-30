import { PropertyManager } from './properties.js';
import { StyleManager } from './styling.js';
import { API_BASE_URL } from './config.js';

export class LayerExporter {
    constructor() {
        this.props = new PropertyManager();
        this.styles = new StyleManager();
        this.menu = this.initMenu();
    }

    initMenu() {
        const m = document.createElement('div');
        m.className = 'context-menu';
        m.style.display = 'none';
        m.innerHTML = `
            <div class="context-menu-item" id="act-prop">Properties</div>
            <div class="context-menu-item" id="act-style">Styling</div>
            <div class="context-menu-item" id="act-export">Export layer (GeoTIFF)</div>
        `;
        document.body.appendChild(m);
        document.addEventListener('click', () => m.style.display = 'none');
        return m;
    }

    showMenu(x, y, layerData) {
        this.menu.style.cssText = `left:${x}px; top:${y}px; display:block;`;
        document.getElementById('act-prop').onclick = () => this.openModal(layerData, 'properties');
        document.getElementById('act-style').onclick = () => this.openModal(layerData, 'styling');
        document.getElementById('act-export').onclick = () => this.initiateDownload(layerData);
    }

    openModal(layerData, type) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        const title = type === 'properties' ? `${layerData.name} Properties` : `${layerData.name} Styling`;
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h2>${title}</h2></div>
                <div class="modal-body"></div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
                    ${type === 'styling' ? '<button id="btn-apply" class="primary-btn" style="width:100px;">Apply</button>' : ''}
                    <button class="secondary-btn" id="btn-close" style="width:100px;">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const body = modal.querySelector('.modal-body');
        modal.querySelector('#btn-close').onclick = () => modal.remove();

        if (type === 'properties') this.props.loadProperties(layerData, body);
        if (type === 'styling') {
            body.innerHTML = this.styles.getFormHtml(layerData);
            this.styles.initToggle(body, layerData);
            modal.querySelector('#btn-apply').onclick = (e) => this.styles.apply(layerData, e.target);
        }
    }

    async initiateDownload(layerData) {
        console.log(`[EXPORT] Starting download for: ${layerData.name}`);
        
        // Step 1: Initial Message
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:black; color:white; padding:15px 25px; border-radius:30px; z-index:9999; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.3);";
        statusDiv.innerText = "Starting download...";
        document.body.appendChild(statusDiv);

        try {
            // Step 2: Change message for the long-running process
            setTimeout(() => {
                if (statusDiv) statusDiv.innerText = "Download may take a while. Please wait...";
            }, 2000);

            const res = await fetch(`${API_BASE_URL}/export`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(layerData)
            });

            if (!res.ok) throw new Error("Server failed to generate GeoTIFF.");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${layerData.name.replace(/\s+/g, '_')}.tif`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Step 3: Success message
            statusDiv.style.background = "#28a745"; // Green
            statusDiv.innerText = "Download complete!";
            
            setTimeout(() => statusDiv.remove(), 4000);

        } catch (err) {
            console.error(err);
            statusDiv.style.background = "#dc3545"; // Red
            statusDiv.innerText = "Download failed.";
            setTimeout(() => statusDiv.remove(), 5000);
            alert("Error exporting layer. The area might be too large for a direct download.");
        }
    }
}
