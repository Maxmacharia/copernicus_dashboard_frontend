export class LayerExporter {
    constructor() {
        this.menu = null;
        this.activeLayerData = null;
        this.init();
    }

    init() {
        this.menu = document.createElement('div');
        this.menu.className = 'context-menu';
        this.menu.style.display = 'none';
        this.menu.innerHTML = `<div class="context-menu-item" id="export-action">Export layer (GeoTIFF)</div>`;
        document.body.appendChild(this.menu);

        document.addEventListener('click', () => this.hideMenu());
    }

    showMenu(x, y, layerData) {
        this.activeLayerData = layerData;
        this.menu.style.top = `${y}px`;
        this.menu.style.left = `${x}px`;
        this.menu.style.display = 'block';

        const exportBtn = document.getElementById('export-action');
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            this.initiateDownload();
        };
    }

    hideMenu() {
        this.menu.style.display = 'none';
    }

    async initiateDownload() {
        if (!this.activeLayerData) return;
        this.hideMenu();
        
        const layerName = this.activeLayerData.name;
        // Notify the user that processing is happening on the server
        console.log(`Exporting: ${layerName}`);
        const statusMsg = `Layer "${layerName}" is exporting...\nThis will take a moment while we process the GeoTIFF on the server.`;
        alert(statusMsg);

        try {
            const response = await fetch("http://127.0.0.1:8000/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.activeLayerData)
            });

            if (!response.ok) {
                const errorDetail = await response.json();
                throw new Error(errorDetail.detail || "Server error during export.");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${layerName.replace(/\s+/g, '_')}.tif`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            // Final success notification
            setTimeout(() => alert(`Successfully downloaded: ${layerName}`), 100);
            
        } catch (err) {
            console.error("Export Error:", err);
            alert(`Failed to export "${layerName}".\n\nReason: ${err.message}\n\nPlease check the backend terminal for details.`);
        }
    }
}
