// frontend_copernicus/editor.js
import { API_BASE_URL } from './config.js';

export class CodeEditorManager {
    constructor() {
        this.pyodide = null;
        this.editor = null;
        this.initDOM();
        this.loadDependencies();
    }

    initDOM() {
        const panel = document.createElement('section');
        panel.id = 'code-editor-container';
        panel.innerHTML = `
            <div class="editor-header">
                <h3>Python Processing & Machine Learning Engine</h3>
                <div class="editor-actions">
                    <button id="run-code-btn" class="editor-btn run" disabled>Initializing WebAssembly...</button>
                    <button id="clear-console-btn" class="editor-btn clear">Clear Dashboard</button>
                </div>
            </div>
            <div id="monaco-workspace"></div>
            
            <div class="output-tabs">
                <button class="tab-btn active" data-target="pane-console">Terminal Logs</button>
                <button class="tab-btn" data-target="pane-charts">Graphical Charts</button>
                <button class="tab-btn" data-target="pane-tables">Data Tables</button>
            </div>
            
            <div id="pane-console" class="tab-content console-output-pane active">
                <div class="console-header">System Execution Logs</div>
                <pre id="editor-console">Booting in-browser analytical runtime environment...\n</pre>
            </div>
            
            <div id="pane-charts" class="tab-content" style="background:#f0f0f0;">
                <div id="chart-render-target"><p style="color:#666; padding:20px;">No charts compiled yet. Run a matplotlib execution loop.</p></div>
            </div>
            
            <div id="pane-tables" class="tab-content" style="background:#1e1e1e;">
                <div id="table-render-target" class="dataframe-container"><p style="color:#aaa; padding:20px;">No matrix tables generated. Output a pandas DataFrame.</p></div>
            </div>
        `;
        
        document.querySelector('.main-container').appendChild(panel);
        this.logElement = document.getElementById('editor-console');
        this.setupTabListeners();
    }

