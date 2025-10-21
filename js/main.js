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
        
        // HDRI environment
        this.pmremGenerator = null;
        this.currentHDRI = null;
        this.hdriIntensity = 1.0;
        this.hdriRotation = 0;
        
        // Store original rotations for HDRI rotation workaround
        this.cameraOriginalRotation = 0;
        this.modelOriginalRotation = 0;
        
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
                
                // Generate high-quality environment map with PMREM
                const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                
                // Apply to scene environment (for lighting/reflections)
                this.scene.environment = envMap;
                
                // Apply to scene background (make it visible)
                this.scene.background = envMap;
                
                // Store reference
                this.currentHDRI = envMap;
                
                console.log(`✓ Environment map generated and applied`);
                console.log(`  - scene.environment:`, this.scene.environment);
                console.log(`  - scene.background:`, this.scene.background);
                
                // Apply rotation and intensity
                this.updateHDRISettings();
                
                // If model exists, reapply environment to materials
                if (this.currentModel) {
                    this.applyEnvironmentToModel();
                }
                
                // Cleanup original texture
                texture.dispose();
                
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
    
    updateHDRISettings() {
        // Update environment rotation
        const rotationRadians = this.hdriRotation * Math.PI / 180;
        
        console.log(`🔄 Updating HDRI settings...`);
        console.log(`  - Rotation: ${this.hdriRotation}° (${rotationRadians} rad)`);
        console.log(`  - Intensity: ${this.hdriIntensity}`);
        
        // SOLUTION: Manually rotate the entire scene around Y-axis to simulate HDRI rotation
        // This is a workaround since Three.js r162 environmentRotation may not work on all browsers
        // We rotate the scene in the opposite direction to make it appear the environment rotates
        if (this.currentModel) {
            // Store the model's original rotation
            if (!this.modelOriginalRotation) {
                this.modelOriginalRotation = this.modelContainer.rotation.y;
            }
            // We don't rotate the model container - HDRI rotation is visual only
        }
        
        // Try Three.js r162+ native rotation (may work in newer browsers)
        if (this.scene.environmentRotation) {
            this.scene.environmentRotation.set(0, rotationRadians, 0);
            console.log(`  ✓ Environment rotation set (Three.js r162+)`);
        }
        
        if (this.scene.backgroundRotation) {
            this.scene.backgroundRotation.set(0, rotationRadians, 0);
            console.log(`  ✓ Background rotation set (Three.js r162+)`);
        }
        
        // Alternative approach: Rotate camera in opposite direction
        // This makes it look like the environment is rotating
        // Store original camera position if not stored
        if (!this.cameraOriginalRotation) {
            this.cameraOriginalRotation = this.camera.rotation.y;
        }
        
        // Rotate camera view (opposite direction to simulate environment rotation)
        // Note: This rotates the view, making the HDRI appear to rotate
        this.camera.rotation.y = this.cameraOriginalRotation - rotationRadians;
        console.log(`  ✓ Camera rotation adjusted for HDRI rotation effect`);
        
        // Update environment intensity on renderer (tone mapping exposure)
        this.renderer.toneMappingExposure = this.hdriIntensity;
        console.log(`  ✓ Tone mapping exposure: ${this.renderer.toneMappingExposure}`);
        
        // Update all materials in the scene for proper IBL
        let materialsUpdated = 0;
        this.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        mat.envMapIntensity = this.hdriIntensity;
                        mat.needsUpdate = true;
                        materialsUpdated++;
                    });
                } else {
                    child.material.envMapIntensity = this.hdriIntensity;
                    child.material.needsUpdate = true;
                    materialsUpdated++;
                }
            }
        });
        
        console.log(`  ✓ Updated ${materialsUpdated} materials with intensity=${this.hdriIntensity}`);
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
                        // Ensure material uses environment map for IBL
                        mat.envMap = this.scene.environment;
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
            this.updateWorldRotation();
            document.getElementById('rotation-x-value').textContent = degrees + '°';
        });
        
        document.getElementById('rotation-y').addEventListener('input', (e) => {
            const degrees = parseFloat(e.target.value);
            this.updateWorldRotation();
            document.getElementById('rotation-y-value').textContent = degrees + '°';
        });
        
        document.getElementById('rotation-z').addEventListener('input', (e) => {
            const degrees = parseFloat(e.target.value);
            this.updateWorldRotation();
            document.getElementById('rotation-z-value').textContent = degrees + '°';
        });
        
        // HDRI controls
        document.getElementById('hdri-preset').addEventListener('change', (e) => {
            console.log(`🎨 User changed HDRI preset to: ${e.target.value}`);
            this.loadHDRI(e.target.value);
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
            this.updateHDRISettings();
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
    
    updateWorldRotation() {
        // Apply rotations in world space (global axes)
        const rotX = parseFloat(document.getElementById('rotation-x').value) * Math.PI / 180;
        const rotY = parseFloat(document.getElementById('rotation-y').value) * Math.PI / 180;
        const rotZ = parseFloat(document.getElementById('rotation-z').value) * Math.PI / 180;
        
        // Reset rotation
        this.modelContainer.rotation.set(0, 0, 0);
        
        // Apply rotations in world space: Y -> X -> Z order
        // This gives predictable, global-axis rotations
        this.modelContainer.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rotY); // World Y
        this.modelContainer.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), rotX); // World X
        this.modelContainer.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), rotZ); // World Z
    }
    
    setupBackgroundControls() {
        // For Three.js with WebGL, we use scene background color
        // The Chatooly background manager works behind the transparent canvas
        
        // Transparent background toggle
        const transparentBg = document.getElementById('transparent-bg');
        if (transparentBg) {
            transparentBg.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.scene.background = null;
                    document.getElementById('bg-color-group').style.display = 'none';
                } else {
                    const bgColor = document.getElementById('bg-color').value;
                    this.scene.background = new THREE.Color(bgColor);
                    document.getElementById('bg-color-group').style.display = 'block';
                }
            });
        }
        
        // Background color
        const bgColor = document.getElementById('bg-color');
        if (bgColor) {
            bgColor.addEventListener('input', (e) => {
                if (!transparentBg.checked) {
                    this.scene.background = new THREE.Color(e.target.value);
                }
            });
        }
        
        // Background image - use Chatooly background manager
        const bgImage = document.getElementById('bg-image');
        if (bgImage) {
            bgImage.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file && window.Chatooly && window.Chatooly.backgroundManager) {
                    await window.Chatooly.backgroundManager.setBackgroundImage(file);
                    document.getElementById('clear-bg-image').style.display = 'block';
                    document.getElementById('bg-fit-group').style.display = 'block';
                    
                    // Make scene background transparent to show image behind
                    this.scene.background = null;
                    transparentBg.checked = true;
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
                clearBgImage.style.display = 'none';
                document.getElementById('bg-fit-group').style.display = 'none';
                document.getElementById('bg-image').value = '';
            });
        }
        
        // Background fit
        const bgFit = document.getElementById('bg-fit');
        if (bgFit) {
            bgFit.addEventListener('change', (e) => {
                if (window.Chatooly && window.Chatooly.backgroundManager) {
                    window.Chatooly.backgroundManager.setFit(e.target.value);
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
