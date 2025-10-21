/* 
 * 3D Model Uploader - Main Logic
 * Author: Your Name
 * 
 * Three.js-based 3D model viewer with IBL lighting, turntable animation,
 * and high-quality rendering for GLB, GLTF, and FBX formats.
 */

// ========== CANVAS INITIALIZATION ==========
// CRITICAL: Set canvas dimensions BEFORE Chatooly CDN initializes
// This prevents the canvas from defaulting to 150x300px (browser default)
(function() {
    const canvas = document.getElementById('chatooly-canvas');
    if (canvas) {
        canvas.width = 1920;   // HD resolution width (1920x1080)
        canvas.height = 1080;  // HD resolution height
        console.log('✅ Canvas pre-initialized to Full HD: 1920x1080 (before Chatooly CDN)');
    } else {
        console.warn('⚠️ Canvas not found during pre-initialization. It will be initialized later.');
    }
})();

class ModelViewer {
    constructor() {
        // Canvas and rendering
        this.canvas = document.getElementById('chatooly-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Model and transforms
        this.currentModel = null;
        this.modelContainer = null; // Container for transforms
        
        // Animation
        this.turntableEnabled = false;
        this.turntableSpeed = 1.0;
        this.animationFrameId = null;
        
        // Background image tracking
        this.hasBackgroundImage = false;
        this.backgroundTexture = null;

        // HDRI environment
        this.pmremGenerator = null;
        this.currentHDRI = null;
        this.hdriIntensity = 1.0;
        this.hdriRotation = 0;
        this.hdriBackgroundVisible = false; // Off by default

        // Store original HDRI texture for proper rotation with lighting
        this.originalHDRITexture = null;

        // Debounce timer for performance
        this.hdriRotationTimer = null;

        // Sun light system (HDRI + Sun rig like C4D/Redshift)
        this.sunLight = null;
        this.sunDirection = new THREE.Vector3(0, 1, 0); // Default: top-down
        this.sunIntensity = 2.0;
        this.sunEnabled = true;
        this.shadowQuality = 2048; // Shadow map resolution
        
        // HDRI presets (Premium quality from Poly Haven - 2K resolution for better quality)
        this.hdriPresets = {
            studio: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/photo_studio_loft_hall_2k.hdr',
            sunset: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/venice_sunset_2k.hdr',
            outdoor: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr',
            warehouse: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/industrial_sunset_puresky_2k.hdr',
            night: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/moonlit_golf_2k.hdr',
            autumn: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/autumn_crossing_2k.hdr',
            urban: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/urban_alley_01_2k.hdr'
        };
        
        // Loaders
        this.gltfLoader = null;
        this.fbxLoader = null;
        this.rgbeLoader = null;
        this.textureLoader = null;
        
        this.init();
    }
    
    init() {
        this.setupCanvasDimensions();
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupLoaders();
        this.loadDefaultHDRI();
        this.setupEventListeners();
        this.animate();

        console.log('3D Model Viewer initialized');
    }

    setupCanvasDimensions() {
        // Set canvas to Full HD (1920x1080) by default for high quality
        this.canvas.width = 1920;
        this.canvas.height = 1080;
        console.log('Canvas dimensions set to Full HD: 1920x1080');
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent by default
        
        // Initialize rotation properties for HDRI (Three.js r162+ compatibility)
        this.scene.environmentRotation = new THREE.Euler();
        this.scene.backgroundRotation = new THREE.Euler();
        
        // Create model container for transforms
        this.modelContainer = new THREE.Group();
        this.scene.add(this.modelContainer);
    }
    
    setupCamera() {
        // Fixed front perspective camera
        // Use canvas internal dimensions, not CSS dimensions
        const width = this.canvas.width || 1920;
        const height = this.canvas.height || 1080;
        const aspect = width / height;
        
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, 5); // Front view
        this.camera.lookAt(0, 0, 0);
        
        console.log(`Camera initialized: ${width}x${height}, aspect: ${aspect.toFixed(2)}`);
    }
    
