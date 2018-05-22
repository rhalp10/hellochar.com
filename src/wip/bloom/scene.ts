import * as THREE from "three";

const SHOW_HELPERS = false;

const scene = new THREE.Scene();
// const fog = new THREE.FogExp2(0x000000, 0.1);
// const fog = new THREE.Fog(0x000000, 10, 30);
// scene.fog = fog;
// scene.background = new THREE.Color(0xffffff);

// const cube = new THREE.Mesh(
//     new THREE.BoxBufferGeometry(100, 100, 100);
// const
const sky = (() => {
    const sky = new THREE.Sky();
    sky.scale.setScalar(25);
    // const uniforms = sky.material.uniforms;
    // uniforms.turbidity.value = 1;
    // uniforms.rayleigh.value = 0.3;
    // uniforms.mieCoefficient.value = 0.008;
    // uniforms.mieDirectionalG.value = 0.87;
    // uniforms.luminance.value = 1.01;
    // // uniforms.inclination.value = .12;
    // // uniforms.azimuth.value = 0.25;
    const theta = Math.PI * (0.12 - 0.5);
    const phi = 2 * Math.PI * (0.25 - 0.5);

    const distance = 4000;
    sky.material.uniforms.sunPosition.value.set(
        distance * Math.cos(phi),
        distance * Math.sin(phi) * Math.sin(theta),
        distance * Math.sin(phi) * Math.cos(theta),
    );
    return sky;
})();
scene.add(sky);

const groundGeom = new THREE.CircleBufferGeometry(8, 120);
// const groundGeom = new THREE.PlaneGeometry(100, 100, 100, 100);
groundGeom.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(groundGeom, new THREE.MeshLambertMaterial({
    // color: new THREE.Color("rgb(45, 29, 3)"),
    side: THREE.DoubleSide,
    color: new THREE.Color("rgb(220, 220, 231)"),
    dithering: true,
}));
ground.receiveShadow = true;
scene.add(ground);
if (SHOW_HELPERS) {
    scene.add(new THREE.AxesHelper(10));
}

const hemisphereLight = new THREE.HemisphereLight("rgb(173, 216, 230)", "rgb(60, 60, 80)", 0.3);
// const light = new THREE.HemisphereLight("rgb(173, 216, 230)", "rgb(210, 250, 255)", 0.3);
scene.add(hemisphereLight);

const ambientLight = new THREE.AmbientLight("rgb(173, 216, 230)", 0.4);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(
    "rgb(234, 249, 244)",
    1.3,
    200,
    Math.PI / 30,
    1.0,
    1.25,
);
spotLight.position.set(10, 100, 10);

spotLight.castShadow = true;

spotLight.shadow.mapSize.width = 2048 * 2;
spotLight.shadow.mapSize.height = 2048 * 2;

spotLight.shadow.bias = -0.001; // try not to make leaves self-shadow
spotLight.shadow.radius = 1.5; // 1 is normal; 1.5 makes it a bit blurrier
spotLight.shadow.camera.near = 90;
spotLight.shadow.camera.far = 101;
spotLight.shadow.camera.fov = 12;
spotLight.shadow.camera.updateProjectionMatrix();

scene.add(spotLight);

if (SHOW_HELPERS) {
    const spotLightHelper = new THREE.SpotLightHelper(spotLight);
    scene.add(spotLightHelper);

    const shadowCameraHelper = new THREE.CameraHelper(spotLight.shadow.camera);
    scene.add(shadowCameraHelper);
}

const particles = (() => {
    const geom = new THREE.Geometry();
    for (let i = 0; i < 10000; i++) {
        const vertex = new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30, Math.random() * 30 - 15);
        vertex.multiplyScalar(0.25);
        geom.vertices.push(vertex);
    }
    geom.verticesNeedUpdate = true;
    const points = new THREE.Points(
        geom,
        new THREE.PointsMaterial({
            color: "rgb(249, 237, 69)",
            transparent: true,
            opacity: 0.25,
            size: 0.01,
            sizeAttenuation: true,
        }),
    );
    // points.castShadow = true;
    return points;
})();
scene.add(particles);

export default scene;
