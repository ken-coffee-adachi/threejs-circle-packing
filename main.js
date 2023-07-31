import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from "three/addons/libs/stats.module.js";

let camera, scene, renderer, stats;
let container, raycaster;
let mesh, material, vehicles;

const pointer = new THREE.Vector2(-1, -1);
const mouse = new THREE.Vector3();
const loading = document.getElementById("loading");

init();
loading.style.display = "none";

animate();

function init() {
  container = document.getElementById("canvas");
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    27,
    window.innerWidth / window.innerHeight,
    1,
    3500
  );
  camera.position.set(0, 30, 60);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(15, 15, 15);
  light.castShadow = true;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 50;
  light.shadow.camera.left = -19;
  light.shadow.camera.bottom = -15;
  light.shadow.camera.right = 19;
  light.shadow.camera.top = 15;
  scene.add(light);

  // const helper = new THREE.CameraHelper(light.shadow.camera);
  // scene.add(helper);

  const size = 12;
  const text = "CANDY";
  const spots = prepareSpots({ text, size: size * text.length });
  const circles = calculatePositions(spots);

  vehicles = new Vehicles(circles);
  console.log(vehicles.count);
  setupMesh();

  //

  raycaster = new THREE.Raycaster();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  stats = new Stats();
  document.body.appendChild(stats.dom);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();

  //

  document.addEventListener("mousemove", onPointerMove);
  window.addEventListener("resize", onWindowResize);
}

function prepareSpots({ text, size }) {
  const width = 512;
  const height = 512;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  const fontSize = (height * 1.1) / text.length;
  context.font = `bold ${fontSize}px Helvetica`;
  context.textAlign = "center";

  const measure = context.measureText(text);
  const tHeight =
    measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent;

  context.beginPath();
  context.fillStyle = "rgb(255, 255, 255)";
  context.fillText(text, width / 2, (height + tHeight) / 2);

  const pixels = context.getImageData(0, 0, width, height);
  const spots = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const index = x + y * width;
      const r = pixels.data[index * 4];
      if (r > 1) {
        spots.push({
          x: ((x - width / 2) * size) / width,
          y: ((height - y - 1 - height / 2) * size) / height,
        });
      }
    }
  }

  return spots;
}

function calculatePositions(spots) {
  const initial = 0.18;

  const addCircle = (function () {
    const vec_self = new THREE.Vector3();
    const vec_other = new THREE.Vector3();

    return function ({ spots, circles, step }) {
      const rInd = THREE.MathUtils.randInt(0, spots.length - 1);
      const { x, y } = spots[rInd];
      vec_self.set(x, y, THREE.MathUtils.randFloatSpread(4.0));
      let valid = true;
      for (let i = 0; i < circles.length; i++) {
        const other = circles[i];
        vec_other.set(other.x, other.y, other.z);
        const dist = vec_self.distanceTo(vec_other);
        if (dist < step + other.r) {
          valid = false;
          break;
        }
      }

      if (valid) {
        circles.push({
          x: vec_self.x,
          y: vec_self.y,
          z: vec_self.z,
          r: initial,
          growing: true,
        });
      }

      return valid;
    };
  })();

  const growCircles = (function () {
    const vec_self = new THREE.Vector3();
    const vec_other = new THREE.Vector3();

    return function ({ circles, step }) {
      for (let i = 0; i < circles.length; i++) {
        const self = circles[i];
        if (!self.growing) continue;

        vec_self.set(self.x, self.y, self.z);
        for (let j = 0; j < circles.length; j++) {
          if (i !== j) {
            const other = circles[j];
            vec_other.set(other.x, other.y, other.z);
            const dist = vec_self.distanceTo(vec_other);
            if (dist < self.r + other.r + step) {
              self.growing = false;
              break;
            }
          }
        }

        if (self.growing) {
          self.r += step;
        }
      }
    };
  })();

  let circles = [];
  let finished = false;
  const limit = 100;
  const attemptsLimit = 500;
  while (true) {
    let count = 0;
    let attempts = 0;
    while (count < limit) {
      attempts++;
      if (
        addCircle({
          spots,
          circles,
          step: initial,
        })
      ) {
        count++;
      }

      if (attempts > attemptsLimit) {
        finished = true;
        break;
      }
    }

    growCircles({ circles, step: initial });

    if (finished) {
      break;
    }
  }

  circles = circles.map((c) => {
    return { ...c, growing: true };
  });
  while (true) {
    const grows = circles.filter((c) => c.growing);
    if (grows.length !== 0) {
      growCircles({ circles, step: 0.001 });
    } else {
      break;
    }
  }

  return circles;
}