    setupRenderer() {
        // CRITICAL: preserveDrawingBuffer for exports
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true, // Transparent background support
            preserveDrawingBuffer: true // Required for exports
        });
        
        // Use canvas internal dimensions
        const width = this.canvas.width || 1920;
        const height = this.canvas.height || 1080;
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
        
        // Improved GPU optimization settings for better IBL (r162+ uses outputColorSpace)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Updated from outputEncoding
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2; // Slightly brighter for better visibility
        
        // Note: physicallyCorrectLights is deprecated in r162+, now enabled by default
        // this.renderer.physicallyCorrectLights = true;
        
        // Enable shadows for HDRI + Sun rig system
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
        
        // Setup PMREMGenerator for high-quality IBL
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        
        console.log(`Renderer initialized: ${width}x${height} with improved IBL settings`);
    }
    
    setupLights() {
        // Ambient light as fallback (reduced since we have IBL + Sun)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);

        // Sun light (HDRI-based directional light with shadows)
        this.sunLight = new THREE.DirectionalLight(0xffffff, this.sunIntensity);
        this.sunLight.castShadow = true;

        // Configure shadow camera for directional light
        this.sunLight.shadow.mapSize.width = this.shadowQuality;
        this.sunLight.shadow.mapSize.height = this.shadowQuality;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 50;
        this.sunLight.shadow.camera.left = -10;
        this.sunLight.shadow.camera.right = 10;
        this.sunLight.shadow.camera.top = 10;
        this.sunLight.shadow.camera.bottom = -10;
        this.sunLight.shadow.bias = -0.0001; // Prevent shadow acne
        this.sunLight.shadow.radius = 4; // Soft shadow edges

        // Position sun light (will be updated when HDRI is analyzed)
        this.sunLight.position.set(5, 10, 5);
        this.sunLight.target.position.set(0, 0, 0);

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);

        console.log('✅ Sun light system initialized with shadows');
    }
    
    setupLoaders() {
        // GLTF/GLB Loader (r162+ uses window.GLTFLoader)
        this.gltfLoader = new window.GLTFLoader();

        // FBX Loader (r162+ uses window.FBXLoader)
        this.fbxLoader = new window.FBXLoader();

        // RGBE Loader for HDR images (r162+ uses window.RGBELoader)
        this.rgbeLoader = new window.RGBELoader();
        // Use HalfFloatType for better performance with HDR in r162+
        this.rgbeLoader.setDataType(THREE.HalfFloatType);

        // Texture Loader for background images
        this.textureLoader = new THREE.TextureLoader();
    }
    
    loadDefaultHDRI() {
        this.loadHDRI('studio');
    }

    /**
     * Analyze HDRI texture to find brightest point (sun position)
     * This mimics Cinema 4D/Redshift HDRI + Sun rig behavior
     */
    analyzeHDRIBrightestPoint(texture) {
        console.log('🔍 Analyzing HDRI for brightest point (sun extraction)...');

        // Create a temporary canvas to read pixel data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Get texture image (we need to render it to canvas for pixel analysis)
        // For HDR textures, we'll sample at lower resolution for performance
        const sampleWidth = 512;
        const sampleHeight = 256;
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;

        // Create a temporary scene to render the HDRI texture
        const tempScene = new THREE.Scene();
        const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Create a plane with the HDRI texture
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            toneMapped: false // Important: we want raw HDR values
        });
        const plane = new THREE.Mesh(geometry, material);
        tempScene.add(plane);

        // Render to a render target that we can read
        const renderTarget = new THREE.WebGLRenderTarget(sampleWidth, sampleHeight, {
            type: THREE.FloatType, // Use float to preserve HDR values
            format: THREE.RGBAFormat
        });

        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(tempScene, tempCamera);

        // Read pixels
        const pixelBuffer = new Float32Array(sampleWidth * sampleHeight * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, sampleWidth, sampleHeight, pixelBuffer);

        // Reset render target
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

                // Calculate luminance (Rec. 709)
                const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                if (luminance > maxLuminance) {
                    maxLuminance = luminance;
                    brightestU = x / sampleWidth;
                    brightestV = 1.0 - (y / sampleHeight); // Flip V coordinate
                }
            }
        }

        console.log(`  ✓ Brightest point found: UV(${brightestU.toFixed(3)}, ${brightestV.toFixed(3)}), Luminance: ${maxLuminance.toFixed(2)}`);

        // Convert equirectangular UV to 3D direction
        const direction = this.equirectUVToDirection(brightestU, brightestV);

        console.log(`  ✓ Sun direction: (${direction.x.toFixed(3)}, ${direction.y.toFixed(3)}, ${direction.z.toFixed(3)})`);

        // Cleanup
        renderTarget.dispose();
        geometry.dispose();
        material.dispose();

        return direction;
    }

    /**
     * Convert equirectangular UV coordinates to 3D direction vector
     * @param {number} u - Horizontal coordinate (0 to 1)
     * @param {number} v - Vertical coordinate (0 to 1)
     * @returns {THREE.Vector3} - Normalized direction vector
     */
    equirectUVToDirection(u, v) {
        // Convert UV to spherical coordinates
        const phi = (u - 0.5) * Math.PI * 2; // Longitude: -π to π
        const theta = (v - 0.5) * Math.PI;    // Latitude: -π/2 to π/2

        // Convert spherical to Cartesian coordinates
        const x = Math.cos(theta) * Math.sin(phi);
        const y = Math.sin(theta);
        const z = Math.cos(theta) * Math.cos(phi);

        return new THREE.Vector3(x, y, z).normalize();
    }

    /**
     * Update sun light position based on detected direction and current HDRI rotation
     */
    updateSunLightPosition() {
        if (!this.sunLight || !this.sunEnabled) return;

        // Apply HDRI rotation to sun direction
        const rotationRadians = this.hdriRotation * Math.PI / 180;
        const rotatedDirection = this.sunDirection.clone();
        rotatedDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationRadians);

        // Position sun light far from origin in the detected direction
        const distance = 20; // Far enough to act as directional light
        this.sunLight.position.copy(rotatedDirection.multiplyScalar(distance));

        // Always point at scene center
        this.sunLight.target.position.set(0, 0, 0);
        this.sunLight.target.updateMatrixWorld();

        // Update intensity
        this.sunLight.intensity = this.sunIntensity;

        // Show/hide based on enabled state
        this.sunLight.visible = this.sunEnabled;

        console.log(`  ✓ Sun light updated: position(${this.sunLight.position.x.toFixed(2)}, ${this.sunLight.position.y.toFixed(2)}, ${this.sunLight.position.z.toFixed(2)})`);
    }
    
    loadHDRI(presetName) {
        const hdriUrl = this.hdriPresets[presetName];
        
        console.log(`🔄 Loading HDRI: ${presetName}...`);
        console.log(`URL: ${hdriUrl}`);
        
        this.rgbeLoader.load(
            hdriUrl,
            (texture) => {
                console.log(`✓ HDRI texture loaded, generating environment map...`);
                
                // Set texture mapping for environment
                texture.mapping = THREE.EquirectangularReflectionMapping;
                
                // CRITICAL: Store original texture for rotation
                // We clone it so we can regenerate with different rotations
                if (this.originalHDRITexture) {
                    this.originalHDRITexture.dispose();
                }
                this.originalHDRITexture = texture.clone();
                this.originalHDRITexture.mapping = THREE.EquirectangularReflectionMapping;
                
                console.log(`✓ Original HDRI texture stored for rotation`);
                
                // Analyze HDRI to find brightest point (sun extraction)
                this.sunDirection = this.analyzeHDRIBrightestPoint(texture);

                // Generate environment with current rotation
                this.generateRotatedEnvironment(texture, this.hdriRotation * Math.PI / 180);

                // Update sun light position based on detected direction
                this.updateSunLightPosition();

                // If model exists, reapply environment to materials
                if (this.currentModel) {
                    this.applyEnvironmentToModel();
                }

                console.log(`✅ HDRI fully loaded: ${presetName} (2K quality) with sun extraction`);
            },
            (progress) => {
                if (progress.total > 0) {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    console.log(`Loading HDRI: ${percent}%`);
                }
            },
            (error) => {
                console.error('❌ Error loading HDRI:', error);
                alert(`Failed to load HDRI: ${presetName}. Check console for details.`);
            }
        );
    }
    
    generateRotatedEnvironment(texture, rotationRadians) {
        console.log(`🔄 Generating environment with rotation: ${(rotationRadians * 180 / Math.PI).toFixed(1)}°`);
        
        // Always generate PMREM from original equirectangular as-is
        if (this.currentHDRI) {
            this.currentHDRI.dispose();
        }
        const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
        
        // Apply to scene lighting (always active for IBL)
        this.scene.environment = envMap;
        
        // Store the HDRI texture
        this.currentHDRI = envMap;
        
        // Rotate the cube map using environmentRotation/backgroundRotation (r162+)
        if (this.scene.environmentRotation) {
            this.scene.environmentRotation.set(0, rotationRadians, 0);
        }
        if (this.scene.backgroundRotation) {
            this.scene.backgroundRotation.set(0, rotationRadians, 0);
        }
        
        // Use centralized background management for scene.background
        this.updateCanvasBackground();
        
        // Apply to existing model materials (envMap comes from scene.environment)
        if (this.currentModel) {
            this.applyEnvironmentToModel();
        }
        
        console.log(`✓ Environment applied (lighting always on)`);
    }
    
    updateHDRISettings(forceRegenerate = false) {
        const rotationRadians = this.hdriRotation * Math.PI / 180;
        
        console.log(`🔄 Updating HDRI settings...`);
        console.log(`  - Rotation: ${this.hdriRotation}°`);
        console.log(`  - Intensity: ${this.hdriIntensity}`);
        
        // Preferred: rotate cube map via environmentRotation (fast, correct)
        if (this.scene.environmentRotation) {
            this.scene.environmentRotation.set(0, rotationRadians, 0);
        }
        if (this.scene.backgroundRotation) {
            this.scene.backgroundRotation.set(0, rotationRadians, 0);
        }
        
        // Optionally regenerate env (fallback, usually not needed now)
        if (this.originalHDRITexture && forceRegenerate) {
            this.generateRotatedEnvironment(this.originalHDRITexture, rotationRadians);
        }

        // Update tone mapping settings ONLY if HDRI background is visible
        // Otherwise preserve settings from updateCanvasBackground()
        if (this.hdriBackgroundVisible) {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = this.hdriIntensity;
            console.log(`  ✓ Tone mapping: ACES, exposure: ${this.hdriIntensity} (HDRI visible)`);
        } else {
            console.log(`  ✓ Tone mapping preserved (HDRI not visible, using background mode setting)`);
        }
        
        // Update all material env map intensities
        let materialsUpdated = 0;
        this.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    mat.envMapIntensity = this.hdriIntensity;
                    mat.needsUpdate = true;
                    materialsUpdated++;
                });
            }
        });
        
        console.log(`  ✓ Updated ${materialsUpdated} materials with intensity`);
        
        // Update sun light position to match HDRI rotation
        this.updateSunLightPosition();

        // Apply user's manual model rotations in WORLD/GLOBAL space (independent of HDRI rotation)
        // This ensures X, Y, Z rotations are ALWAYS around world axes, not local object axes
        if (this.modelContainer) {
            const userRotX = parseFloat(document.getElementById('rotation-x').value) * Math.PI / 180;
            const userRotY = parseFloat(document.getElementById('rotation-y').value) * Math.PI / 180;
            const userRotZ = parseFloat(document.getElementById('rotation-z').value) * Math.PI / 180;

            // WORLD-SPACE ROTATION: Build rotation matrix from world axes
            // This ensures rotations are ALWAYS around global X, Y, Z regardless of object orientation
            const rotMatrix = new THREE.Matrix4();
            const rotX = new THREE.Matrix4().makeRotationX(userRotX);
            const rotY = new THREE.Matrix4().makeRotationY(userRotY);
            const rotZ = new THREE.Matrix4().makeRotationZ(userRotZ);

            // Apply in order: Y (yaw) → X (pitch) → Z (roll) around WORLD axes
            rotMatrix.multiply(rotY).multiply(rotX).multiply(rotZ);

            // Extract rotation from matrix (ignores any existing rotation)
            this.modelContainer.rotation.setFromRotationMatrix(rotMatrix);

            console.log(`  ✓ Model rotation applied in WORLD SPACE (X:${userRotX.toFixed(2)}, Y:${userRotY.toFixed(2)}, Z:${userRotZ.toFixed(2)})`);
        }

        console.log(`✅ HDRI settings updated successfully`);
    }
    
    loadModel(file) {
        const fileName = file.name.toLowerCase();
        const fileURL = URL.createObjectURL(file);
        
        // Clear existing model
        this.clearModel();
        
        if (fileName.endsWith('.glb') || fileName.endsWith('.gltf')) {
            this.loadGLTF(fileURL);
        } else if (fileName.endsWith('.fbx')) {
            this.loadFBX(fileURL);
        } else {
            console.error('Unsupported file format');
            alert('Please upload a GLB, GLTF, or FBX file');
        }
    }
    
    loadGLTF(url) {
        this.gltfLoader.load(
            url,
            (gltf) => {
                this.currentModel = gltf.scene;
                this.processLoadedModel();
                console.log('GLTF model loaded successfully');
            },
            (progress) => {
                console.log('Loading:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading GLTF:', error);
            }
        );
    }
    
    loadFBX(url) {
        this.fbxLoader.load(
            url,
            (fbx) => {
                this.currentModel = fbx;
                this.processLoadedModel();
                console.log('FBX model loaded successfully');
            },
            (progress) => {
                console.log('Loading:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading FBX:', error);
            }
        );
    }
    
    processLoadedModel() {
        if (!this.currentModel) return;

        // Add model to container
        this.modelContainer.add(this.currentModel);

        // Auto-center model
        this.centerModel();

        // Auto-scale model to fit canvas
        this.autoScaleModel();

        // Enable shadows for realistic rendering
        this.enableModelShadows();

        // Apply environment map to all materials
        this.applyEnvironmentToModel();

        console.log('Model processed and centered with shadows enabled');
    }

    /**
     * Enable shadow casting and receiving for all meshes in the model
     * This is essential for realistic self-shadowing with the sun light
     */
    enableModelShadows() {
        if (!this.currentModel) return;

        let meshCount = 0;
        this.currentModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;    // Model casts shadows
                child.receiveShadow = true; // Model receives shadows (self-shadowing)
                meshCount++;
            }
        });

        console.log(`  ✓ Enabled shadows for ${meshCount} meshes (cast + receive for self-shadowing)`);
    }
    
    centerModel() {
        if (!this.currentModel) return;
        
        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        
        // Center the model
        this.currentModel.position.x = -center.x;
        this.currentModel.position.y = -center.y;
        this.currentModel.position.z = -center.z;
    }
    
    autoScaleModel() {
        if (!this.currentModel) return;
        
        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        
        // Find max dimension
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // Scale to fit in view (target size ~2 units)
        const targetSize = 2;
        const scale = targetSize / maxDim;
        
        this.modelContainer.scale.setScalar(scale);
        
        // Update scale slider to match
        document.getElementById('scale-slider').value = scale;
        document.getElementById('scale-value').textContent = scale.toFixed(2);
    }
    
    applyEnvironmentToModel() {
        if (!this.currentModel) return;
        
        this.currentModel.traverse((child) => {
            if (child.isMesh) {
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    
                    materials.forEach(mat => {
                        // IMPORTANT: Do NOT assign envMap directly.
                        // Let Three.js use scene.environment so environmentRotation is respected.
                        mat.envMapIntensity = this.hdriIntensity;
                        
                        // Enable better PBR rendering
                        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                            // These materials already support PBR correctly
                            mat.needsUpdate = true;
                        } else if (mat.isMeshBasicMaterial || mat.isMeshLambertMaterial) {
                            // Basic materials don't support PBR, but we can still apply envMap
                            mat.needsUpdate = true;
                        }
                        
                        // Ensure proper rendering with IBL
                        mat.needsUpdate = true;
                    });
                }
            }
        });
        
        console.log('Environment map applied to model materials');
    }
    
    clearModel() {
        if (this.currentModel) {
            this.modelContainer.remove(this.currentModel);
            
            // Dispose of geometries and materials
            this.currentModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            
            this.currentModel = null;
        }
    }
    
    setupEventListeners() {
        // Initialize Chatooly Background Manager
        if (window.Chatooly && window.Chatooly.backgroundManager) {
            window.Chatooly.backgroundManager.init(this.canvas);
            this.setupBackgroundControls();
        }
        
        // CRITICAL: Listen for Chatooly canvas resize events
        document.addEventListener('chatooly:canvas-resized', (e) => {
            this.onCanvasResized(e);
        });
        
        // Model upload
        document.getElementById('model-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadModel(file);
            }
        });
        
        // Scale control
        document.getElementById('scale-slider').addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            this.modelContainer.scale.setScalar(scale);
            document.getElementById('scale-value').textContent = scale.toFixed(1);
        });
        
        // Position controls
        document.getElementById('position-x').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.modelContainer.position.x = value;
            document.getElementById('position-x-value').textContent = value.toFixed(1);
        });
        
        document.getElementById('position-y').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.modelContainer.position.y = value;
            document.getElementById('position-y-value').textContent = value.toFixed(1);
        });
        
        // Rotation controls (world/global space)
        document.getElementById('rotation-x').addEventListener('input', (e) => {
            const degrees = parseFloat(e.target.value);
            document.getElementById('rotation-x-value').textContent = degrees + '°';
            // Update both model rotation and HDRI to maintain proper orientation
            this.updateHDRISettings();
        });
        
        document.getElementById('rotation-y').addEventListener('input', (e) => {
            const degrees = parseFloat(e.target.value);
            document.getElementById('rotation-y-value').textContent = degrees + '°';
            // Update both model rotation and HDRI to maintain proper orientation
            this.updateHDRISettings();
        });
        
        document.getElementById('rotation-z').addEventListener('input', (e) => {
            const degrees = parseFloat(e.target.value);
            document.getElementById('rotation-z-value').textContent = degrees + '°';
            // Update both model rotation and HDRI to maintain proper orientation
            this.updateHDRISettings();
        });
        
        // HDRI controls
        document.getElementById('hdri-preset').addEventListener('change', (e) => {
            console.log(`🎨 User changed HDRI preset to: ${e.target.value}`);
            this.loadHDRI(e.target.value);
        });
        
        document.getElementById('hdri-background-visible').addEventListener('change', (e) => {
            this.hdriBackgroundVisible = e.target.checked;
            console.log(`🎨 HDRI background visibility toggled: ${this.hdriBackgroundVisible}`);
            
            // Use centralized background management
            this.updateCanvasBackground();
        });
        
        document.getElementById('hdri-intensity').addEventListener('input', (e) => {
            this.hdriIntensity = parseFloat(e.target.value);
            document.getElementById('hdri-intensity-value').textContent = this.hdriIntensity.toFixed(1);
            this.updateHDRISettings();
        });
        
        document.getElementById('hdri-rotation').addEventListener('input', (e) => {
            this.hdriRotation = parseFloat(e.target.value);
            document.getElementById('hdri-rotation-value').textContent = this.hdriRotation + '°';
            console.log(`🔄 User rotated HDRI to: ${this.hdriRotation}°`);

            // Debounce for performance (regenerating PMREM is expensive)
            // Update preview immediately with intensity, regenerate after user stops
            this.updateHDRISettings(false); // Update intensity immediately

            // Clear existing timer
            if (this.hdriRotationTimer) {
                clearTimeout(this.hdriRotationTimer);
            }

            // Regenerate environment after 300ms of no input (user stopped moving slider)
            this.hdriRotationTimer = setTimeout(() => {
                console.log(`⚡ Regenerating environment with rotation for proper IBL...`);
                this.updateHDRISettings(true); // Force regenerate
            }, 300);
        });

        // Sun light controls
        document.getElementById('sun-enabled').addEventListener('change', (e) => {
            this.sunEnabled = e.target.checked;
            console.log(`☀️ Sun light ${this.sunEnabled ? 'enabled' : 'disabled'}`);
            this.updateSunLightPosition();
        });

        document.getElementById('sun-intensity').addEventListener('input', (e) => {
            this.sunIntensity = parseFloat(e.target.value);
            document.getElementById('sun-intensity-value').textContent = this.sunIntensity.toFixed(1);
            console.log(`☀️ Sun intensity: ${this.sunIntensity}`);
            this.updateSunLightPosition();
        });

        document.getElementById('shadow-quality').addEventListener('change', (e) => {
            this.shadowQuality = parseInt(e.target.value);
            console.log(`🎨 Shadow quality changed to: ${this.shadowQuality}x${this.shadowQuality}`);

            // Update shadow map resolution
            if (this.sunLight) {
                this.sunLight.shadow.mapSize.width = this.shadowQuality;
                this.sunLight.shadow.mapSize.height = this.shadowQuality;
                this.sunLight.shadow.map?.dispose();
                this.sunLight.shadow.map = null;
                console.log(`  ✓ Shadow map updated to ${this.shadowQuality}x${this.shadowQuality}`);
            }
        });
        
        // Turntable animation
        document.getElementById('turntable-toggle').addEventListener('change', (e) => {
            this.turntableEnabled = e.target.checked;
        });
        
        document.getElementById('turntable-speed').addEventListener('input', (e) => {
            this.turntableSpeed = parseFloat(e.target.value);
            document.getElementById('turntable-speed-value').textContent = this.turntableSpeed.toFixed(1);
        });
        
        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    // This function is no longer needed - rotation is handled in updateHDRISettings
    // Keeping it as a stub for compatibility
    updateWorldRotation() {
        // Deprecated - now handled in updateHDRISettings to properly combine with HDRI rotation
        this.updateHDRISettings();
    }
    
    // === CORE BACKGROUND UPDATE METHOD ===
    // Single source of truth for managing canvas transparency and backgrounds
    updateCanvasBackground() {
        // Priority order:
        // 1. HDRI background (if visible) - scene.background shows HDRI
        // 2. Background image texture - scene.background shows texture
        // 3. Transparent mode - scene.background null, canvas transparent
        // 4. Solid color - scene.background shows color

        const transparentBg = document.getElementById('transparent-bg');
        const bgColor = document.getElementById('bg-color');

        if (this.hdriBackgroundVisible && this.currentHDRI) {
            // HDRI showing - use HDRI texture as background
            this.scene.background = this.currentHDRI;
            this.renderer.setClearColor(0x000000, 1);
            // Use ACES tone mapping for HDR content
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = this.hdriIntensity;
            console.log('  ✓ Background mode: HDRI (ACES tone mapping, exposure:', this.hdriIntensity, ')');
        } else if (this.hasBackgroundImage && this.backgroundTexture) {
            // Background image - use loaded texture as scene background
            this.scene.background = this.backgroundTexture;
            this.renderer.setClearColor(0x000000, 1);
            // Disable tone mapping for true colors (no tone curve applied)
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            console.log('  ✓ Background mode: Image (no tone mapping, true colors)');
        } else if (transparentBg && transparentBg.checked) {
            // Transparent mode - no background
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
            // Disable tone mapping for neutral rendering
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            console.log('  ✓ Background mode: Transparent (no tone mapping)');
        } else {
            // Solid color mode
            const color = bgColor ? bgColor.value : '#CCFD50';
            this.scene.background = new THREE.Color(color);
            this.renderer.setClearColor(color, 1);
            // Disable tone mapping for exact color matching
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            console.log('  ✓ Background mode: Solid color (no tone mapping, exact color)');
        }

        // Update UI visibility
        const bgColorGroup = document.getElementById('bg-color-group');
        if (bgColorGroup) {
            const showColorPicker = !transparentBg?.checked && !this.hasBackgroundImage && !this.hdriBackgroundVisible;
            bgColorGroup.style.display = showColorPicker ? 'block' : 'none';
        }
    }
    
    setupBackgroundControls() {
        console.log('🔍 Initializing background controls');
        
        // Get all control elements
        const transparentBg = document.getElementById('transparent-bg');
        const bgColor = document.getElementById('bg-color');
        const bgImage = document.getElementById('bg-image');
        const clearBgImage = document.getElementById('clear-bg-image');
        const bgFit = document.getElementById('bg-fit');
        
        // === TRANSPARENT BACKGROUND TOGGLE ===
        if (transparentBg) {
            transparentBg.addEventListener('change', () => {
                console.log('🎨 Transparent background toggled:', transparentBg.checked);
                this.updateCanvasBackground();
            });
        }
        
        // === BACKGROUND COLOR ===
        if (bgColor) {
            bgColor.addEventListener('input', (e) => {
                console.log('🎨 Background color changed:', e.target.value);
                this.updateCanvasBackground();
            });
        }
        
        // === BACKGROUND IMAGE UPLOAD ===
        if (bgImage) {
            bgImage.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    console.log('🎨 Loading background image as Three.js texture...');

                    // Create a URL for the file
                    const imageURL = URL.createObjectURL(file);

                    // Load as Three.js texture
                    this.textureLoader.load(
                        imageURL,
                        (texture) => {
                            console.log('✅ Background texture loaded successfully');

                            // Dispose of old texture if it exists
                            if (this.backgroundTexture) {
                                this.backgroundTexture.dispose();
                            }

                            // Store the new texture
                            this.backgroundTexture = texture;
                            this.hasBackgroundImage = true;

                            // Update canvas background to use texture
                            this.updateCanvasBackground();

                            // Show clear button and fit controls
                            if (clearBgImage) clearBgImage.style.display = 'block';
                            if (document.getElementById('bg-fit-group')) {
                                document.getElementById('bg-fit-group').style.display = 'block';
                            }

                            // Clean up the object URL
                            URL.revokeObjectURL(imageURL);
                        },
                        undefined,
                        (error) => {
                            console.error('❌ Failed to load background texture:', error);
                            alert('Failed to load background image');
                            URL.revokeObjectURL(imageURL);
                        }
                    );
                } catch (error) {
                    console.error('❌ Failed to process background image:', error);
                    alert('Failed to load background image');
                }
            });
        }
        
        // === CLEAR BACKGROUND IMAGE ===
        if (clearBgImage) {
            clearBgImage.addEventListener('click', () => {
                console.log('🎨 Clearing background image');

                // Dispose of texture properly
                if (this.backgroundTexture) {
                    this.backgroundTexture.dispose();
                    this.backgroundTexture = null;
                }

                // Mark as no longer having background image
                this.hasBackgroundImage = false;

                // Update canvas background (will revert to solid color or transparent)
                this.updateCanvasBackground();

                // Hide controls
                clearBgImage.style.display = 'none';
                if (document.getElementById('bg-fit-group')) {
                    document.getElementById('bg-fit-group').style.display = 'none';
                }
                if (bgImage) bgImage.value = '';

                console.log('✅ Background image cleared and texture disposed');
            });
        }
        
        // === BACKGROUND FIT ===
        // Note: Three.js scene.background doesn't support fit modes like CSS
        // The texture will automatically fill the viewport
        // For more control, this would require custom shader materials
        if (bgFit) {
            bgFit.addEventListener('change', () => {
                console.log('⚠️ Background fit mode not supported with Three.js textures');
                console.log('   Texture will fill viewport automatically');
                // Three.js scene.background always stretches to fill the viewport
            });
        }
        
        // Initialize default state
        this.updateCanvasBackground();
        console.log('✅ Background controls initialized');
    }
    
    onCanvasResized(e) {
        // Handle Chatooly canvas resize events
        console.log('Chatooly resize event received:', e.detail);

        // OVERRIDE: Force HD resolution (1920x1080) regardless of container size
        // This ensures high-quality rendering and exports
        this.canvas.width = 1920;
        this.canvas.height = 1080;

        // Update camera aspect ratio for 16:9
        this.camera.aspect = 1920 / 1080;
        this.camera.updateProjectionMatrix();

        // Update renderer size to HD resolution
        this.renderer.setSize(1920, 1080, false);

        console.log('Canvas forced to Full HD: 1920x1080 (aspect: 16:9)');
    }
    
    onWindowResize() {
        // Handle window resize events
        // Force HD resolution even on window resize
        this.canvas.width = 1920;
        this.canvas.height = 1080;

        this.camera.aspect = 1920 / 1080;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(1920, 1080, false);

        console.log('Window resized - canvas maintained at Full HD: 1920x1080');
    }
    
    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        
        // Turntable animation (world-space Y-axis rotation)
        if (this.turntableEnabled && this.currentModel) {
            // Rotate around world Y-axis
            this.modelContainer.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.01 * this.turntableSpeed);
            
            // Update the Y rotation slider to reflect current rotation
            const currentRotY = this.modelContainer.rotation.y * 180 / Math.PI;
            const normalizedRotY = ((currentRotY % 360) + 360) % 360;
            document.getElementById('rotation-y').value = normalizedRotY;
            document.getElementById('rotation-y-value').textContent = normalizedRotY.toFixed(0) + '°';
        }
        
        this.render();
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    dispose() {
        // Cleanup
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.clearModel();
        this.renderer.dispose();
        this.pmremGenerator.dispose();
        
        console.log('Viewer disposed');
    }
}

// Initialize viewer
let viewer = null;

window.addEventListener('DOMContentLoaded', () => {
    viewer = new ModelViewer();
});

// High-resolution export function (CRITICAL for quality exports)
window.renderHighResolution = function(targetCanvas, scale) {
    if (!viewer || !viewer.renderer) {
        console.warn('Viewer not initialized for high-res export');
        return;
    }
    
    const originalWidth = viewer.canvas.width;
    const originalHeight = viewer.canvas.height;
    
    // Set high-resolution size
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    
    // Update renderer size for high-res
    viewer.renderer.setSize(scaledWidth, scaledHeight, false);
    
    // Render at high resolution
    viewer.renderer.render(viewer.scene, viewer.camera);
    
    // Copy to target canvas
    const ctx = targetCanvas.getContext('2d');
    targetCanvas.width = scaledWidth;
    targetCanvas.height = scaledHeight;
    ctx.drawImage(viewer.canvas, 0, 0);
    
    // Restore original size
    viewer.renderer.setSize(originalWidth, originalHeight, false);
    
    console.log(`High-res export completed at ${scale}x resolution (${scaledWidth}x${scaledHeight})`);
};
