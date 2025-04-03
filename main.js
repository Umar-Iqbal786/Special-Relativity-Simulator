//vertex shader with relativistic effects
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
        vec3 newViewDir;
        vec3 t = 2.0 * cross(vec3(q), viewDir);
        newViewDir = viewDir + q.w * t + cross(vec3(q), t);
        
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

//fragment shader for phong lighting
const fragmentShader = `
uniform vec3 lightPos;
uniform vec3 lightColor;
uniform vec3 objectColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    // Ambient
    float ambientStrength = 0.1;
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

//initialize scene, camera, renderer
let scene, camera, renderer;
let controls, moveForward, moveBackward, moveLeft, moveRight;
let velocity, prevTime;
let morphFactor = 0; //v/c ratio
let motionDir = new THREE.Vector3(0, 0, -1);
let objects = []; //array to store scene objects
let raycaster;

//setup clock for framerate independent movement
const clock = new THREE.Clock();

//initialize the scene
function init() {
    //create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    //create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Position camera at average eye height
    
    //create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').prepend(renderer.domElement);
    
    //add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    //setup controls
    setupControls();
    
    //create scene objects
    createObjects();
    
    //add event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.getElementById('speed-slider').addEventListener('input', updateSpeed);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    
    //add keyboard controls
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    
    //initialize time and movement
    prevTime = performance.now();
    velocity = new THREE.Vector3();
    moveForward = moveBackward = moveLeft = moveRight = false;
    
    //start animation
    animate();
}

//set up controls for camera movement
function setupControls() {
    //first-person controls
    controls = new THREE.PointerLockControls(camera, document.body);
    
    //click to start controls
    document.addEventListener('click', function() {
        if (!controls.isLocked) {
            controls.lock();
        }
    });
    
    //setup movement variables
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);
}

//create objects in the scene
function createObjects() {
    //create relativistic material
    const deepBlue = new THREE.Color(0x00196B); // Deep blue color from image
    
    const relativeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            lightPos: { value: new THREE.Vector3(5, 5, 5) },
            lightColor: { value: new THREE.Vector3(1, 1, 1) },
            objectColor: { value: new THREE.Vector3(deepBlue.r, deepBlue.g, deepBlue.b) },
            morphFactor: { value: morphFactor },
            motionDir: { value: motionDir },
            cameraPosition: { value: new THREE.Vector3() },
            modelMatrix: { value: new THREE.Matrix4() },
            viewMatrix: { value: new THREE.Matrix4() },
            normalMatrix: { value: new THREE.Matrix3() }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    
    //create cubes
    const cubePositions = [
        [0, 0, 0],
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
        const material = relativeMaterial.clone();
        const cube = new THREE.Mesh(cubeGeometry, material);
        cube.position.set(pos[0], pos[1], pos[2]);
        cube.rotation.set(0, 0.2 * i, 0.3 * i);
        scene.add(cube);
        objects.push(cube);
    });
    
    //create pyramids
    const pyramidPositions = [
        [5.0, 2.0, -5.0],
        [-5.0, 1.0, -3.0]
    ];
    
    const pyramidGeometry = new THREE.ConeGeometry(1, 2, 4);
    
    pyramidPositions.forEach((pos, i) => {
        const material = relativeMaterial.clone();
        const pyramid = new THREE.Mesh(pyramidGeometry, material);
        pyramid.position.set(pos[0], pos[1], pos[2]);
        pyramid.rotation.set(0, 0.3 * i, 0);
        scene.add(pyramid);
        objects.push(pyramid);
    });
    
    //create spheres
    const spherePositions = [
        [4.0, 1.0, -7.0],
        [-3.0, 2.0, -4.0]
    ];
    
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    
    spherePositions.forEach((pos) => {
        const material = relativeMaterial.clone();
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(pos[0], pos[1], pos[2]);
        scene.add(sphere);
        objects.push(sphere);
    });
    
    //create floor
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

//handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

//update relativistic speed
function updateSpeed(e) {
    if (e) {
        morphFactor = parseFloat(e.target.value);
        document.getElementById('speed-value').textContent = morphFactor.toFixed(2);
    }
    
    //update all objects with new morphFactor
    objects.forEach(obj => {
        if (obj.material.type === 'ShaderMaterial') {
            obj.material.uniforms.morphFactor.value = morphFactor;
            
            //calculate motion direction from camera
            motionDir.copy(camera.getWorldDirection(new THREE.Vector3()));
            obj.material.uniforms.motionDir.value = motionDir;
        }
    });
}

//toggle fullscreen
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

//handle keyboard input
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
        //arrow keys for speed adjustment
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

//animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (controls.isLocked) {
        //get time delta
        const delta = clock.getDelta();
        
        //movement speed (adjust as needed)
        const moveSpeed = 5.0 * delta;
        
        //update velocity based on inputs
        velocity.x = 0;
        velocity.z = 0;
        
        if (moveForward) velocity.z -= moveSpeed;
        if (moveBackward) velocity.z += moveSpeed;
        if (moveLeft) velocity.x -= moveSpeed;
        if (moveRight) velocity.x += moveSpeed;
        
        //move the camera
        controls.moveRight(velocity.x);
        controls.moveForward(velocity.z);
        
        //update motion direction and relativistic effects
        updateSpeed();
    }
    
    // Update material uniforms for each object
    objects.forEach(obj => {
        if (obj.material.type === 'ShaderMaterial') {
            // Update camera-related uniforms
            obj.material.uniforms.cameraPosition.value.copy(camera.position);
            
            // Update matrices
            obj.updateMatrixWorld();
            obj.material.uniforms.modelMatrix.value.copy(obj.matrixWorld);
            
            // Calculate and set normal matrix
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
            obj.material.uniforms.normalMatrix.value.copy(normalMatrix);
            
            // Set view matrix
            camera.updateMatrixWorld();
            const viewMatrix = new THREE.Matrix4().copy(camera.matrixWorldInverse);
            obj.material.uniforms.viewMatrix.value.copy(viewMatrix);
            
            // Update motion direction from camera
            motionDir.copy(camera.getWorldDirection(new THREE.Vector3()));
            obj.material.uniforms.motionDir.value.copy(motionDir);
        }
    });
    
    renderer.render(scene, camera);
}

//start the application
init();