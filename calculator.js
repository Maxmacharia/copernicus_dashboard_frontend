export class RasterCalculator {
    constructor(getLayersCallback, onRunCallback) {
        this.getLayers = getLayersCallback;
        this.onRun = onRunCallback;
        this.initElements();
        this.initEvents();
    }

    initElements() {
        this.modal = document.getElementById('calc-modal');
        this.layerList = document.getElementById('calc-layer-list');
        this.expression = document.getElementById('calc-expression');
        this.errorDisplay = document.getElementById('calc-error');
        this.indexName = document.getElementById('index-name');
    }

    initEvents() {
        document.getElementById('open-calc-btn').onclick = () => this.open();
        document.getElementById('close-calc-btn').onclick = () => this.close();
        document.getElementById('run-calc-btn').onclick = () => this.handleRun();
        
        // Operator clicks
        document.querySelectorAll('.op-btn').forEach(btn => {
            btn.onclick = () => {
                this.expression.value += ` ${btn.innerText} `;
                this.validate();
            };
        });
    }

    open() {
        this.modal.style.display = 'block';
        this.refreshLayers();
    }

    close() {
        this.modal.style.display = 'none';
        this.errorDisplay.innerText = "";
    }

    refreshLayers() {
        const layers = this.getLayers();
        this.layerList.innerHTML = "";
        layers.forEach(lyr => {
            const bands = lyr.bands || ["B01", "B02", "B03", "B04", "B08", "B11"]; // Default bands if not specified
            const group = document.createElement('div');
            group.innerHTML = `<strong>${lyr.name}</strong>`;
            bands.forEach(band => {
                const item = document.createElement('div');
                item.className = 'band-item';
                item.innerText = band;
                item.ondblclick = () => {
                    this.expression.value += `"${band}"`;
                    this.validate();
                };
                group.appendChild(item);
            });
            this.layerList.appendChild(group);
        });
    }

    validate() {
        const val = this.expression.value;
        this.errorDisplay.innerText = "";
        
        // Simple checks
        const openQuotes = (val.match(/"/g) || []).length;
        if (openQuotes % 2 !== 0) {
            this.errorDisplay.innerText = "Error: Unclosed double quotes around bands.";
            return false;
        }

        // Check for characters outside quotes that aren't operators or numbers
        const cleaned = val.replace(/"[^"]*"/g, " BAND ");
        if (/[a-zA-Z]/.test(cleaned.replace(/BAND/g, ""))) {
            this.errorDisplay.innerText = "Error: Alphabetic characters found outside of double quotes.";
            return false;
        }

        return true;
    }

    async handleRun() {
        if (!this.validate()) return;
        if (!this.indexName.value) {
            this.errorDisplay.innerText = "Error: Please provide an Index Name.";
            return;
        }

        const runBtn = document.getElementById('run-calc-btn');
        runBtn.innerText = "Running...";
        
        const success = await this.onRun({
            name: this.indexName.value,
            expression: this.expression.value
        });

        if (success) {
            runBtn.innerText = "Done!";
            alert("Calculation complete. You can now close the interface.");
        } else {
            runBtn.innerText = "Run";
        }
    }
}
