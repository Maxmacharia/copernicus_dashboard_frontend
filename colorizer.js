export class ImageColorizer {
    constructor() {
        this.ramps = {
            // Perceptually Uniform - Excellent for general data (QGIS Default)
            'viridis': [
                [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], 
                [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 204, 102], 
                [180, 222, 44], [253, 231, 37]
            ],
            // High contrast for heatmaps and intensity
            'magma': [
                [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], 
                [182, 54, 121], [230, 81, 100], [251, 135, 97], [254, 194, 135], 
                [252, 253, 191]
            ],
            // Optimized for NDVI and Vegetation
            'rdylgn': [
                [165, 0, 38],    // Deep Red (Water/Urban)
                [215, 48, 39],   // Red
                [244, 109, 67],  // Orange
                [253, 174, 97],  // Peach
                [254, 224, 139], // Yellow
                [217, 239, 139], // Light Lime
                [166, 217, 106], // Greenish Yellow
                [102, 189, 99],  // Light Green
                [26, 152, 80],   // Green
                [0, 104, 55]     // Deep Forest Green (Dense Canopy)
            ],
            // Classic Terrain / Elevation style
            'terrain': [
                [0, 0, 255],     // Blue (Low/Water)
                [0, 255, 0],     // Green (Land)
                [255, 255, 0],   // Yellow (High Ground)
                [139, 69, 19],   // Brown (Mountain)
                [255, 255, 255]  // White (Snow/Peak)
            ],
            // Diverging Spectral (Great for anomaly detection)
            'spectral': [
                [94, 79, 162], [50, 136, 189], [102, 194, 165], [171, 221, 164],
                [230, 245, 152], [255, 255, 191], [254, 224, 139], [253, 174, 97],
                [244, 109, 67], [213, 62, 79], [158, 1, 66]
            ]
        };
    }

    async colorize(base64Str, rampName) {
        if (!rampName || rampName === 'gray' || !this.ramps[rampName]) {
            return base64Str; 
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                const palette = this.interpolateRamp(this.ramps[rampName]);

                for (let i = 0; i < data.length; i += 4) {
                    const gray = data[i]; 
                    const color = palette[gray];

                    if (color) {
                        data[i] = color[0];     
                        data[i + 1] = color[1]; 
                        data[i + 2] = color[2]; 
                    }
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
        });
    }

    interpolateRamp(rampNodes) {
        const fullPalette = new Array(256);
        const segments = rampNodes.length - 1;
        
        for (let i = 0; i < 256; i++) {
            const relPos = i / 255;
            const segment = Math.min(Math.floor(relPos * segments), segments - 1);
            
            // Calculate factor within the specific segment
            const segmentT = (relPos * segments) - segment;

            const start = rampNodes[segment];
            const end = rampNodes[segment + 1];

            fullPalette[i] = [
                Math.round(start[0] + (end[0] - start[0]) * segmentT),
                Math.round(start[1] + (end[1] - start[1]) * segmentT),
                Math.round(start[2] + (end[2] - start[2]) * segmentT)
            ];
        }
        return fullPalette;
    }
}
