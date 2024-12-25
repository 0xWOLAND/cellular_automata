import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 20;

const juliaShader = {
    uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2() },
        quaternionC: { value: new THREE.Vector4(-0.2, 0.4, -0.4, -0.4) }
    },
    vertexShader: `
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        
        void main() {
            vPosition = position;
            vNormal = normal;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec2 resolution;
        uniform float time;
        uniform vec4 quaternionC;
        
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        #define MAX_STEPS 512
        #define MIN_DIST 0.0001
        #define MAX_DIST 40.0
        #define ITERATIONS 20
        #define STEP_SCALE 0.45

        vec4 qmul(vec4 a, vec4 b) {
            return vec4(
                a.x*b.x - a.y*b.y - a.z*b.z - a.w*b.w,
                a.x*b.y + a.y*b.x + a.z*b.w - a.w*b.z,
                a.x*b.z - a.y*b.w + a.z*b.x + a.w*b.y,
                a.x*b.w + a.y*b.z - a.z*b.y + a.w*b.x
            );
        }

        float DE(vec3 pos) {
            vec4 z = vec4(pos, 0.0);
            vec4 c = quaternionC;
            float t = time * 0.2;
            c = vec4(
                quaternionC.x * cos(t) - quaternionC.y * sin(t),
                quaternionC.x * sin(t) + quaternionC.y * cos(t),
                quaternionC.z * cos(t * 0.7) - quaternionC.w * sin(t * 0.7),
                quaternionC.z * sin(t * 0.7) + quaternionC.w * cos(t * 0.7)
            );
            
            float dr = 1.0;
            float r = 0.0;
            
            for(int i = 0; i < ITERATIONS; i++) {
                r = length(z);
                if(r > 4.0) break;
                dr = 2.0 * r * dr + 1.0;
                z = qmul(z, z) + c;
            }
            
            return 0.5 * log(r) * r / dr;
        }

        vec3 getNormal(vec3 p) {
            vec2 e = vec2(MIN_DIST, 0.0);
            return normalize(vec3(
                DE(p + e.xyy) - DE(p - e.xyy),
                DE(p + e.yxy) - DE(p - e.yxy),
                DE(p + e.yyx) - DE(p - e.yyx)
            ));
        }

        float rayMarch(vec3 ro, vec3 rd) {
            float t = 0.0;
            float d;
            float minD = MAX_DIST;
            
            for(int i = 0; i < MAX_STEPS; i++) {
                vec3 p = ro + rd * t;
                d = DE(p) * STEP_SCALE;
                minD = min(minD, d);
                
                if(d < MIN_DIST) return t;
                if(t > MAX_DIST) break;
                
                t += d;
            }
            
            if(minD < 0.1) return t;
            return MAX_DIST;
        }

        vec3 palette(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.263, 0.416, 0.557);
            return a + b * cos(6.28318 * (c * t + d + time * 0.1));
        }

        void main() {
            vec3 rd = normalize(vWorldPosition - cameraPosition);
            rd = normalize(rd + vNormal * 0.01);
            
            float t = rayMarch(cameraPosition, rd);
            vec3 col = vec3(0.0);
            
            if(t < MAX_DIST) {
                vec3 p = cameraPosition + rd * t;
                vec3 n = getNormal(p);
                
                vec3 light1 = normalize(vec3(sin(time), 1.0, cos(time)));
                vec3 light2 = normalize(vec3(-0.707, 0.707, 0.0));
                
                float diff1 = max(dot(n, light1), 0.0);
                float diff2 = max(dot(n, light2), 0.0);
                
                float spec1 = pow(max(dot(reflect(-light1, n), -rd), 0.0), 32.0);
                float spec2 = pow(max(dot(reflect(-light2, n), -rd), 0.0), 32.0);
                
                vec3 baseColor = palette(length(p) * 0.5 + dot(n, vec3(1.0)) * 0.5);
                
                col = baseColor * (
                    0.2 +
                    0.4 * diff1 +
                    0.2 * diff2
                ) + vec3(0.8) * (spec1 + spec2) * 0.5;
                
                float glow = exp(-length(p) * 1.5);
                col += baseColor * glow * 0.3;
            }
            
            gl_FragColor = vec4(col, 1.0);
        }
    `
};

const geometry = new THREE.SphereGeometry(3, 128, 128);
const material = new THREE.ShaderMaterial({
    ...juliaShader,
    side: THREE.DoubleSide,
    transparent: true
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

camera.position.set(1, 1, 1);
camera.lookAt(0, 0, 0);

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    material.uniforms.time.value = time * 0.001;
    material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});

animate(0);
