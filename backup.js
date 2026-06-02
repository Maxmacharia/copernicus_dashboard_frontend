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
        // Create Code Editor Container Panel
        const panel = document.createElement('section');
        panel.id = 'code-editor-container';
        panel.innerHTML = `
            <div class="editor-header">
                <h3>Python Programming Playground</h3>
                <div class="editor-actions">
                    <button id="run-code-btn" class="editor-btn run" disabled>Loading Engine...</button>
                    <button id="clear-console-btn" class="editor-btn clear">Clear Logs</button>
                </div>
            </div>
            <div id="monaco-workspace"></div>
            <div class="console-output-pane">
                <div class="console-header">System Execution Output</div>
                <pre id="editor-console">Initializing WebAssembly Runtime Environment...\n</pre>
            </div>
        `;
        
        // Target structural append right under main container view
        document.querySelector('.main-container').appendChild(panel);
        this.logElement = document.getElementById('editor-console');
    }

    async loadDependencies() {
        try {
            this.appendLog("Loading Monaco Core Editor from local offline assets...");

            // FIX: Switched from absolute path "/vendor/..." to explicit relative path "./vendor/..."
            await this.loadScript("./vendor/monaco/vs/loader.js");
            
            // Match the configuration tracking path to look into the relative path folder directory
            window.require.config({ 
                paths: { 'vs': './vendor/monaco/vs' } 
            });

            // Initialize the UI workspace view cleanly
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
                }, (err) => reject(new Error("Monaco layout generation halted: " + JSON.stringify(err))));
            });

            this.appendLog("Monaco Engine initialized.\nBooting standalone client-side Pyodide runtime...");

            // FIX: Switched Pyodide path to use the explicit relative fallback directory routing path
            await this.loadScript("./vendor/pyodide/pyodide.js");

            // Force Pyodide to load its core binary modules straight from the local folder
            this.pyodide = await window.loadPyodide({
                indexURL: "./vendor/pyodide/"
            });

            this.appendLog("Pyodide execution environment ready. Injecting system control loops...");
            this.injectBindings();

            const runBtn = document.getElementById('run-code-btn');
            runBtn.innerText = "⚡ Run Python Script";
            runBtn.disabled = false;

            this.bindEvents();
        } catch (error) {
            this.appendLog(`\n[CRITICAL INITIALIZATION ERROR] ${error.message}`);
            console.error("Dependency layout initialization failed:", error);
        }
    }

    loadScript(url) {
        return new Promise((resolve, reject) => {
            // Create an explicit HTML Script Tag element object to prevent bundler mutations
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
            script.crossOrigin = 'anonymous';
            
            script.onload = () => {
                console.log(`[LOCAL-LOAD] Successfully attached: ${url}`);
                resolve();
            };
            
            script.onerror = () => {
                reject(new Error(`Failed to load dependency metadata: ${url}`));
            };
            
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
            this.logElement.innerText = "Console cleared.\n";
        };
    }

    injectBindings() {
        // Expose JavaScript API Hooks safely inside Pyodide's Global Namespace Scope
        window.__pyodide_logger = (msg) => this.appendLog(msg);
        window.__pyodide_api_url = API_BASE_URL;
        
        // Pass current dashboard global execution context state variables safely
        window.__pyodide_get_aoi = () => window.currentDashboardAOI || null;
        window.__pyodide_add_raster = (base64, aoi, name, meta) => {
            if (window.addRasterToMapGlobalHook) {
                window.addRasterToMapGlobalHook(base64, aoi, name, meta);
            }
        };

        // CRITICAL SECURITY FIX: Wrapped ALL js.window double-underscore access tokens in getattr()
        this.pyodide.runPython(`
            import js, json
            
            class CopernicusDashboardPlatform:
                def __init__(self):
                    pass
                
                def print_log(self, text):
                    logger = getattr(js.window, "__pyodide_logger")
                    logger(str(text))
                
                def get_active_aoi(self):
                    get_aoi_func = getattr(js.window, "__pyodide_get_aoi")
                    aoi_data = get_aoi_func()
                    if not aoi_data:
                        raise Exception("No active Area of Interest (AOI) loaded on the dashboard map view.")
                    return json.loads(json.dumps(aoi_data.to_py()))

                def search(self, collection, start_date, end_date, bands=["B04","B03","B02"], cloud_cover=20):
                    self.print_log(f"[Python Kernel] Requesting Search Engine for: {collection}...")
                    aoi = self.get_active_aoi()
                    
                    payload = {
                        "collection": collection,
                        "start_date": start_date,
                        "end_date": end_date,
                        "bands": bands,
                        "cloud_cover": int(cloud_cover),
                        "aoi": aoi
                    }
                    
                    # FIX: Using getattr bypasses Python compiler name-mangling on double-underscore tokens
                    base_url = getattr(js.window, "__pyodide_api_url")
                    
                    xhr = js.XMLHttpRequest.new()
                    xhr.open("POST", f"{base_url}/search", False)
                    xhr.setRequestHeader("Content-Type", "application/json")
                    xhr.send(json.dumps(payload))
                    
                    response_data = json.loads(xhr.responseText)
                    if "image" in response_data:
                        display_name = f"[Code] {collection} ({start_date})"
                        meta_payload = {
                            "type": "search",
                            "collection": collection,
                            "dates": [start_date, end_date],
                            "bands": bands
                        }
                        add_raster_func = getattr(js.window, "__pyodide_add_raster")
                        add_raster_func(response_data["image"], json.dumps(aoi), display_name, json.dumps(meta_payload))
                        self.print_log(f"[Python Kernel] Successfully search rendered layer: {display_name}")
                        return response_data
                    else:
                        raise Exception(f"Search Execution Failed: {xhr.responseText}")

                def calculate_spectral_index(self, name, expression, collection, start_date, end_date):
                    self.print_log(f"[Python Kernel] Instantiating Raster Calculation: {expression}...")
                    aoi = self.get_active_aoi()
                    
                    payload = {
                        "expression": expression,
                        "name": name,
                        "aoi": aoi,
                        "collection": collection,
                        "dates": [start_date, end_date]
                    }
                    
                    # FIX: Using getattr bypasses Python compiler name-mangling on double-underscore tokens
                    base_url = getattr(js.window, "__pyodide_api_url")
                    
                    xhr = js.XMLHttpRequest.new()
                    xhr.open("POST", f"{base_url}/calculate", False)
                    xhr.setRequestHeader("Content-Type", "application/json")
                    xhr.send(json.dumps(payload))
                    
                    response_data = json.loads(xhr.responseText)
                    if "image" in response_data:
                        meta_payload = {
                            "type": "calc",
                            "collection": collection,
                            "dates": [start_date, end_date],
                            "expression": expression,
                            "bands": ["Index"]
                        }
                        add_raster_func = getattr(js.window, "__pyodide_add_raster")
                        add_raster_func(response_data["image"], json.dumps(aoi), name, json.dumps(meta_payload))
                        self.print_log(f"[Python Kernel] Process Complete. Layer Loaded: {name}")
                        return response_data
                    else:
                        raise Exception(f"Index Processing Failed: {xhr.responseText}")

            # Instantiate platform instance
            platform = CopernicusDashboardPlatform()
        `);
    }

    async executePythonCode() {
        const runBtn = document.getElementById('run-code-btn');
        const code = this.editor.getValue();
        
        runBtn.disabled = true;
        runBtn.innerText = "⏳ Running Engine...";
        this.appendLog("\n--- [START EXECUTION PROTOCOL] ---");

        try {
            // Redirect Python standard output streams to our custom console panel logger
            this.pyodide.globals.set("print", (msg) => this.appendLog(`[STDOUT] ${msg}`));
            await this.pyodide.runPythonAsync(code);
            this.appendLog("--- [SUCCESSFUL EXECUTION TERMINATION] ---");
        } catch (err) {
            this.appendLog(`[RUNTIME EXCEPTION ENCOUNTERED]\n${err.message}`);
            this.appendLog("--- [FAILED EXECUTION TERMINATION] ---");
        } finally {
            runBtn.disabled = false;
            runBtn.innerText = "⚡ Run Python Script";
        }
    }

    getDefaultScript() {
        return `# Advanced Python Geospatial Code Engine Workspace
# The environment provides an initialized API controller object called 'platform'

try:
    print("Beginning automated workspace ingestion flow...")
    
    # 1. Execute Programmatic Dynamic Search Pipeline
    search_result = platform.search(
        collection="SENTINEL2_L2A",
        start_date="2023-01-01",
        end_date="2023-01-31",
        bands=["B08", "B04"],
        cloud_cover=20
    )
    
    # 2. Extract context parameters directly from operational payload
    print("Search complete. Transferring outputs directly into Raster Math Machine...")
    
    # 3. Calculate Custom Spectral Index (NDVI) via programmatic binding
    platform.calculate_spectral_index(
        name="Programmatic_NDVI",
        expression='("B08" - "B04") / ("B08" + "B04")',
        collection="SENTINEL2_L2A",
        start_date="2023-06-01",
        end_date="2023-06-30"
    )
    
    print("Pipeline sequence executed successfully without errors.")
except Exception as ex:
    print(f"Error caught inside runtime sequence: {ex}")
`;
    }
}
