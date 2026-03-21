import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAudio } from "@/contexts/AudioContext";

const PARTICLE_COUNT = 12000;
const SWARM_RADIUS = 5;

// Warm palette matching the site
const PALETTE = [
  new THREE.Color("hsl(35, 90%, 65%)"),   // amber
  new THREE.Color("hsl(30, 80%, 55%)"),   // deep gold
  new THREE.Color("hsl(200, 50%, 55%)"),  // soft blue
  new THREE.Color("hsl(340, 45%, 50%)"),  // dusty rose
  new THREE.Color("hsl(15, 60%, 50%)"),   // terracotta
  new THREE.Color("hsl(45, 70%, 70%)"),   // pale gold
];

interface Props {
  scrollProgress: number;
  mouseX: number;
  mouseY: number;
}

export default function ParticleField({ scrollProgress, mouseX, mouseY }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());
  const mouseRef = useRef({ x: 0, y: 0 });
  const scrollRef = useRef(0);
  const audioDataRef = useRef(new Float32Array(8));  // 8 frequency bands
  const { analyserRef } = useAudio();

  // Keep refs updated without re-rendering
  useEffect(() => {
    mouseRef.current = {
      x: (mouseX / window.innerWidth) * 2 - 1,
      y: -(mouseY / window.innerHeight) * 2 + 1,
    };
  }, [mouseX, mouseY]);

  useEffect(() => {
    scrollRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 6;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Particle geometry ---
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const basePositions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);     // per-particle phase offset
    const bandIndex = new Float32Array(PARTICLE_COUNT);  // which freq band drives this particle

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spherical distribution with some clustering
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SWARM_RADIUS * (0.2 + Math.pow(Math.random(), 0.6) * 0.8);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;

      const color = PALETTE[i % PALETTE.length];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = 1.5 + Math.random() * 3;
      phases[i] = Math.random() * Math.PI * 2;
      bandIndex[i] = Math.floor(Math.random() * 8);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aBand", new THREE.BufferAttribute(bandIndex, 1));
    geometry.setAttribute("basePosition", new THREE.BufferAttribute(basePositions, 3));

    // --- Shader material ---
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudioBands: { value: new Float32Array(8) },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uScroll: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float aPhase;
        attribute float aBand;
        attribute vec3 basePosition;

        uniform float uTime;
        uniform float uAudioBands[8];
        uniform vec2 uMouse;
        uniform float uScroll;
        uniform float uPixelRatio;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;

          int band = int(aBand);
          float audio = uAudioBands[band];

          // Organic swirling motion
          float t = uTime * 0.3;
          vec3 pos = basePosition;

          // Rotation around Y axis — slow orbit
          float angle = t * 0.15 + aPhase;
          float cosA = cos(angle);
          float sinA = sin(angle);
          pos = vec3(
            pos.x * cosA - pos.z * sinA,
            pos.y,
            pos.x * sinA + pos.z * cosA
          );

          // Organic displacement
          float wave = sin(t + aPhase * 3.0) * 0.3;
          float wave2 = cos(t * 0.7 + aPhase * 2.0) * 0.2;
          pos.x += wave;
          pos.y += wave2 + sin(t * 0.5 + pos.x * 0.5) * 0.15;
          pos.z += sin(t * 0.3 + aPhase) * 0.25;

          // Audio expansion — particles push outward on beats
          float expand = 1.0 + audio * 1.8;
          pos *= expand;

          // Audio vertical pulse
          pos.y += audio * sin(aPhase * 4.0) * 0.8;

          // Mouse attraction — subtle pull toward cursor
          vec3 mouseWorld = vec3(uMouse.x * 4.0, uMouse.y * 3.0, 0.0);
          vec3 toMouse = mouseWorld - pos;
          float mouseDist = length(toMouse);
          float mouseInfluence = smoothstep(4.0, 0.0, mouseDist) * 0.4;
          pos += toMouse * mouseInfluence;

          // Scroll-driven shape morphing — flatten to disc at scroll extremes
          float morph = sin(uScroll * 3.14159);
          pos.y *= mix(0.3, 1.0, morph);

          // Camera offset based on scroll
          pos.y -= uScroll * 2.0 - 1.0;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPos;

          // Size — closer = bigger, audio = bigger
          float sizeScale = size * (1.0 + audio * 3.0);
          gl_PointSize = sizeScale * uPixelRatio * (3.0 / -mvPos.z);
          gl_PointSize = clamp(gl_PointSize, 0.5, 20.0);

          // Alpha — fade with distance, brighten with audio
          float depth = smoothstep(15.0, 2.0, -mvPos.z);
          vAlpha = depth * (0.25 + audio * 0.75) * (0.6 + morph * 0.4);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Soft circle with glow falloff
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;

          float core = smoothstep(1.0, 0.2, d);
          float glow = exp(-d * d * 3.0);
          float alpha = (core * 0.5 + glow * 0.5) * vAlpha;

          // Slightly boost brightness at center
          vec3 col = vColor * (1.0 + core * 0.3);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;

    // --- Animation loop ---
    const animate = () => {
      const elapsed = clockRef.current.getElapsedTime();

      // Sample audio data
      const analyser = analyserRef.current;
      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        const bandSize = Math.floor(freqData.length / 8);
        for (let b = 0; b < 8; b++) {
          let sum = 0;
          for (let j = 0; j < bandSize; j++) {
            sum += freqData[b * bandSize + j];
          }
          const avg = sum / bandSize / 255;
          // Smooth: fast attack, slow release
          const prev = audioDataRef.current[b];
          audioDataRef.current[b] = avg > prev
            ? prev + (avg - prev) * 0.6
            : prev + (avg - prev) * 0.08;
        }
      } else {
        // Idle animation — subtle breathing
        for (let b = 0; b < 8; b++) {
          audioDataRef.current[b] = 0.05 + Math.sin(elapsed * 0.5 + b * 0.8) * 0.03;
        }
      }

      // Update uniforms
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      uniforms.uTime.value = elapsed;
      uniforms.uAudioBands.value = audioDataRef.current;
      uniforms.uMouse.value.set(mouseRef.current.x, mouseRef.current.y);
      uniforms.uScroll.value = scrollRef.current;

      // Slow whole-scene rotation for depth
      points.rotation.y = elapsed * 0.02;
      points.rotation.x = Math.sin(elapsed * 0.01) * 0.1;

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    // --- Resize ---
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [analyserRef]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-[1]"
      style={{ pointerEvents: "none", mixBlendMode: "screen" }}
    />
  );
}
