# HDRI + Sun Rig Implementation

**Cinema 4D/Redshift-Style Automatic Sun Light with Self-Shadowing**

## Overview

This implementation adds a professional HDRI + Sun rig system to the 3D Model Uploader, mimicking the behavior of Cinema 4D and Redshift render engines. It automatically extracts the sun direction from the brightest point in the HDRI environment and creates a directional light with realistic self-shadowing.

## Key Features

✅ **Automatic Sun Extraction** - Analyzes HDRI texture to find brightest point (sun position)
✅ **Realistic Self-Shadowing** - Models cast and receive shadows on themselves
✅ **HDRI Rotation Sync** - Sun light follows HDRI rotation accurately
✅ **Professional Quality** - PCFSoftShadowMap for smooth shadow edges
✅ **User Controls** - Adjustable sun intensity and shadow quality
✅ **Performance Optimized** - Efficient shadow rendering with quality options

## Technical Implementation

### 1. HDRI Brightest Point Detection

**Location:** [js/main.js:221-300](js/main.js#L221-L300)

The `analyzeHDRIBrightestPoint(texture)` method:

1. Creates a temporary render target with FloatType to preserve HDR values
2. Renders the HDRI texture at 512x256 resolution for analysis
3. Reads pixel data using `readRenderTargetPixels()`
4. Calculates luminance for each pixel using Rec. 709 formula:
   ```javascript
   luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B
   ```
5. Finds the pixel with maximum luminance
6. Converts UV coordinates to 3D direction vector

**Key Code:**
```javascript
// Calculate luminance (Rec. 709)
const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

if (luminance > maxLuminance) {
    maxLuminance = luminance;
    brightestU = x / sampleWidth;
    brightestV = 1.0 - (y / sampleHeight); // Flip V coordinate
}
```

### 2. Equirectangular to 3D Direction Conversion

**Location:** [js/main.js:308-319](js/main.js#L308-L319)

The `equirectUVToDirection(u, v)` method converts 2D equirectangular coordinates to a 3D direction vector:

```javascript
// Convert UV to spherical coordinates
const phi = (u - 0.5) * Math.PI * 2;   // Longitude: -π to π
const theta = (v - 0.5) * Math.PI;      // Latitude: -π/2 to π/2

// Convert spherical to Cartesian coordinates
const x = Math.cos(theta) * Math.sin(phi);
const y = Math.sin(theta);
const z = Math.cos(theta) * Math.cos(phi);

return new THREE.Vector3(x, y, z).normalize();
```

### 3. DirectionalLight Sun System

**Location:** [js/main.js:166-195](js/main.js#L166-L195)

The sun light is configured with:

- **Shadow Map:** 2048x2048 (default, configurable 1024-4096)
- **Shadow Type:** PCFSoftShadowMap for smooth edges
- **Shadow Camera:** Orthographic with appropriate frustum
- **Shadow Bias:** -0.0001 to prevent shadow acne
- **Shadow Radius:** 4 for soft shadow edges

**Key Configuration:**
```javascript
this.sunLight = new THREE.DirectionalLight(0xffffff, this.sunIntensity);
this.sunLight.castShadow = true;

this.sunLight.shadow.mapSize.width = 2048;
this.sunLight.shadow.mapSize.height = 2048;
this.sunLight.shadow.camera.near = 0.1;
this.sunLight.shadow.camera.far = 50;
this.sunLight.shadow.camera.left = -10;
this.sunLight.shadow.camera.right = 10;
this.sunLight.shadow.camera.top = 10;
this.sunLight.shadow.camera.bottom = -10;
this.sunLight.shadow.bias = -0.0001;
this.sunLight.shadow.radius = 4;
```

### 4. HDRI Rotation Synchronization

**Location:** [js/main.js:324-347](js/main.js#L324-L347)

The `updateSunLightPosition()` method:

1. Takes the detected sun direction vector
2. Applies HDRI rotation as Y-axis rotation
3. Positions the light far from origin (20 units)
4. Always points at scene center (0, 0, 0)
5. Updates intensity and visibility

**Key Code:**
```javascript
// Apply HDRI rotation to sun direction
const rotationRadians = this.hdriRotation * Math.PI / 180;
const rotatedDirection = this.sunDirection.clone();
rotatedDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationRadians);

// Position sun light far from origin
const distance = 20;
this.sunLight.position.copy(rotatedDirection.multiplyScalar(distance));
this.sunLight.target.position.set(0, 0, 0);
```

### 5. Self-Shadowing Implementation

**Location:** [js/main.js:586-599](js/main.js#L586-L599)

The `enableModelShadows()` method enables shadow casting and receiving on all meshes:

```javascript
this.currentModel.traverse((child) => {
    if (child.isMesh) {
        child.castShadow = true;    // Model casts shadows
        child.receiveShadow = true; // Model receives shadows (self-shadowing)
    }
});
```

## User Controls

**Location:** [index.html:156-177](index.html#L156-L177)

### Enable Sun Light
- **Type:** Checkbox
- **Default:** Checked (enabled)
- **Description:** Toggle sun light on/off while keeping IBL active

### Sun Intensity
- **Type:** Range slider
- **Range:** 0 - 5
- **Default:** 2.0
- **Description:** Controls the brightness of the directional sun light

### Shadow Quality
- **Type:** Dropdown select
- **Options:**
  - Low: 1024x1024
  - Medium: 2048x2048 (default)
  - High: 4096x4096
- **Description:** Shadow map resolution (higher = sharper shadows, more GPU memory)

## Performance Considerations

### Shadow Map Resolution

| Quality | Resolution | GPU Memory | Use Case |
|---------|-----------|------------|----------|
| Low | 1024x1024 | ~4 MB | Quick previews, mobile devices |
| Medium | 2048x2048 | ~16 MB | Default, balanced quality/performance |
| High | 4096x4096 | ~64 MB | Final renders, high-detail models |

### Optimization Techniques

1. **Efficient HDRI Analysis**
   - Samples at reduced resolution (512x256)
   - Uses FloatType render target for accurate HDR values
   - Disposes temporary resources immediately

2. **Shadow Camera Frustum**
   - Configured to fit typical model bounds (-10 to 10)
   - Can be adjusted based on model size
   - Tight frustum = sharper, more efficient shadows

3. **Debounced HDRI Rotation**
   - Sun position updates immediately
   - Environment regeneration delayed 300ms
   - Prevents excessive render target creation

## How It Works: Step-by-Step

1. **HDRI Loading** (`loadHDRI()`)
   - User selects HDRI preset or rotation changes
   - HDRI texture loaded via RGBELoader
   - Texture analyzed to find brightest point

2. **Sun Direction Extraction** (`analyzeHDRIBrightestPoint()`)
   - HDRI rendered to temporary FloatType render target
   - Pixel data read and luminance calculated
   - Brightest UV coordinates converted to 3D direction

3. **Sun Light Positioning** (`updateSunLightPosition()`)
   - Sun direction rotated to match HDRI rotation
   - DirectionalLight positioned along sun direction
   - Intensity and visibility updated

4. **Model Shadow Setup** (`enableModelShadows()`)
   - When model loads, traverse all meshes
   - Enable both castShadow and receiveShadow
   - Enables realistic self-shadowing

5. **Rendering** (`render()`)
   - Renderer shadow map enabled with PCFSoftShadowMap
   - Scene rendered with IBL (environment) + Sun (directional)
   - Shadows composited in real-time

## Comparison to Cinema 4D/Redshift

### Similarities

✅ Automatic sun extraction from HDRI brightest point
✅ Directional light follows environment rotation
✅ Soft shadow edges (PCFSoft ≈ Redshift soft shadows)
✅ User-adjustable sun intensity
✅ Shadows work with IBL environment lighting

### Differences

⚠️ **Shadow Samples:** Three.js uses PCFSoft (fixed samples), Redshift uses ray-traced adaptive sampling
⚠️ **Shadow Softness:** Redshift has light size parameter for physically accurate soft shadows
⚠️ **Multiple Suns:** Professional renderers can extract multiple bright points
⚠️ **Caustics:** Redshift supports caustics, Three.js does not

## Browser Console Output

When HDRI is loaded, you'll see:

```
🔍 Analyzing HDRI for brightest point (sun extraction)...
  ✓ Brightest point found: UV(0.752, 0.643), Luminance: 125.43
  ✓ Sun direction: (0.342, 0.456, -0.821)
✅ HDRI fully loaded: sunset (2K quality) with sun extraction
  ✓ Sun light updated: position(6.84, 9.12, -16.42)
```

This confirms:
- HDRI analysis completed successfully
- Sun direction calculated from brightest point
- Sun light positioned correctly in 3D space

## Troubleshooting

### Shadows Not Visible

**Check:**
1. Sun light enabled (checkbox checked)
2. Model loaded and processed
3. Shadow quality not set too low
4. Browser supports WebGL shadow mapping

**Solution:**
```javascript
// Verify in console:
viewer.sunLight.castShadow // should be true
viewer.renderer.shadowMap.enabled // should be true
```

### Shadows Too Soft/Hard

**Adjust:**
- Shadow radius in `setupLights()` (default: 4)
- Shadow quality (higher = sharper)

**Code:**
```javascript
this.sunLight.shadow.radius = 2; // Sharper
this.sunLight.shadow.radius = 8; // Softer
```

### Sun Position Incorrect

**Verify:**
- HDRI loaded successfully
- brightest point UV coordinates logged
- Sun direction vector calculated

**Debug:**
```javascript
console.log('Sun direction:', viewer.sunDirection);
console.log('HDRI rotation:', viewer.hdriRotation);
console.log('Sun position:', viewer.sunLight.position);
```

### Performance Issues

**Optimize:**
1. Reduce shadow quality to Low (1024x1024)
2. Check GPU memory usage
3. Simplify model geometry if possible

## Future Enhancements

Potential improvements for future versions:

1. **Adaptive Shadow Camera**
   - Auto-fit shadow frustum to model bounds
   - Reduce shadow waste, improve quality

2. **Multiple Sun Extraction**
   - Find top 3 brightest points
   - Create multiple directional lights
   - Blend shadows for complex HDRIs

3. **Sun Size Parameter**
   - Adjust shadow softness based on light size
   - More physically accurate soft shadows

4. **Ground Plane Shadows**
   - Optional infinite ground plane
   - Receive shadows from model
   - Toggleable for clean renders

5. **Shadow Catcher Material**
   - Invisible surface that only shows shadows
   - Useful for compositing into photos

## Files Modified

1. **[js/main.js](js/main.js)**
   - Added sun light system properties (lines 57-62)
   - Enabled shadow rendering (lines 156-157)
   - Created sun light setup (lines 166-195)
   - Added HDRI analysis methods (lines 217-347)
   - Integrated sun extraction into HDRI loading (lines 373-380)
   - Added HDRI rotation sync (line 482)
   - Created shadow enable method (lines 586-599)
   - Added sun control event listeners (lines 792-818)

2. **[index.html](index.html)**
   - Added sun light UI controls (lines 154-177)
   - Sun enable checkbox
   - Sun intensity slider
   - Shadow quality dropdown

## Conclusion

This implementation brings professional-grade HDRI + Sun rig functionality to the web-based 3D model viewer, matching the workflow of industry-standard tools like Cinema 4D and Redshift. The automatic sun extraction, realistic self-shadowing, and rotation synchronization provide a polished, cinematic look to 3D renders directly in the browser.

**Key Benefits:**
- ✅ Automatic, no manual sun positioning needed
- ✅ Realistic lighting with IBL + directional sun
- ✅ Smooth self-shadowing for depth and dimension
- ✅ User-friendly controls for fine-tuning
- ✅ Performance-optimized for real-time interaction

**Test it now:** Open [http://localhost:8000](http://localhost:8000) and upload a 3D model to see the HDRI + Sun rig in action!
