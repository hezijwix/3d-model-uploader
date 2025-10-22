# 3D Model Viewer - Technical Guidelines

## Overview

This document provides comprehensive technical guidelines for building a 3D model viewer from scratch using Three.js. It covers the architecture, rendering pipeline, lighting systems, and all technical implementation details without referencing any specific UI framework or integration platform.

**Purpose**: Real-time 3D model visualization with professional-grade Image-Based Lighting (IBL), shadows, and customizable backgrounds.

**Target Audience**: Developers building similar 3D visualization tools who want to understand the core architecture and avoid common pitfalls.

---

## Table of Contents

1. [Core Architecture](#core-architecture)
2. [Canvas Setup & Initialization](#canvas-setup--initialization)
3. [Three.js Rendering Pipeline](#threejs-rendering-pipeline)
4. [HDRI Lighting System](#hdri-lighting-system)
5. [Sun Light Extraction](#sun-light-extraction)
6. [Background Rendering Architecture](#background-rendering-architecture)
7. [Model Loading & Processing](#model-loading--processing)
8. [Transform System](#transform-system)
9. [Animation System](#animation-system)
10. [High-Resolution Export](#high-resolution-export)
11. [Performance Optimization](#performance-optimization)
12. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

---

## Core Architecture

### System Overview

The tool uses a **dual-canvas architecture**:
- **Three.js Canvas** (foreground) - Renders 3D models with transparency
- **Background Canvas** (background) - Renders solid colors, gradients, or images

This separation enables:
- Independent background control without affecting 3D rendering
- Proper transparency handling for exports
- Better color accuracy (no tone mapping interference)

### Key Design Principles

1. **Scene.background = null** (ALWAYS)
   - Three.js canvas is fully transparent by default
   - Background is handled by a separate canvas layer

2. **HDRI for Lighting Only** (by default)
   - HDRI provides IBL (Image-Based Lighting) for realistic reflections
   - HDRI background visibility is optional and controlled separately

3. **World-Space Transforms**
   - All model rotations use world/global coordinate system
   - HDRI rotation is independent of model rotation
   - Prevents gimbal lock and maintains predictable behavior

4. **Canvas Resolution Independence**
   - Internal canvas resolution (1920x1080) ≠ display size
   - High-resolution exports scale from base resolution
   - Maintains aspect ratio and quality

---

## Canvas Setup & Initialization

### Critical Initialization Sequence

```javascript
// STEP 1: Pre-initialize canvas dimensions BEFORE Three.js
// This prevents browser default (150x300px) from being used
(function() {
    const canvas = document.getElementById('your-canvas-id');
    if (canvas) {
        canvas.width = 1920;   // Full HD width
        canvas.height = 1080;  // Full HD height
    }
})();
```

**Why This Matters:**
- Browser default canvas size is 150×300px
- Three.js uses canvas dimensions during initialization
- Setting dimensions early prevents low-resolution artifacts

### Canvas Dimensions Strategy

**Base Resolution**: 1920×1080 (Full HD)
- **Aspect Ratio**: 16:9 (standard for modern displays)
- **Export Scaling**: 1×, 2×, or 4× from base resolution
- **Display**: CSS scales canvas to fit container

**Key Properties:**
```javascript
canvas.width = 1920;           // Internal resolution
canvas.height = 1080;          // Internal resolution
canvas.style.width = '100%';   // Display size (CSS)
canvas.style.height = '100%';  // Display size (CSS)
```

---

## Three.js Rendering Pipeline

### Scene Setup

```javascript
setupScene() {
    this.scene = new THREE.Scene();

    // CRITICAL: Always null for dual-canvas architecture
    this.scene.background = null;

    // Three.js r162+ environment rotation support
    this.scene.environmentRotation = new THREE.Euler();
    this.scene.backgroundRotation = new THREE.Euler();

    // Model container for transforms
    this.modelContainer = new THREE.Group();
    this.scene.add(this.modelContainer);
}
```

### Camera Configuration

```javascript
setupCamera() {
    const aspect = this.canvas.width / this.canvas.height;

    this.camera = new THREE.PerspectiveCamera(
        45,      // FOV (field of view)
        aspect,  // Aspect ratio (16:9 = 1.777...)
        0.1,     // Near clipping plane
        1000     // Far clipping plane
    );

    // Position: Front view, centered
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
}
```

### Renderer Configuration

```javascript
setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,              // Smooth edges
        alpha: true,                  // Transparency support
        preserveDrawingBuffer: true   // REQUIRED for exports
    });

    // Use internal canvas dimensions
    this.renderer.setSize(
        this.canvas.width,
        this.canvas.height,
        false  // Don't update style
    );

    // Cap pixel ratio for performance
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Three.js r162+ color management
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;  // Default
    this.renderer.toneMappingExposure = 1.0;

    // Transparent by default
    this.renderer.setClearColor(0x000000, 0);

    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
```

**Critical Settings:**
- `preserveDrawingBuffer: true` - Without this, exports will be blank
- `alpha: true` - Enables transparency for dual-canvas architecture
- `outputColorSpace: THREE.SRGBColorSpace` - Proper color management (r162+)

---

## HDRI Lighting System

### HDRI Overview

**HDRI (High Dynamic Range Imaging)** provides:
- **IBL (Image-Based Lighting)**: Realistic reflections and ambient lighting
- **Environment Maps**: 360° spherical environment textures
- **Physical Accuracy**: Real-world lighting captured in HDR format

### HDRI Loading Pipeline

```javascript
loadHDRI(hdriUrl) {
    this.rgbeLoader.load(
        hdriUrl,
        (texture) => {
            // Step 1: Set equirectangular mapping
            texture.mapping = THREE.EquirectangularReflectionMapping;

            // Step 2: Store original texture for rotation
            this.originalHDRITexture = texture.clone();

            // Step 3: Generate PMREM environment map
            const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;

            // Step 4: Apply to scene lighting
            this.scene.environment = envMap;

            // Step 5: Optionally show as background
            if (this.hdriBackgroundVisible) {
                this.scene.background = envMap;
            }

            // Step 6: Extract sun position
            this.sunDirection = this.analyzeHDRIBrightestPoint(texture);
            this.updateSunLightPosition();
        }
    );
}
```

### PMREM Generator

**PMREM (Prefiltered Mipmapped Radiance Environment Map):**
- Converts equirectangular HDRI to cube map
- Pre-filters for different roughness levels
- Provides efficient IBL for PBR materials

```javascript
// Initialize PMREM generator
this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
this.pmremGenerator.compileEquirectangularShader();
```

### HDRI Rotation System

**Two Approaches:**

#### Approach 1: Environment Rotation (Fast, Recommended)
```javascript
// Three.js r162+ native support
const rotationRadians = degrees * Math.PI / 180;
this.scene.environmentRotation.set(0, rotationRadians, 0);
this.scene.backgroundRotation.set(0, rotationRadians, 0);
```

#### Approach 2: Regenerate PMREM (Slower, More Accurate)
```javascript
// Regenerate environment map with rotation
this.generateRotatedEnvironment(this.originalHDRITexture, rotationRadians);
```

**When to Use Each:**
- **Approach 1**: Real-time rotation sliders (fast, 60fps)
- **Approach 2**: Final quality renders (more accurate lighting)

### HDRI Intensity Control

```javascript
// Method 1: Material envMapIntensity (per-material)
material.envMapIntensity = 1.5;

// Method 2: Tone mapping exposure (global)
this.renderer.toneMappingExposure = 1.5;
```

**Best Practice:**
- Use `envMapIntensity` for individual material control
- Use `toneMappingExposure` when HDRI background is visible

---

## Sun Light Extraction

### The Problem

HDRI provides ambient lighting but lacks directional shadows. Professional 3D software (Cinema 4D, Redshift) solves this with **HDRI + Sun rigs**.

### Solution: Automatic Sun Extraction

**Concept**: Analyze HDRI to find brightest point (the sun), then position a directional light there.

### Implementation

#### Step 1: Analyze HDRI for Brightest Pixel

```javascript
analyzeHDRIBrightestPoint(texture) {
    // Sample HDRI at lower resolution for performance
    const sampleWidth = 512;
    const sampleHeight = 256;

    // Create temporary scene to render HDRI
    const tempScene = new THREE.Scene();
    const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Plane with HDRI texture
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false  // Preserve HDR values
    });
    const plane = new THREE.Mesh(geometry, material);
    tempScene.add(plane);

    // Render to float buffer
    const renderTarget = new THREE.WebGLRenderTarget(sampleWidth, sampleHeight, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat
    });

    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(tempScene, tempCamera);

    // Read pixel data
    const pixelBuffer = new Float32Array(sampleWidth * sampleHeight * 4);
    this.renderer.readRenderTargetPixels(
        renderTarget, 0, 0, sampleWidth, sampleHeight, pixelBuffer
    );

    this.renderer.setRenderTarget(null);

    // Find brightest pixel
    let maxLuminance = 0;
    let brightestU = 0.5;
    let brightestV = 0.5;

    for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
            const idx = (y * sampleWidth + x) * 4;
            const r = pixelBuffer[idx];
            const g = pixelBuffer[idx + 1];
            const b = pixelBuffer[idx + 2];

            // Rec. 709 luminance formula
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (luminance > maxLuminance) {
                maxLuminance = luminance;
                brightestU = x / sampleWidth;
                brightestV = 1.0 - (y / sampleHeight);  // Flip V
            }
        }
    }

    // Convert UV to 3D direction
    return this.equirectUVToDirection(brightestU, brightestV);
}
```

#### Step 2: Convert UV to 3D Direction

```javascript
equirectUVToDirection(u, v) {
    // Equirectangular UV to spherical coordinates
    const phi = (u - 0.5) * Math.PI * 2;    // Longitude
    const theta = (v - 0.5) * Math.PI;      // Latitude

    // Spherical to Cartesian
    const x = Math.cos(theta) * Math.sin(phi);
    const y = Math.sin(theta);
    const z = Math.cos(theta) * Math.cos(phi);

    return new THREE.Vector3(x, y, z).normalize();
}
```

#### Step 3: Position Directional Light

```javascript
setupSunLight() {
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sunLight.castShadow = true;

    // Shadow camera configuration
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 50;
    this.sunLight.shadow.camera.left = -10;
    this.sunLight.shadow.camera.right = 10;
    this.sunLight.shadow.camera.top = 10;
    this.sunLight.shadow.camera.bottom = -10;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.radius = 4;  // Soft shadows

    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
}

updateSunLightPosition() {
    if (!this.sunLight || !this.sunEnabled) return;

    // Apply HDRI rotation to sun direction
    const rotationRadians = this.hdriRotation * Math.PI / 180;
    const rotatedDirection = this.sunDirection.clone();
    rotatedDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationRadians);

    // Position far from origin
    const distance = 20;
    this.sunLight.position.copy(rotatedDirection.multiplyScalar(distance));
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = this.sunIntensity;
}
```

### Manual Calibration (Optional)

For better accuracy, manually calibrate sun positions:

```javascript
this.hdriSunPositions = {
    studio: {
        uv: [0.5379, 0.4930],  // Brightest point UV
        direction: [0.2363, -0.0217, 0.9714]  // 3D direction
    }
    // ... more presets
};
```

**Benefits:**
- More accurate than automatic detection
- Consistent across reloads
- Fine-tuned for specific HDRI characteristics

---

## Background Rendering Architecture

### Dual-Canvas System

**Architecture:**
```
+---------------------------+
|   Three.js Canvas         |  <- Foreground (3D model)
|   (alpha: true)           |     Transparent background
+---------------------------+
|   Background Canvas       |  <- Background layer
|   (solid/image/gradient)  |     z-index: -1
+---------------------------+
```

### Background Canvas Setup

```javascript
setupBackgroundCanvas() {
    // Create background canvas
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.width = this.canvas.width;
    this.backgroundCanvas.height = this.canvas.height;
    this.backgroundCanvas.style.position = 'absolute';
    this.backgroundCanvas.style.top = '0';
    this.backgroundCanvas.style.left = '0';
    this.backgroundCanvas.style.width = '100%';
    this.backgroundCanvas.style.height = '100%';
    this.backgroundCanvas.style.zIndex = '-1';
    this.backgroundCanvas.style.pointerEvents = 'none';

    this.backgroundCtx = this.backgroundCanvas.getContext('2d');

    // Insert before Three.js canvas
    this.canvas.parentNode.insertBefore(this.backgroundCanvas, this.canvas);
}
```

### Background Rendering Logic

```javascript
updateCanvasBackground() {
    // Priority order:
    // 1. HDRI background (if visible)
    // 2. Background image/color
    // 3. Transparent mode

    if (this.hdriBackgroundVisible && this.currentHDRI) {
        // Show HDRI in Three.js
        this.scene.background = this.currentHDRI;
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.hdriIntensity;

        // Clear background canvas
        this.clearBackgroundCanvas();
    } else {
        // Transparent Three.js + background canvas
        this.scene.background = null;
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.NoToneMapping;

        // Render background
        this.renderBackgroundLayer();
    }
}
```

### Background Types

#### 1. Solid Color
```javascript
renderSolidColor(color) {
    this.backgroundCtx.fillStyle = color;
    this.backgroundCtx.fillRect(0, 0,
        this.backgroundCanvas.width,
        this.backgroundCanvas.height
    );
}
```

#### 2. Transparent (Checkered Pattern via CSS)
```javascript
// Three.js transparent
this.renderer.setClearColor(0x000000, 0);

// Background canvas transparent
this.backgroundCtx.clearRect(0, 0,
    this.backgroundCanvas.width,
    this.backgroundCanvas.height
);
```

#### 3. Background Image
```javascript
renderBackgroundImage(image, fit = 'cover') {
    const canvasAspect = this.backgroundCanvas.width / this.backgroundCanvas.height;
    const imageAspect = image.width / image.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (fit === 'cover') {
        // Cover entire canvas
        if (canvasAspect > imageAspect) {
            drawWidth = this.backgroundCanvas.width;
            drawHeight = drawWidth / imageAspect;
            offsetX = 0;
            offsetY = (this.backgroundCanvas.height - drawHeight) / 2;
        } else {
            drawHeight = this.backgroundCanvas.height;
            drawWidth = drawHeight * imageAspect;
            offsetX = (this.backgroundCanvas.width - drawWidth) / 2;
            offsetY = 0;
        }
    } else if (fit === 'contain') {
        // Fit within canvas
        if (canvasAspect > imageAspect) {
            drawHeight = this.backgroundCanvas.height;
            drawWidth = drawHeight * imageAspect;
            offsetX = (this.backgroundCanvas.width - drawWidth) / 2;
            offsetY = 0;
        } else {
            drawWidth = this.backgroundCanvas.width;
            drawHeight = drawWidth / imageAspect;
            offsetX = 0;
            offsetY = (this.backgroundCanvas.height - drawHeight) / 2;
        }
    } else {
        // Stretch
        drawWidth = this.backgroundCanvas.width;
        drawHeight = this.backgroundCanvas.height;
        offsetX = 0;
        offsetY = 0;
    }

    this.backgroundCtx.drawImage(
        image,
        offsetX, offsetY,
        drawWidth, drawHeight
    );
}
```

### Why Dual-Canvas?

**Problem with Single Canvas:**
- Three.js tone mapping affects background colors
- HDRI background interferes with solid colors
- Transparency is harder to manage

**Solution with Dual Canvas:**
- Three.js renders 3D model with transparency
- Background canvas renders accurate colors
- Complete independence between layers

---

## Model Loading & Processing

### Supported Formats

1. **GLTF/GLB** (Recommended)
   - Industry standard for web 3D
   - Supports PBR materials, animations, textures
   - Efficient binary format (GLB)

2. **FBX**
   - Common in 3D software (Maya, Blender, 3ds Max)
   - Legacy format, larger file sizes
   - Good material support

### Loading Pipeline

```javascript
loadModel(file) {
    const fileName = file.name.toLowerCase();
    const fileURL = URL.createObjectURL(file);

    if (fileName.endsWith('.glb') || fileName.endsWith('.gltf')) {
        this.loadGLTF(fileURL);
    } else if (fileName.endsWith('.fbx')) {
        this.loadFBX(fileURL);
    }
}

loadGLTF(url) {
    this.gltfLoader.load(
        url,
        (gltf) => {
            this.currentModel = gltf.scene;
            this.processLoadedModel();
        },
        (progress) => {
            const percent = (progress.loaded / progress.total * 100).toFixed(0);
            console.log(`Loading: ${percent}%`);
        },
        (error) => {
            console.error('Error loading GLTF:', error);
        }
    );
}
```

### Model Processing

```javascript
processLoadedModel() {
    if (!this.currentModel) return;

    // Step 1: Add to container
    this.modelContainer.add(this.currentModel);

    // Step 2: Center model
    this.centerModel();

    // Step 3: Auto-scale to fit
    this.autoScaleModel();

    // Step 4: Enable shadows
    this.enableModelShadows();

    // Step 5: Apply environment map
    this.applyEnvironmentToModel();
}
```

#### Auto-Centering

```javascript
centerModel() {
    if (!this.currentModel) return;

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());

    // Center at origin
    this.currentModel.position.x = -center.x;
    this.currentModel.position.y = -center.y;
    this.currentModel.position.z = -center.z;
}
```

#### Auto-Scaling

```javascript
autoScaleModel() {
    if (!this.currentModel) return;

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(this.currentModel);
    const size = box.getSize(new THREE.Vector3());

    // Find max dimension
    const maxDim = Math.max(size.x, size.y, size.z);

    // Scale to fit in view (target ~2 units)
    const targetSize = 2;
    const scale = targetSize / maxDim;

    this.modelContainer.scale.setScalar(scale);
}
```

#### Enable Shadows

```javascript
enableModelShadows() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;      // Cast shadows
            child.receiveShadow = true;   // Self-shadowing
        }
    });
}
```

#### Apply Environment Map

```javascript
applyEnvironmentToModel() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];

            materials.forEach(mat => {
                // DO NOT set mat.envMap directly!
                // Use scene.environment instead
                mat.envMapIntensity = this.hdriIntensity;
                mat.needsUpdate = true;
            });
        }
    });
}
```

**Critical Note:**
- **DON'T** set `material.envMap` directly
- **DO** set `scene.environment` instead
- This ensures `environmentRotation` works correctly

---

## Transform System

### World-Space Rotation Architecture

**Problem**: Object-space rotation causes gimbal lock and unpredictable behavior.

**Solution**: Always rotate around world axes.

```javascript
updateModelRotation(rotX, rotY, rotZ) {
    // Convert degrees to radians
    const radX = rotX * Math.PI / 180;
    const radY = rotY * Math.PI / 180;
    const radZ = rotZ * Math.PI / 180;

    // Build rotation matrix from world axes
    const rotMatrix = new THREE.Matrix4();
    const matX = new THREE.Matrix4().makeRotationX(radX);
    const matY = new THREE.Matrix4().makeRotationY(radY);
    const matZ = new THREE.Matrix4().makeRotationZ(radZ);

    // Apply in order: Y (yaw) → X (pitch) → Z (roll)
    rotMatrix.multiply(matY).multiply(matX).multiply(matZ);

    // Extract rotation from matrix
    this.modelContainer.rotation.setFromRotationMatrix(rotMatrix);
}
```

### Transform Hierarchy

```
Scene
└── modelContainer (Group)
    ├── position: World-space translation
    ├── rotation: World-space rotation (via matrix)
    └── scale: Uniform scaling
        └── currentModel (loaded 3D model)
            ├── position: Local centering offset
            └── children: Model hierarchy
```

**Why This Works:**
- `modelContainer` handles user transforms (position, rotation, scale)
- `currentModel` stays centered at origin within container
- Rotation matrix ensures world-space behavior
- No gimbal lock, predictable results

---

## Animation System

### Turntable Animation

**Concept**: Continuous Y-axis rotation (like a product display).

```javascript
animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    // Turntable rotation
    if (this.turntableEnabled && this.currentModel) {
        // Rotate around world Y-axis
        this.modelContainer.rotateOnWorldAxis(
            new THREE.Vector3(0, 1, 0),
            0.01 * this.turntableSpeed
        );
    }

    this.render();
}

render() {
    // Render background (if not using HDRI)
    if (!this.hdriBackgroundVisible) {
        this.renderBackgroundLayer();
    }

    // Render Three.js scene
    this.renderer.render(this.scene, this.camera);
}
```

**Performance Considerations:**
- Use `requestAnimationFrame` for smooth 60fps
- Avoid heavy computations in render loop
- Render background only when needed

---

## High-Resolution Export

### Export Architecture

**Challenge**: Canvas displays at CSS size but exports at internal resolution.

**Solution**: Render at higher resolution, then composite layers.

### Export Function

```javascript
window.renderHighResolution = function(targetCanvas, scale) {
    if (!viewer || !viewer.renderer) return;

    const originalWidth = viewer.canvas.width;
    const originalHeight = viewer.canvas.height;

    // Calculate scaled dimensions
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;

    // Setup target canvas
    const ctx = targetCanvas.getContext('2d');
    targetCanvas.width = scaledWidth;
    targetCanvas.height = scaledHeight;
    ctx.save();
    ctx.scale(scale, scale);

    // STEP 1: Draw background FIRST
    if (!viewer.hdriBackgroundVisible) {
        // Draw background at base resolution
        viewer.renderBackgroundLayer();
        ctx.drawImage(
            viewer.backgroundCanvas,
            0, 0,
            originalWidth, originalHeight
        );
    }

    ctx.restore();

    // STEP 2: Render Three.js at high resolution
    viewer.renderer.setSize(scaledWidth, scaledHeight, false);
    viewer.renderer.render(viewer.scene, viewer.camera);

    // STEP 3: Composite Three.js on top
    ctx.drawImage(viewer.canvas, 0, 0, scaledWidth, scaledHeight);

    // Restore original size
    viewer.renderer.setSize(originalWidth, originalHeight, false);
};
```

### Export Scales

- **1×**: 1920×1080 (Full HD)
- **2×**: 3840×2160 (4K)
- **4×**: 7680×4320 (8K)

### Export Checklist

✅ Background renders FIRST
✅ Three.js renders at scaled resolution
✅ Layers are composited correctly
✅ Original canvas size is restored
✅ `preserveDrawingBuffer: true` is set

---

## Performance Optimization

### 1. HDRI Rotation Debouncing

**Problem**: Regenerating PMREM on every slider input is expensive.

**Solution**: Debounce regeneration.

```javascript
document.getElementById('hdri-rotation').addEventListener('input', (e) => {
    this.hdriRotation = parseFloat(e.target.value);

    // Update preview immediately (fast)
    this.updateHDRISettings(false);

    // Clear existing timer
    if (this.hdriRotationTimer) {
        clearTimeout(this.hdriRotationTimer);
    }

    // Regenerate after 300ms of no input
    this.hdriRotationTimer = setTimeout(() => {
        this.updateHDRISettings(true);  // Force regenerate
    }, 300);
});
```

### 2. Shadow Map Resolution

**Tradeoff**: Quality vs. Performance

```javascript
shadowQuality = 2048;  // Medium (default)
// 1024: Low (fast, blocky shadows)
// 2048: Medium (balanced)
// 4096: High (sharp, slower)
```

### 3. Pixel Ratio Capping

```javascript
// Cap at 2× to prevent excessive GPU load
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

### 4. Model Complexity

**Best Practices:**
- Optimize models before importing (reduce polygons)
- Use LOD (Level of Detail) for large scenes
- Limit texture resolution (2K max for web)

---

## Common Pitfalls & Solutions

### 1. Black Canvas on Load

**Symptom**: Canvas appears black until user interacts.

**Cause**: Background not rendered on initial load.

**Solution**: Call `updateCanvasBackground()` after initialization.

```javascript
// After setting up background system
this.updateCanvasBackground();  // Force initial render
```

### 2. Blank Exports

**Symptom**: Exported images are blank/white.

**Cause**: `preserveDrawingBuffer: false`

**Solution**: Enable in renderer config.

```javascript
this.renderer = new THREE.WebGLRenderer({
    preserveDrawingBuffer: true  // REQUIRED
});
```

### 3. HDRI Rotation Doesn't Affect Lighting

**Symptom**: HDRI rotates but lighting stays static.

**Cause**: Using old `camera.rotation` approach or not regenerating env.

**Solution**: Use `scene.environmentRotation` (r162+) OR regenerate PMREM.

```javascript
// Modern approach (fast)
this.scene.environmentRotation.set(0, rotationRadians, 0);

// Legacy approach (slower but more accurate)
this.generateRotatedEnvironment(texture, rotationRadians);
```

### 4. Wrong Colors in Background

**Symptom**: Background colors look washed out or wrong.

**Cause**: Three.js tone mapping affects background.

**Solution**: Use dual-canvas architecture.

```javascript
// Three.js: transparent + no tone mapping
this.scene.background = null;
this.renderer.toneMapping = THREE.NoToneMapping;

// Background canvas: accurate colors
this.renderBackgroundLayer();
```

### 5. Model Too Small/Large

**Symptom**: Model doesn't fit in view.

**Cause**: Inconsistent scales across 3D software.

**Solution**: Auto-scale based on bounding box.

```javascript
this.autoScaleModel();  // Scales to target size
```

### 6. Gimbal Lock in Rotations

**Symptom**: Rotations become unpredictable at certain angles.

**Cause**: Object-space rotation (cumulative Euler angles).

**Solution**: Use world-space rotation matrices.

```javascript
// Build rotation from world axes
const rotMatrix = new THREE.Matrix4();
rotMatrix.multiply(rotY).multiply(rotX).multiply(rotZ);
this.modelContainer.rotation.setFromRotationMatrix(rotMatrix);
```

### 7. Sun Light Not Following HDRI Rotation

**Symptom**: Sun position doesn't update when rotating HDRI.

**Cause**: Sun direction not being rotated.

**Solution**: Apply HDRI rotation to sun direction.

```javascript
updateSunLightPosition() {
    const rotationRadians = this.hdriRotation * Math.PI / 180;
    const rotatedDirection = this.sunDirection.clone();
    rotatedDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationRadians);

    this.sunLight.position.copy(rotatedDirection.multiplyScalar(20));
}
```

### 8. Canvas Resize Issues

**Symptom**: Canvas doesn't resize properly or loses quality.

**Cause**: Not updating camera aspect ratio or renderer size.

**Solution**: Update all components on resize.

```javascript
onCanvasResized() {
    // Update canvas dimensions
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;

    // Update camera
    this.camera.aspect = newWidth / newHeight;
    this.camera.updateProjectionMatrix();

    // Update renderer
    this.renderer.setSize(newWidth, newHeight, false);

    // Update background canvas
    this.backgroundCanvas.width = newWidth;
    this.backgroundCanvas.height = newHeight;

    // Redraw background
    this.updateCanvasBackground();
}
```

---

## Technical Specifications Summary

### Dependencies
- **Three.js**: r162+ (for `environmentRotation` support)
- **GLTFLoader**: For GLB/GLTF models
- **FBXLoader**: For FBX models
- **RGBELoader**: For HDR images

### Performance Targets
- **Frame Rate**: 60 FPS (smooth animation)
- **HDRI Resolution**: 2K (balance quality/performance)
- **Shadow Quality**: 2048×2048 (default)
- **Export Time**: <2s for 4K export

### Browser Compatibility
- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **WebGL**: WebGL 2.0 required
- **File API**: For model/image uploads
- **Canvas API**: For background rendering

### File Size Limits (Recommended)
- **3D Models**: <50MB (GLB), <100MB (FBX)
- **HDRI Images**: 2-8MB (2K HDR)
- **Background Images**: <5MB (PNG/JPG)

---

## Conclusion

This tool demonstrates a professional-grade 3D viewer architecture with:
- ✅ Dual-canvas rendering for accurate colors
- ✅ Advanced HDRI lighting with sun extraction
- ✅ World-space transforms without gimbal lock
- ✅ High-resolution exports with proper compositing
- ✅ Optimized performance with debouncing
- ✅ Production-ready error handling

**Key Takeaways:**
1. **Separation of Concerns**: Three.js handles 3D, canvas handles background
2. **World-Space Transforms**: Prevents gimbal lock, predictable behavior
3. **HDRI + Sun Rig**: Professional lighting system
4. **Proper Initialization**: Canvas dimensions, PMREM, event sequence
5. **Export Architecture**: Multi-layer compositing at scale

Use these guidelines to build robust 3D visualization tools or debug existing implementations.

---

## Further Reading

- [Three.js Documentation](https://threejs.org/docs/)
- [HDRI Haven](https://polyhaven.com/hdris) - Free HDR images
- [glTF 2.0 Specification](https://www.khronos.org/gltf/)
- [PBR Material Guide](https://learnopengl.com/PBR/Theory)
- [Canvas API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
