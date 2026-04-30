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
        const title = type === 'properties' ? `${layerData.name} properties` : `${layerData.name} visualization parameters`;
        
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
        alert(`Exporting: ${layerData.name}\nProcessing GeoTIFF on server...`);
        const res = await fetch(`${API_BASE_URL}/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(layerData)
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${layerData.name.replace(/\s+/g, '_')}.tif`;
        a.click();
    }
}