    setupTabListeners() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tab.getAttribute('data-target')).classList.add('active');
            });
        });
    }

    async loadDependencies() {
        try {
            this.appendLog("Loading local Monaco core dependencies...");
            await this.loadScript("./vendor/monaco/vs/loader.js");
            window.require.config({ paths: { 'vs': './vendor/monaco/vs' } });
            
            await new Promise((resolve, reject) => {
                window.require(['vs/editor/editor.main'], () => {
                    this.editor = monaco.editor.create(document.getElementById('monaco-workspace'), {
                        value: this.getDefaultScript(),
                        language: 'python',
                        theme: 'vs-dark',
                        automaticLayout: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineHeight: 20
                    });
                    resolve();
                }, (err) => reject(new Error("Monaco boot crash: " + err)));
            });

            this.appendLog("Monaco compiled.\nBooting offline Pyodide processing core...");
            await this.loadScript("/vendor/pyodide/pyodide.js");
            
            this.pyodide = await window.loadPyodide({ indexURL: "/vendor/pyodide/" });
            
            this.appendLog("Pyodide Core mounted. Pre-installing standard packages (Numpy, Pandas, Matplotlib, Micropip)...");
            await this.pyodide.loadPackage(["numpy", "pandas", "matplotlib", "micropip"]);
            
            this.appendLog("System control loops and analytical modules fully loaded!");
            this.injectBindings();
            
            const runBtn = document.getElementById('run-code-btn');
            runBtn.innerText = "⚡ Run Analytic Workspace";
            runBtn.disabled = false;
            this.bindEvents();
        } catch (error) {
            this.appendLog(`\n[CRITICAL ERROR] ${error.message}`);
        }
    }

    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Fetch error: ${url}`));
            document.head.appendChild(script);
        });
    }

    appendLog(message) {
        this.logElement.innerText += message + "\n";
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    bindEvents() {
        document.getElementById('run-code-btn').onclick = () => this.executePythonCode();
        document.getElementById('clear-console-btn').onclick = () => {
            this.logElement.innerText = "Workspace displays flushed.\n";
            document.getElementById('chart-render-target').innerHTML = '<p style="color:#666; padding:20px;">No charts compiled yet.</p>';
            document.getElementById('table-render-target').innerHTML = '<p style="color:#aaa; padding:20px;">No matrix tables generated.</p>';
        };
    }

    injectBindings() {
        window.__pyodide_stdout_stream = (msg) => this.appendLog(`[STDOUT] ${msg}`);
        window.__pyodide_api_url = API_BASE_URL;
        window.__pyodide_get_aoi = () => window.currentDashboardAOI || null;
        
        window.__pyodide_render_chart = (base64Img) => {
            document.getElementById('chart-render-target').innerHTML = `<img src="data:image/png;base64,${base64Img}" />`;
        };
        
        window.__pyodide_render_table = (htmlContent) => {
            document.getElementById('table-render-target').innerHTML = htmlContent;
        };

        window.__pyodide_add_raster = (base64, aoi, name, meta) => {
            if (window.addRasterToMapGlobalHook) {
                window.addRasterToMapGlobalHook(base64, aoi, name, meta);
            }
        };

        this.pyodide.runPython(`
            import js, json, io, base64
            
            class CopernicusDashboardPlatform:
                def print_log(self, text):
                    getattr(js.window, "__pyodide_stdout_stream")(str(text))
                
                def get_active_aoi(self):
                    get_aoi_func = getattr(js.window, "__pyodide_get_aoi")
                    aoi_data = get_aoi_func()
                    if not aoi_data:
                        raise Exception("No active Area of Interest (AOI) marked on the dashboard map grid view.")
                    return json.loads(json.dumps(aoi_data.to_py()))

                def search(self, collection, start_date, end_date, bands=["B04","B03","B02"], cloud_cover=20):
                    self.print_log(f"[Dashboard Core] Dispatching Copernicus Cloud Scan: {collection}...")
                    aoi = self.get_active_aoi()
                    payload = {"collection": collection, "start_date": start_date, "end_date": end_date, "bands": bands, "cloud_cover": int(cloud_cover), "aoi": aoi}
                    
                    base_url = getattr(js.window, "__pyodide_api_url")
                    xhr = js.XMLHttpRequest.new()
                    xhr.open("POST", f"{base_url}/search", False)
                    xhr.setRequestHeader("Content-Type", "application/json")
                    xhr.send(json.dumps(payload))
                    
                    response_data = json.loads(xhr.responseText)
                    if "image" in response_data:
                        display_name = f"[Code] {collection}"
                        meta_p = {"type": "search", "collection": collection, "dates": [start_date, end_date], "bands": bands}
                        add_raster_func = getattr(js.window, "__pyodide_add_raster")
                        add_raster_func(response_data["image"], json.dumps(aoi), display_name, json.dumps(meta_p))
                        return response_data
                    raise Exception(f"Search Failure: {xhr.responseText}")

                def calculate_spectral_index(self, name, expression, collection, start_date, end_date):
                    self.print_log(f"[Python Kernel] Instantiating Raster Calculation: {expression}...")
                    aoi = self.get_active_aoi()
                    payload = {"expression": expression, "name": name, "aoi": aoi, "collection": collection, "dates": [start_date, end_date]}
                    
                    base_url = getattr(js.window, "__pyodide_api_url")
                    xhr = js.XMLHttpRequest.new()
                    xhr.open("POST", f"{base_url}/calculate", False)
                    xhr.setRequestHeader("Content-Type", "application/json")
                    xhr.send(json.dumps(payload))
                    
                    response_data = json.loads(xhr.responseText)
                    if "image" in response_data:
                        meta_payload = {"type": "calc", "collection": collection, "dates": [start_date, end_date], "expression": expression, "bands": ["Index"]}
                        add_raster_func = getattr(js.window, "__pyodide_add_raster")
                        add_raster_func(response_data["image"], json.dumps(aoi), name, json.dumps(meta_payload))
                        return response_data
                    raise Exception(f"Index Processing Failed: {xhr.responseText}")

                def show_chart(self, plt_instance):
                    buf = io.BytesIO()
                    plt_instance.savefig(buf, format='png', bbox_inches='tight')
                    buf.seek(0)
                    encoded = base64.b64encode(buf.read()).decode('utf-8')
                    plt_instance.close()
                    getattr(js.window, "__pyodide_render_chart")(encoded)
                    self.print_log("[Dashboard Graphics] Chart plotted successfully inside Charts Tab.")

                def show_table(self, pandas_dataframe):
                    html_table = pandas_dataframe.to_html(classes='dataframe-table')
                    getattr(js.window, "__pyodide_render_table")(html_table)
                    self.print_log("[Dashboard Graphics] DataFrame printed successfully inside Tables Tab.")

                async def install_packages(self, package_list):
                    import micropip
                    self.print_log(f"[Installer Engine] Fetching outside binaries: {package_list}...")
                    for pkg in package_list:
                        await micropip.install(pkg)
                        self.print_log(f"[Installer Engine] Package '{pkg}' mounted successfully.")

                def run_deep_learning(self, model_architecture_config, train_features):
                    self.print_log("[Backend Worker] Offloading neural network tensor layers to backend...")
                    xhr = js.XMLHttpRequest.new()
                    base_url = getattr(js.window, "__pyodide_api_url")
                    xhr.open("POST", f"{base_url}/deep_learning", False)
                    xhr.setRequestHeader("Content-Type", "application/json")
                    payload = {"config": model_architecture_config, "features": train_features}
                    xhr.send(json.dumps(payload))
                    return json.loads(xhr.responseText)

            platform = CopernicusDashboardPlatform()
        `);
    }

    async executePythonCode() {
        const runBtn = document.getElementById('run-code-btn');
        const code = this.editor.getValue();
        runBtn.disabled = true;
        runBtn.innerText = "⏳ Processing Models...";
        this.appendLog("\n--- [START ANALYTIC PIPELINE] ---");
        
        try {
            await this.pyodide.runPythonAsync(`
                import sys, js
                class SystemOutputCapture:
                    def __init__(self):
                        self.buf = ""
                    def write(self, t):
                        self.buf += t
                        if '\\n' in self.buf:
                            for line in self.buf.split('\\n')[:-1]:
                                if line.strip():
                                    getattr(js.window, "__pyodide_stdout_stream")(line)
                            self.buf = self.buf.split('\\n')[-1]
                    def flush(self):
                        pass
                sys.stdout = SystemOutputCapture()
                sys.stderr = SystemOutputCapture()
            `);
            
            await this.pyodide.runPythonAsync(code);
            this.appendLog("--- [PIPELINE TERMINATED SUCCESS] ---");
        } catch (err) {
            this.appendLog(`[RUNTIME EXCEPTION ENCOUNTERED]\n${err.message}`);
            this.appendLog("--- [PIPELINE TERMINATED FAILURE] ---");
        } finally {
            runBtn.disabled = false;
            runBtn.innerText = "⚡ Run Analytic Workspace";
        }
    }

    getDefaultScript() {
        return `# Advanced Geospatial Analytics Workspace
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

