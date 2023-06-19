import GUI from "lil-gui";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "three/examples/jsm/libs/stats.module";
import * as animations from "./helpers/animations";
import { resizeRendererToDisplaySize } from "./helpers/responsiveness";

import "./style.css";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer";

//Shader imports
//@ts-ignore
import fragmentShader from "./shaders/fragment.glsl";
//@ts-ignore
import vertexShader from "./shaders/vertexParticles.glsl";
//@ts-ignore
import fragmentSimulationShader from "./shaders/fragmentSimulation.glsl";

const CANVAS_ID = "scene";
const WIDTH = 768;

//GPGPU
let gpuCompute: GPUComputationRenderer;
let positionVariable: any;

//Scene
let canvas: HTMLElement;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;

//Meshes
const globalUniforms = {
  uTime: { value: 0 },
};

let planeMesh: THREE.Points;

//Camera
let camera: THREE.PerspectiveCamera;
let cameraControls: OrbitControls;

//Utilities
let loadingManager: THREE.LoadingManager;
let clock: THREE.Clock;

//Debugging
let stats: Stats;
let gui: GUI;

const animation = { enabled: false, play: true };

init();
animate();

function init() {
  // ===== 🖼️ CANVAS, RENDERER, & SCENE =====
  {
    canvas = document.querySelector(`canvas#${CANVAS_ID}`)!;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
  }

  // ===== 👨🏻‍💼 LOADING MANAGER =====
  {
    loadingManager = new THREE.LoadingManager();

    loadingManager.onStart = () => {
      console.log("loading started");
    };
    loadingManager.onProgress = (url, loaded, total) => {
      console.log("loading in progress:");
      console.log(`${url} -> ${loaded} / ${total}`);
    };
    loadingManager.onLoad = () => {
      console.log("loaded!");
    };
    loadingManager.onError = () => {
      console.log("❌ error while loading");
    };
  }

  // ===== 📦 OBJECTS =====
  {
    const planeMaterialUniforms = {
      uTime: globalUniforms.uTime,
      positionTexture: { value: null },
    };
    const planeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: planeMaterialUniforms,
    });

    const planeGeometry = new THREE.BufferGeometry();
    let positions = new Float32Array(WIDTH * WIDTH * 3);
    let reference = new Float32Array(WIDTH * WIDTH * 2);
    let randomSize = new Float32Array(WIDTH * WIDTH);

    for (let i = 0; i < WIDTH * WIDTH; i++) {
      let x = Math.random();
      let y = Math.random();
      let z = Math.random();
      let xx = (i % WIDTH) / WIDTH;
      let yy = ~~(i / WIDTH) / WIDTH;

      positions.set([x, y, z], i * 3);
      reference.set([xx, yy], i * 2);
      randomSize.set([Math.random()], i);
    }

    planeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    planeGeometry.setAttribute(
      "reference",
      new THREE.BufferAttribute(reference, 2)
    );
    planeGeometry.setAttribute(
      "randomSize",
      new THREE.BufferAttribute(randomSize, 1)
    );

    planeMesh = new THREE.Points(planeGeometry, planeMaterial);

    const geometry = new THREE.CylinderGeometry(
      5,
      8,
      10,
      64 * 10,
      64 * 10,
      true
    );
    // geometry.rotateZ(Math.PI / 2);
    geometry.rotateX(Math.PI / 2);

    const facePosition = geometry.attributes.position.array;
    const faceNum = facePosition.length / 3;

    // ===== 📊 GPGPU =====

    gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    const dtPosition = gpuCompute.createTexture();
    fillPosition(dtPosition);

    positionVariable = gpuCompute.addVariable(
      "texturePosition",
      fragmentSimulationShader,
      dtPosition
    );
    positionVariable.material.uniforms.uTime = {
      value: globalUniforms.uTime,
    };
    positionVariable.material.uniforms.power = { value: 0.0 };
    positionVariable.material.uniforms.frequency = { value: 0.35 };
    positionVariable.material.uniforms.amplitude = { value: 0.9 };
    positionVariable.material.uniforms.maxDistance = { value: 3 };

    positionVariable.wrapS = THREE.RepeatWrapping;
    positionVariable.wrapT = THREE.RepeatWrapping;
    const error = gpuCompute.init();

    if (error !== null) {
      console.error(error);
    }

    function fillPosition(texture: THREE.DataTexture) {
      let theArray = texture.image.data;
      for (let i = 0; i < theArray.length; i += 4) {
        let rand = Math.floor(Math.random() * faceNum);

        let x = facePosition[rand * 3 + 0];
        let y = facePosition[rand * 3 + 1];
        let z = facePosition[rand * 3 + 2];

        theArray[i + 0] = x;
        theArray[i + 1] = y;
        theArray[i + 2] = z;
        theArray[i + 3] = 1;
      }
    }

    scene.add(planeMesh);
  }

  // ===== 🎥 CAMERA =====
  {
    camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 0, 20);
  }

  // ===== 🕹️ CONTROLS =====
  {
    cameraControls = new OrbitControls(camera, canvas);
    // cameraControls.target = planeMesh.position.clone();
    cameraControls.enableDamping = true;
    cameraControls.enableRotate = false;
    cameraControls.autoRotate = false;
    cameraControls.maxDistance = 30;
    cameraControls.minDistance = 10;
    cameraControls.autoRotateSpeed = 0.5;
    cameraControls.update();
  }

  // ===== 📈 STATS & CLOCK =====
  {
    clock = new THREE.Clock();
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // ==== 🐞 DEBUG GUI ====
  {
    gui = new GUI({ title: "◯", width: 300 });

    //noise folder
    const noiseFolder = gui.addFolder("Noise");
    noiseFolder
      .add(positionVariable.material.uniforms.frequency, "value", 0, 1)
      .name("Frequency")
      .onChange(() => {
        gpuCompute.init();
      });
    noiseFolder
      .add(positionVariable.material.uniforms.amplitude, "value", 0, 3)
      .name("Amplitude")
      .onChange(() => {
        gpuCompute.init();
      });
    noiseFolder
      .add(positionVariable.material.uniforms.maxDistance, "value", 0.1, 5)
      .name("Max Distance (small = more distance)")
      .onChange(() => {
        gpuCompute.init();
      });
    function restartSimulation() {
      gpuCompute.init();
    }
    noiseFolder
      .add({ restartSimulation: restartSimulation }, "restartSimulation")
      .name("Restart Simulation");

    const cameraFolder = gui.addFolder("Camera");
    cameraFolder.add(cameraControls, "autoRotate");
    function restartCamera() {
      cameraControls.reset();
    }
    cameraFolder
      .add({ restartCamera: restartCamera }, "restartCamera")
      .name("Reset Camera");

    gui.close();
  }
}

function animate() {
  requestAnimationFrame(animate);

  stats.update();

  if (animation.enabled && animation.play) {
    animations.rotate(planeMesh, clock, Math.PI / 3);
    animations.bounce(planeMesh, clock, 1, 0.5, 0.5);
  }

  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  if (gpuCompute) {
    gpuCompute.compute();

    // Update uniforms
    //@ts-ignore
    planeMesh.material.uniforms.positionTexture.value =
      gpuCompute.getCurrentRenderTarget(positionVariable).texture;
  }
  globalUniforms.uTime.value = clock.getElapsedTime();

  cameraControls.update();

  renderer.render(scene, camera);
}
