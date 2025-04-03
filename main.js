// Vertex shader with relativistic effects
const vertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 cameraPosition;
uniform vec3 motionDir;
uniform float morphFactor;

void main() {
    // Get world position
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    
    // Vector from camera to vertex
    vec3 viewDir = normalize(worldPosition.xyz - cameraPosition);
    
    // Calculate angle between view direction and motion direction
    float cosTheta = dot(viewDir, normalize(motionDir));
    float theta = acos(clamp(cosTheta, -1.0, 1.0));
    
    // Calculate relativistic aberration
    float c_minus_v = 1.0 - morphFactor;
    float c_plus_v = 1.0 + morphFactor;
    float ratio = sqrt(c_minus_v / c_plus_v);
    float theta_prime = 2.0 * atan(ratio * tan(theta/2.0));
    
    // Calculate rotation amount
    float rotAmount = theta - theta_prime;
    
    // Apply relativistic effect when moving
    if (morphFactor > 0.001 && abs(rotAmount) > 0.001) {
        // Get rotation axis
        vec3 rotAxis = normalize(cross(viewDir, normalize(motionDir)));
        
        // Calculate new position
        vec3 newPos = cameraPosition;
        float dist = length(worldPosition.xyz - cameraPosition);
        
        // Quaternion rotation
        float s = sin(rotAmount / 2.0);
        float c = cos(rotAmount / 2.0);
        vec4 q = vec4(rotAxis * s, c);
        
        // Apply rotation
        vec3 t = 2.0 * cross(q.xyz, viewDir);
        vec3 newViewDir = viewDir + q.w * t + cross(q.xyz, t);
        
        // Set new position
        newPos += newViewDir * dist;
        worldPosition = vec4(newPos, 1.0);
    }
    
    // Transform to clip space
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    
    // Pass data to fragment shader
    vUv = uv;
    vNormal = normalMatrix * normal;
    vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
}`;

// Fragment shader for Phong lighting
const fragmentShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 lightPos;
uniform vec3 lightColor;
uniform vec3 objectColor;

void main() {
    // Ambient light
    float ambientStrength = 0.1;
    vec3 ambient = ambientStrength * lightColor;
    
    // Diffuse light
    vec3 norm = normalize(vNormal);
    vec3 lightDir = normalize(lightPos - vPosition);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;
    
    // Specular light
    float specularStrength = 0.5;
    vec3 viewDir = normalize(-vPosition);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3 specular = specularStrength * spec * lightColor;
    
    // Final color
    vec3 result = (ambient + diffuse + specular) * objectColor;
    gl_FragColor = vec4(result, 1.0);
}`;

// Scene initialization
let scene, camera, renderer;
let controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let morphFactor = 0; // v/c ratio (relativistic speed)
let motionDir = new THREE.Vector3(0, 0, -1);
let objects = []; // Store scene objects
let clock = new THREE.Clock();

// Initialize the application
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Average eye height
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').prepend(renderer.domElement);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Setup controls
    setupControls();
    
    // Create objects
    createObjects();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.getElementById('speed-slider').addEventListener('input', updateSpeed);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    
    // Add keyboard controls
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    
    // Start animation loop
    animate();
}

// Setup camera controls
function setupControls() {
    controls = new THREE.PointerLockControls(camera, document.body);
    
    // Click to enable controls
    renderer.domElement.addEventListener('click', function() {
        controls.lock();
    });
    
    // Listen for lock/unlock events
    controls.addEventListener('lock', function() {
        console.log('Controls locked');
    });
    
    controls.addEventListener('unlock', function() {
        console.log('Controls unlocked');
    });
}

