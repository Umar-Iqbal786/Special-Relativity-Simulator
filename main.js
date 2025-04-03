// Vertex shader with relativistic aberration based on equation 2.3 from the thesis
const vertexShader = `
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 motionDir;
uniform float morphFactor; // v/c - ratio of velocity to speed of light

void main() {
    // Calculate world position
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    
    // Vector from camera to vertex
    vec3 viewDir = normalize(vec3(worldPos) - cameraPosition);
    
    // Calculate angle between view direction and motion direction
    float cosTheta = dot(viewDir, normalize(motionDir));
    float theta = acos(clamp(cosTheta, -1.0, 1.0)); // Clamp to avoid numerical issues
    
    // Calculate new angle after relativistic aberration
    // Using equation 2.3 from the thesis
    float c_minus_v = 1.0 - morphFactor;
    float c_plus_v = 1.0 + morphFactor;
    float ratio = sqrt(c_minus_v / c_plus_v);
    float theta_prime = 2.0 * atan(ratio * tan(theta/2.0));
    
    // Calculate rotation amount
    float rotAmount = theta - theta_prime;
    
    // If we're moving and there's an effect to apply
    if (morphFactor > 0.001 && abs(rotAmount) > 0.001) {
        // Calculate rotation axis (perpendicular to both vectors)
        vec3 rotAxis = normalize(cross(viewDir, normalize(motionDir)));
        
        // Apply rotation to the position
        vec3 newPos = cameraPosition;
        float dist = length(vec3(worldPos) - cameraPosition);
        
        // Quaternion rotation
        float s = sin(rotAmount / 2.0);
        float c = cos(rotAmount / 2.0);
        vec4 q = vec4(rotAxis * s, c);
        
        // Apply quaternion rotation
        vec3 t = 2.0 * cross(vec3(q.xyz), viewDir);
        vec3 newViewDir = viewDir + q.w * t + cross(q.xyz, t);
        
        // Position along new ray direction at same distance
        newPos += newViewDir * dist;
        worldPos = vec4(newPos, 1.0);
    }
    
    // Transform to clip space
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    
    // Pass data to fragment shader
    vUv = uv;
    vNormal = normalMatrix * normal;
    vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
}
`;

// Fragment shader for phong lighting
const fragmentShader = `
uniform vec3 lightPos;
uniform vec3 lightColor;
uniform vec3 objectColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    // Ambient
    float ambientStrength = 0.3;
    vec3 ambient = ambientStrength * lightColor;
    
    // Diffuse
    vec3 norm = normalize(vNormal);
    vec3 lightDir = normalize(lightPos - vPosition);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;
    
    // Specular
    float specularStrength = 0.5;
    vec3 viewDir = normalize(-vPosition);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3 specular = specularStrength * spec * lightColor;
    
    vec3 result = (ambient + diffuse + specular) * objectColor;
    gl_FragColor = vec4(result, 1.0);
}
`;

// Scene variables
let scene, camera, renderer;
let controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let morphFactor = 0.8; // Start with a high relativistic speed: 80% of light speed
let motionDir = new THREE.Vector3(0, 0, -1);
let objects = [];
let clock = new THREE.Clock();

// Initialize the scene
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
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    
    // Add point light attached to camera for better visibility
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    camera.add(pointLight);
    scene.add(camera);
    
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
    
    // Set initial speed display
    document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
    document.getElementById('speed-slider').value = morphFactor;
    
    // Start animation
    animate();
    
    console.log("Initialization complete");
    console.log("Initial morphFactor:", morphFactor);
    console.log("Objects created:", objects.length);
}

// Setup camera controls
function setupControls() {
    controls = new THREE.PointerLockControls(camera, document.body);
    
    // Click to enable controls
    renderer.domElement.addEventListener('click', function() {
        controls.lock();
    });
    
    controls.addEventListener('lock', function() {
        console.log('Controls locked');
    });
    
    controls.addEventListener('unlock', function() {
        console.log('Controls unlocked');
    });
}

