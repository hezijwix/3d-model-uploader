/* 
 * 3D Model Uploader - Main Logic
 * Author: Your Name
 * 
 * Three.js-based 3D model viewer with IBL lighting, turntable animation,
 * and high-quality rendering for GLB, GLTF, and FBX formats.
 */

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
        
        this.init();
    }
    
    init() {
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
        const width = this.canvas.width || 800;
        const height = this.canvas.height || 600;
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
        const width = this.canvas.width || 800;
        const height = this.canvas.height || 600;
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
        
        // Improved GPU optimization settings for better IBL (r162+ uses outputColorSpace)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Updated from outputEncoding
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2; // Slightly brighter for better visibility
        
        // Note: physicallyCorrectLights is deprecated in r162+, now enabled by default
        // this.renderer.physicallyCorrectLights = true;
        
        // Enable shadows for better quality (can be toggled later)
        this.renderer.shadowMap.enabled = false;
        
        // Setup PMREMGenerator for high-quality IBL
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        
        console.log(`Renderer initialized: ${width}x${height} with improved IBL settings`);
    }
    
    setupLights() {
        // Ambient light as fallback
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        
        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
        keyLight.position.set(5, 5, 5);
        this.scene.add(keyLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-5, 0, -5);
        this.scene.add(fillLight);
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
    }
    
    loadDefaultHDRI() {
        this.loadHDRI('studio');
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
                
                // Generate environment with current rotation
                this.generateRotatedEnvironment(texture, this.hdriRotation * Math.PI / 180);
                
                // If model exists, reapply environment to materials
                if (this.currentModel) {
                    this.applyEnvironmentToModel();
                }
                
                console.log(`✅ HDRI fully loaded: ${presetName} (2K quality)`);
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
        console.log(`🔄 Generating environment (no texture rotation, using cube map rotation)`);
        
        // Always generate PMREM from original equirectangular as-is
        if (this.currentHDRI) {
            this.currentHDRI.dispose();
        }
        const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
        
        // Apply to scene lighting (always active for IBL)
        this.scene.environment = envMap;
        
        // Apply to background only if checkbox is checked
        if (this.hdriBackgroundVisible) {
            this.scene.background = envMap;
            this.renderer.setClearColor(0x000000, 1); // Opaque when HDRI showing
        } else {
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0); // Transparent when HDRI hidden
        }
        
        this.currentHDRI = envMap;
        
        // Rotate the cube map using environmentRotation/backgroundRotation (r162+)
        if (this.scene.environmentRotation) {
            this.scene.environmentRotation.set(0, rotationRadians, 0);
        }
        if (this.scene.backgroundRotation) {
            this.scene.backgroundRotation.set(0, rotationRadians, 0);
        }
        
        // Apply to existing model materials (envMap comes from scene.environment)
        if (this.currentModel) {
            this.applyEnvironmentToModel();
        }
        
        console.log(`✓ Environment applied (lighting always on, background: ${this.hdriBackgroundVisible ? 'visible' : 'hidden'})`);
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
        
        // Update intensity (tone mapping exposure)
        this.renderer.toneMappingExposure = this.hdriIntensity;
        console.log(`  ✓ Tone mapping exposure: ${this.renderer.toneMappingExposure}`);
        
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
        
        // Apply environment map to all materials
        this.applyEnvironmentToModel();
        
        console.log('Model processed and centered');
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
            console.log(`🎨 HDRI background visibility: ${this.hdriBackgroundVisible}`);
            
            // Update background immediately
            if (this.hdriBackgroundVisible && this.currentHDRI) {
                // Show HDRI background - make canvas OPAQUE to hide container background
                this.scene.background = this.currentHDRI;
                this.renderer.setClearColor(0x000000, 1); // Opaque
                console.log('  ✓ HDRI showing, canvas opaque');
            } else {
                // Hide HDRI background - make canvas TRANSPARENT to show container background
                this.scene.background = null;
                this.renderer.setClearColor(0x000000, 0); // Transparent
                console.log('  ✓ HDRI hidden, canvas transparent for background image');
            }
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
    
    setupBackgroundControls() {
        // For Three.js with WebGL, we use scene background color
        // The Chatooly background manager works behind the transparent canvas
        
        // Debug: Check canvas setup
        console.log('🔍 Canvas setup check:');
        console.log('  - Canvas alpha:', this.renderer.getContextAttributes().alpha);
        console.log('  - Canvas element:', this.canvas);
        console.log('  - Chatooly backgroundManager:', !!window.Chatooly?.backgroundManager);
        
        // Transparent background toggle
        const transparentBg = document.getElementById('transparent-bg');
        if (transparentBg) {
            transparentBg.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.scene.background = null;
                    this.renderer.setClearColor(0x000000, 0); // Transparent clear color
                    document.getElementById('bg-color-group').style.display = 'none';
                    console.log('✓ Canvas transparent - background image/color will show');
                } else {
                    // If there's no background image, show solid color
                    if (!this.hasBackgroundImage) {
                        const bgColor = document.getElementById('bg-color').value;
                        this.scene.background = new THREE.Color(bgColor);
                        this.renderer.setClearColor(bgColor, 1); // Opaque clear color
                        document.getElementById('bg-color-group').style.display = 'block';
                    } else {
                        // Has background image - keep canvas transparent
                        this.scene.background = null;
                        this.renderer.setClearColor(0x000000, 0);
                        document.getElementById('bg-color-group').style.display = 'none';
                        e.target.checked = true; // Force back to checked
                        alert('Cannot disable transparency while background image is active. Please clear the image first.');
                        console.warn('⚠️ Background image requires transparent canvas');
                    }
                }
            });
        }
        
        // Background color
        const bgColor = document.getElementById('bg-color');
        if (bgColor) {
            bgColor.addEventListener('input', (e) => {
                if (!transparentBg.checked) {
                    const color = e.target.value;
                    this.scene.background = new THREE.Color(color);
                    this.renderer.setClearColor(color, 1); // Update clear color
                }
            });
        }
        
        // Background image - use Chatooly background manager
        const bgImage = document.getElementById('bg-image');
        if (bgImage) {
            bgImage.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file && window.Chatooly && window.Chatooly.backgroundManager) {
                    try {
                        await window.Chatooly.backgroundManager.setBackgroundImage(file);
                        document.getElementById('clear-bg-image').style.display = 'block';
                        document.getElementById('bg-fit-group').style.display = 'block';
                        
                        // Mark that we have a background image
                        this.hasBackgroundImage = true;
                        
                        // CRITICAL: Make canvas transparent ONLY if HDRI background is off
                        if (!this.hdriBackgroundVisible) {
                            this.scene.background = null;
                            this.renderer.setClearColor(0x000000, 0); // Alpha = 0 for transparency
                        }
                        // If HDRI background is on, it stays opaque and shows HDRI
                        
                        // Force transparent checkbox on
                        transparentBg.checked = true;
                        document.getElementById('bg-color-group').style.display = 'none';
                        
                        // CRITICAL: Apply background to container behind canvas
                        const container = document.getElementById('chatooly-container');
                        const bgCSS = window.Chatooly.backgroundManager.getBackgroundCSS();
                        
                        // Apply background to container
                        container.style.background = bgCSS;
                        
                        // Ensure proper layering: canvas should be on top with transparency
                        this.canvas.style.background = 'none'; // Remove any canvas background
                        this.canvas.style.position = 'relative'; // Ensure positioned element
                        this.canvas.style.zIndex = '1'; // Canvas on top
                        
                        console.log('🎨 Applied background CSS to container:', bgCSS);
                        console.log('🎨 Canvas layering: background=none, z-index=1');
                        
                        console.log('✅ Background image uploaded successfully');
                        console.log('✅ Canvas set to transparent mode');
                        console.log('📊 Image should now be visible behind 3D model');
                        
                        // Debug: Check if background is actually applied
                        setTimeout(() => {
                            const containerStyle = window.getComputedStyle(container);
                            const canvasStyle = window.getComputedStyle(this.canvas);
                            console.log('🔍 Container background:', containerStyle.backgroundImage);
                            console.log('🔍 Canvas background:', canvasStyle.background);
                            console.log('🔍 Canvas clear color alpha:', this.renderer.getClearAlpha());
                        }, 100);
                    } catch (error) {
                        console.error('❌ Failed to load background image:', error);
                        alert('Failed to load background image');
                    }
                }
            });
        }
        
        // Clear background image
        const clearBgImage = document.getElementById('clear-bg-image');
        if (clearBgImage) {
            clearBgImage.addEventListener('click', () => {
                if (window.Chatooly && window.Chatooly.backgroundManager) {
                    window.Chatooly.backgroundManager.clearBackgroundImage();
                }
                
                // Remove background CSS from container and reset canvas styles
                const container = document.getElementById('chatooly-container');
                container.style.background = '';
                this.canvas.style.background = '';
                this.canvas.style.zIndex = '';
                
                clearBgImage.style.display = 'none';
                document.getElementById('bg-fit-group').style.display = 'none';
                document.getElementById('bg-image').value = '';
                
                // Mark that background image is removed
                this.hasBackgroundImage = false;
                
                // Restore background color if not transparent
                if (!transparentBg.checked) {
                    const color = document.getElementById('bg-color').value;
                    this.scene.background = new THREE.Color(color);
                    this.renderer.setClearColor(color, 1);
                }
                
                console.log('✓ Background image cleared, transparent checkbox unlocked');
            });
        }
        
        // Background fit
        const bgFit = document.getElementById('bg-fit');
        if (bgFit) {
            bgFit.addEventListener('change', (e) => {
                if (window.Chatooly && window.Chatooly.backgroundManager) {
                    window.Chatooly.backgroundManager.setFit(e.target.value);
                    
                    // Re-apply background CSS after changing fit mode
                    const container = document.getElementById('chatooly-container');
                    const bgCSS = window.Chatooly.backgroundManager.getBackgroundCSS();
                    container.style.background = bgCSS;
                    this.canvas.style.background = 'none'; // Keep canvas transparent
                    this.canvas.style.zIndex = '1'; // Ensure canvas stays on top
                    console.log('🎨 Background fit changed, CSS updated');
                }
            });
        }
        
        // Set default background - but HDRI will override this when loaded
        // const defaultBgColor = document.getElementById('bg-color').value;
        // this.scene.background = new THREE.Color(defaultBgColor);
        // Note: Scene background is set by HDRI system, background color only applies when transparent is unchecked
        console.log(`✓ Background controls initialized`);
    }
    
    onCanvasResized(e) {
        // Handle Chatooly canvas resize events (aspect ratio changes)
        console.log('Canvas resized:', e.detail);
        
        const canvas = e.detail.canvas;
        const newWidth = canvas.width;
        const newHeight = canvas.height;
        
        // Update camera aspect ratio
        this.camera.aspect = newWidth / newHeight;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size to match canvas internal resolution
        this.renderer.setSize(newWidth, newHeight, false);
        
        console.log(`Camera updated: ${newWidth}x${newHeight}, aspect: ${this.camera.aspect.toFixed(2)}`);
    }
    
    onWindowResize() {
        // Handle window resize events
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
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