try:
    print("Initializing environment confirmation validation...")
    # 1. Plotting Graphical Charts with Matplotlib
    x = np.linspace(0, 10, 100)
    y = np.sin(x)
    plt.figure(figsize=(6, 3.5))
    plt.plot(x, y, label='Spectral Signal Wave', color='darkgreen', linewidth=2)
    plt.title('Pixel Intensity Distribution Spectrum')
    plt.xlabel('Wavelength Index')
    plt.ylabel('Reflectance Gain')
    plt.grid(True)
    plt.legend()
    
    # Pass plot directly to the dashboard charts display interface tab
    platform.show_chart(plt)
    
    # 2. Compiling Data Matrices and Tables with Pandas
    matrix_data = {
        'Band ID': ['B02 (Blue)', 'B03 (Green)', 'B04 (Red)', 'B08 (NIR)'],
        'Mean Reflectance': [412.5, 680.1, 521.8, 2415.3],
        'Standard Deviation': [12.4, 18.9, 15.2, 89.4],
        'Variance Threshold': [0.012, 0.031, 0.022, 0.145]
    }
    df = pd.DataFrame(matrix_data)
    
    # Pass structured data frame to the dashboard table display interface tab
    platform.show_table(df)
    print("Visual graphics tracking segments successfully initialized.")
    print("To install packages, run: await platform.install_packages(['scikit-learn', 'statsmodels'])")
except Exception as err:
    print(f"Pipeline error caught: {err}")
`;
    }
}