// Create scene objects
function createObjects() {
    // Create custom shader material for relativistic effects
    function createRelativisticMaterial(color) {
        return new THREE.ShaderMaterial({
            uniforms: {
                lightPos: { value: new THREE.Vector3(5, 5, 5) },
                lightColor: { value: new THREE.Vector3(1, 1, 1) },
                objectColor: { value: new THREE.Color(color) },
                morphFactor: { value: morphFactor },
                motionDir: { value: motionDir.clone() },
                cameraPosition: { value: camera.position.clone() },
                modelMatrix: { value: new THREE.Matrix4() },
                viewMatrix: { value: new THREE.Matrix4() },
                normalMatrix: { value: new THREE.Matrix3() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });
    }

    // Create cubes in a grid pattern for better visibility of the relativistic effects
    const spacing = 3;
    const gridSize = 3;
    const halfGrid = Math.floor(gridSize / 2);
    
    // Create cubes
    for (let x = -halfGrid; x <= halfGrid; x++) {
        for (let z = -halfGrid; z <= halfGrid; z++) {
            // Skip center position where camera is
            if (x === 0 && z === 0) continue;
            
            const xPos = x * spacing;
            const zPos = -10 + z * spacing; // Start grid 10 units in front of camera
            
            // Create cube with relativistic material
            const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
            const material = createRelativisticMaterial(0x0033AA); // Deep blue
            const cube = new THREE.Mesh(cubeGeometry, material);
            cube.position.set(xPos, 0, zPos);
            scene.add(cube);
            objects.push(cube);
        }
    }
    
    // Add some pyramids
    const pyramidGeometry = new THREE.ConeGeometry(1, 2, 4);
    
    const pyramid1 = new THREE.Mesh(
        pyramidGeometry,
        createRelativisticMaterial(0xAA3300) // Orange
    );
    pyramid1.position.set(-5, 0, -8);
    scene.add(pyramid1);
    objects.push(pyramid1);
    
    const pyramid2 = new THREE.Mesh(
        pyramidGeometry,
        createRelativisticMaterial(0xAA3300) // Orange
    );
    pyramid2.position.set(5, 0, -8);
    scene.add(pyramid2);
    objects.push(pyramid2);
    
    // Add spheres
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    
    const sphere1 = new THREE.Mesh(
        sphereGeometry,
        createRelativisticMaterial(0x33AA00) // Green
    );
    sphere1.position.set(0, 0, -15);
    scene.add(sphere1);
    objects.push(sphere1);
    
    const sphere2 = new THREE.Mesh(
        sphereGeometry,
        createRelativisticMaterial(0x33AA00) // Green
    );
    sphere2.position.set(-4, 0, -15);
    scene.add(sphere2);
    objects.push(sphere2);
    
    // Create a large hollow cube (with no front/back face) to show relativistic effects
    createHollowCube(20, 10, -30, 0x6666AA);
    
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = createRelativisticMaterial(0x555555);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    scene.add(floor);
    objects.push(floor);
    
    console.log("Created objects:", objects.length);
}

// Create a hollow cube (box with no front/back faces)
function createHollowCube(size, y, z, color) {
    const halfSize = size / 2;
    
    // Create material
    const material = new THREE.ShaderMaterial({
        uniforms: {
            lightPos: { value: new THREE.Vector3(5, 5, 5) },
            lightColor: { value: new THREE.Vector3(1, 1, 1) },
            objectColor: { value: new THREE.Color(color) },
            morphFactor: { value: morphFactor },
            motionDir: { value: motionDir.clone() },
            cameraPosition: { value: camera.position.clone() },
            modelMatrix: { value: new THREE.Matrix4() },
            viewMatrix: { value: new THREE.Matrix4() },
            normalMatrix: { value: new THREE.Matrix3() }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide
    });
    
    // Top face
    const topGeometry = new THREE.PlaneGeometry(size, size);
    const topPlane = new THREE.Mesh(topGeometry, material.clone());
    topPlane.rotation.x = Math.PI / 2;
    topPlane.position.set(0, y + halfSize, z);
    scene.add(topPlane);
    objects.push(topPlane);
    
    // Bottom face
    const bottomGeometry = new THREE.PlaneGeometry(size, size);
    const bottomPlane = new THREE.Mesh(bottomGeometry, material.clone());
    bottomPlane.rotation.x = -Math.PI / 2;
    bottomPlane.position.set(0, y - halfSize, z);
    scene.add(bottomPlane);
    objects.push(bottomPlane);
    
    // Left face
    const leftGeometry = new THREE.PlaneGeometry(size, size);
    const leftPlane = new THREE.Mesh(leftGeometry, material.clone());
    leftPlane.rotation.y = Math.PI / 2;
    leftPlane.position.set(-halfSize, y, z);
    scene.add(leftPlane);
    objects.push(leftPlane);
    
    // Right face
    const rightGeometry = new THREE.PlaneGeometry(size, size);
    const rightPlane = new THREE.Mesh(rightGeometry, material.clone());
    rightPlane.rotation.y = -Math.PI / 2;
    rightPlane.position.set(halfSize, y, z);
    scene.add(rightPlane);
    objects.push(rightPlane);
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
    
    // Update all objects with new morphFactor
    objects.forEach(obj => {
        if (obj.material.uniforms) {
            obj.material.uniforms.morphFactor.value = morphFactor;
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

// Handle key down
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
        case 'KeyE':
            // Increase speed
            morphFactor = Math.min(0.99, morphFactor + 0.01);
            document.getElementById('speed-slider').value = morphFactor;
            document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
            updateSpeed();
            break;
        case 'PageDown':
        case 'KeyQ':
            // Decrease speed
            morphFactor = Math.max(0, morphFactor - 0.01);
            document.getElementById('speed-slider').value = morphFactor;
            document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
            updateSpeed();
            break;
    }
}

// Handle key up
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
    
    const delta = clock.getDelta();
    
    // Process movement
    if (controls.isLocked) {
        const moveSpeed = 5.0 * delta;
        
        velocity.x = 0;
        velocity.z = 0;
        
        if (moveForward) velocity.z -= moveSpeed;
        if (moveBackward) velocity.z += moveSpeed;
        if (moveLeft) velocity.x -= moveSpeed;
        if (moveRight) velocity.x += moveSpeed;
        
        controls.moveRight(velocity.x);
        controls.moveForward(velocity.z);
    }
    
    // Update motion direction from camera
    motionDir.copy(camera.getWorldDirection(new THREE.Vector3()));
    
    // Update all objects
    objects.forEach(obj => {
        if (obj.material.uniforms) {
            // Update camera position
            obj.material.uniforms.cameraPosition.value.copy(camera.position);
            
            // Update model matrix
            obj.updateWorldMatrix(true, false);
            obj.material.uniforms.modelMatrix.value.copy(obj.matrixWorld);
            
            // Update normal matrix
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
            obj.material.uniforms.normalMatrix.value.copy(normalMatrix);
            
            // Update view matrix
            camera.updateMatrixWorld();
            const viewMatrix = camera.matrixWorldInverse.clone();
            obj.material.uniforms.viewMatrix.value.copy(viewMatrix);
            
            // Update motion direction
            obj.material.uniforms.motionDir.value.copy(motionDir);
        }
    });
    
    // Render scene
    renderer.render(scene, camera);
}

// Initialize the app when the page loads
window.onload = init;