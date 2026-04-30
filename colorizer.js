export class ImageColorizer {
    constructor() {
        this.ramps = {
            // Smooth perceptual color shift
            'viridis': [
                [68, 1, 84],    // Dark Purple (Low values)
                [49, 104, 142], // Blue
                [53, 183, 121], // Green
                [253, 231, 37]  // Yellow (High values)
            ],
            // Traditional Green-to-Red gradient for Vegetation
            'rdylgn': [
                [215, 25, 28],   // Red (Barren/Water)
                [253, 174, 97], // Orange
                [255, 255, 191],// Yellow
                [166, 217, 106],// Light Green
                [26, 150, 65]   // Dark Green (Dense vegetation)
            ],
            // High contrast fire-like gradient
            'magma': [
                [0, 0, 4],       // Black
                [182, 54, 121],  // Magenta
                [251, 136, 97],  // Orange
                [252, 253, 191]  // Yellow
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

                // 256 mapped indices derived from your ramps
                const palette = this.interpolateRamp(this.ramps[rampName]);

                for (let i = 0; i < data.length; i += 4) {
                    const gray = data[i]; // Read the greyscale pixel weight (0-255)
                    const color = palette[gray];

                    if (color) {
                        data[i] = color[0];     // Red
                        data[i + 1] = color[1]; // Green
                        data[i + 2] = color[2]; // Blue
                        // data[i+3] is Alpha (opacity), we leave it untouched
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
        const stepsPerSegment = 256 / segments;

        for (let i = 0; i < 256; i++) {
            const segment = Math.min(Math.floor(i / stepsPerSegment), segments - 1);
            const factor = (i - (segment * stepsPerSegment)) / stepsPerSegment;

            const start = rampNodes[segment];
            const end = rampNodes[segment + 1];

            fullPalette[i] = [
                Math.round(start[0] + (end[0] - start[0]) * factor),
                Math.round(start[1] + (end[1] - start[1]) * factor),
                Math.round(start[2] + (end[2] - start[2]) * factor)
            ];
        }
        return fullPalette;
    }
}