// Create scene objects
function createObjects() {
    // Deep blue color
    const deepBlue = new THREE.Color(0x0033AA);
    
    // Create a custom shader material
    const createMaterial = () => {
        return new THREE.ShaderMaterial({
            uniforms: {
                lightPos: { value: new THREE.Vector3(5, 5, 5) },
                lightColor: { value: new THREE.Vector3(1, 1, 1) },
                objectColor: { value: new THREE.Vector3(deepBlue.r, deepBlue.g, deepBlue.b) },
                morphFactor: { value: morphFactor },
                motionDir: { value: motionDir.clone() },
                cameraPosition: { value: camera.position.clone() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });
    };
    
    // Create cubes
    const cubePositions = [
        [0, 0, -5],           // Place first cube directly ahead
        [2, 5, -15],
        [-1.5, -2.2, -2.5],
        [-3.8, -2.0, -12.3],
        [2.4, -0.4, -3.5],
        [-1.7, 3.0, -7.5],
        [1.3, -2.0, -2.5],
        [1.5, 2.0, -2.5],
        [1.5, 0.2, -1.5],
        [-1.3, 1.0, -1.5]
    ];
    
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    
    cubePositions.forEach((pos, i) => {
        const material = createMaterial();
        const cube = new THREE.Mesh(cubeGeometry, material);
        cube.position.set(pos[0], pos[1], pos[2]);
        cube.rotation.set(0, 0.2 * i, 0.3 * i);
        scene.add(cube);
        objects.push(cube);
    });
    
    // Create pyramids
    const pyramidPositions = [
        [5.0, 2.0, -5.0],
        [-5.0, 1.0, -3.0]
    ];
    
    const pyramidGeometry = new THREE.ConeGeometry(1, 2, 4);
    
    pyramidPositions.forEach((pos, i) => {
        const material = createMaterial();
        const pyramid = new THREE.Mesh(pyramidGeometry, material);
        pyramid.position.set(pos[0], pos[1], pos[2]);
        pyramid.rotation.set(0, 0.3 * i, 0);
        scene.add(pyramid);
        objects.push(pyramid);
    });
    
    // Create spheres
    const spherePositions = [
        [4.0, 1.0, -7.0],
        [-3.0, 2.0, -4.0]
    ];
    
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    
    spherePositions.forEach((pos) => {
        const material = createMaterial();
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(pos[0], pos[1], pos[2]);
        scene.add(sphere);
        objects.push(sphere);
    });
    
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x222222,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    scene.add(floor);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update relativistic speed
function updateSpeed(e) {
    if (e) {
        morphFactor = parseFloat(e.target.value);
        document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
    }
    
    // Update material for each object
    objects.forEach(obj => {
        if (obj.material.uniforms) {
            obj.material.uniforms.morphFactor.value = morphFactor;
            obj.material.uniforms.motionDir.value.copy(camera.getWorldDirection(new THREE.Vector3()));
        }
    });
}

// Toggle fullscreen
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Handle key down events
function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'PageUp':
            morphFactor = Math.min(0.99, morphFactor + 0.01);
            document.getElementById('speed-slider').value = morphFactor;
            document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
            updateSpeed();
            break;
        case 'PageDown':
            morphFactor = Math.max(0, morphFactor - 0.01);
            document.getElementById('speed-slider').value = morphFactor;
            document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
            updateSpeed();
            break;
    }
}

// Handle key up events
function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Get delta time
    const delta = clock.getDelta();
    
    // Handle movement
    if (controls.isLocked === true) {
        // Set movement speed
        const moveSpeed = 5.0 * delta;
        
        // Reset velocity
        velocity.x = 0;
        velocity.z = 0;
        
        // Apply movement based on keys
        if (moveForward) velocity.z -= moveSpeed;
        if (moveBackward) velocity.z += moveSpeed;
        if (moveLeft) velocity.x -= moveSpeed;
        if (moveRight) velocity.x += moveSpeed;
        
        // Apply movement
        controls.moveRight(velocity.x);
        controls.moveForward(velocity.z);
    }
    
    // Update all objects
    objects.forEach(obj => {
        if (obj.material.uniforms) {
            // Update camera position
            obj.material.uniforms.cameraPosition.value.copy(camera.position);
            
            // Update motion direction
            const dir = camera.getWorldDirection(new THREE.Vector3());
            obj.material.uniforms.motionDir.value.copy(dir);
        }
    });
    
    // Render the scene
    renderer.render(scene, camera);
}

// Start the application . .
init();