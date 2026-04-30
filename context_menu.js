import { PropertiesModal } from './properties.js';
import { StylingModal } from './styling.js';

export class ContextMenu {
    constructor(map) {
        this.map = map;
        this.el = document.createElement('div');
        this.el.className = 'context-menu';
        this.el.style.display = 'none';
        document.body.appendChild(this.el);
        
        this.propModal = new PropertiesModal();
        this.styleModal = new StylingModal(map);
        
        document.addEventListener('click', () => this.el.style.display = 'none');
    }

    show(x, y, layerData) {
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.display = 'block';
        this.el.innerHTML = `
            <div class="context-menu-item" id="ctx-prop">Properties</div>
            <div class="context-menu-item" id="ctx-style">Styling</div>
            <div class="context-menu-item" id="ctx-exp">Export</div>
        `;

        document.getElementById('ctx-prop').onclick = () => this.propModal.open(layerData);
        document.getElementById('ctx-style').onclick = () => this.styleModal.open(layerData);
    }
}