function Vehicles(circles) {
  const positions = [];
  const velocities = [];

  for (let i = 0; i < circles.length; i++) {
    positions.push(
      THREE.MathUtils.randFloatSpread(120),
      THREE.MathUtils.randFloatSpread(70),
      THREE.MathUtils.randFloatSpread(70)
    );
    velocities.push(
      THREE.MathUtils.randFloatSpread(1),
      THREE.MathUtils.randFloatSpread(1),
      THREE.MathUtils.randFloatSpread(1)
    );
  }

  const maxspeed = 0.5;
  const maxforce = 0.05;

  const arrive = (function () {
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const threshold = 10;

    return function ({ i, steer }) {
      const { x, y, z } = circles[i];
      const ind = i * 3;
      pos.set(positions[ind], positions[ind + 1], positions[ind + 2]);
      vel.set(velocities[ind], velocities[ind + 1], velocities[ind + 2]);
      desired.set(x, y, z).sub(pos);
      const len = desired.length();
      let speed = maxspeed;
      if (len < threshold) {
        speed = THREE.MathUtils.mapLinear(len, 0, threshold, 0, maxspeed);
      }
      desired.setLength(speed);
      steer.copy(desired).sub(vel).clampLength(0, maxforce);
    };
  })();

  const flee = (function () {
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const zero = new THREE.Vector3();
    const threshold = 5;

    return function ({ i, source, steer }) {
      const ind = i * 3;
      pos.set(positions[ind], positions[ind + 1], positions[ind + 2]);
      vel.set(velocities[ind], velocities[ind + 1], velocities[ind + 2]);
      desired.copy(source).sub(pos);
      const len = desired.length();
      if (len < threshold) {
        desired.setLength(maxspeed);
        steer
          .copy(desired)
          .sub(vel)
          .clampLength(0, maxforce)
          .multiplyScalar(2.5);
      } else {
        steer.copy(zero);
      }
    };
  })();

  this.behaviors = (function () {
    const steer_ar = new THREE.Vector3();
    const steer_fl = new THREE.Vector3();
    const acc = new THREE.Vector3();
    const matrix = new THREE.Matrix4();

    return function ({ mouse, mesh }) {
      for (let i = 0; i < circles.length; i++) {
        arrive({ i, steer: steer_ar });
        flee({ i, source: mouse, steer: steer_fl });
        acc.copy(steer_ar).sub(steer_fl);

        const ind = i * 3;
        positions[ind] += velocities[ind];
        positions[ind + 1] += velocities[ind + 1];
        positions[ind + 2] += velocities[ind + 2];

        velocities[ind] += acc.x;
        velocities[ind + 1] += acc.y;
        velocities[ind + 2] += acc.z;

        const { r } = circles[i];
        matrix.makeScale(r, r, r);
        matrix.setPosition(
          positions[ind],
          positions[ind + 1],
          positions[ind + 2]
        );
        mesh.setMatrixAt(i, matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    };
  })();

  this.count = circles.length;
  this.getProps = function (i) {
    const ind = i * 3;
    const { r } = circles[i];
    const x = positions[ind];
    const y = positions[ind + 1];
    const z = positions[ind + 2];

    return { x, y, z, r };
  };
}

function setupMesh() {
  const geometry = new THREE.IcosahedronGeometry(1.0, 3);
  material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    roughness: 0.5,
  });
  mesh = new THREE.InstancedMesh(geometry, material, vehicles.count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color(1, 1, 1);

  for (let i = 0; i < vehicles.count; i++) {
    const { x, y, z, r } = vehicles.getProps(i);
    matrix.makeScale(r, r, r);
    matrix.setPosition(x, y, z);
    mesh.setMatrixAt(i, matrix);

    color.setHSL(Math.random(), 1.0, 0.5);
    mesh.setColorAt(i, color);
  }

  scene.add(mesh);
}

function onPointerMove(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setMouse() {
  camera.updateMatrixWorld();

  raycaster.setFromCamera(pointer, camera);
  const k = -raycaster.ray.origin.z / raycaster.ray.direction.z;
  mouse
    .copy(raycaster.ray.direction)
    .multiplyScalar(k)
    .add(raycaster.ray.origin);
}

function animate() {
  requestAnimationFrame(animate);

  render();
  stats.update();
}

function render() {
  setMouse();
  vehicles.behaviors({ mouse, mesh });

  renderer.render(scene, camera);
}
