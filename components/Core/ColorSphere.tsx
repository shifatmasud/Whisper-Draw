/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface ColorSphereProps {
  color: string;
}

const ColorSphere: React.FC<ColorSphereProps> = ({ color }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(50, mountNode.clientWidth / mountNode.clientHeight, 0.1, 1000);
    camera.position.z = 3.5;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(2, 3, 3);
    scene.add(directionalLight);

    // --- Geometry & Material ---
    const geometry = new THREE.SphereGeometry(1.2, 64, 64); // Scaled down radius
    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.2,
      roughness: 0.4,
    });
    materialRef.current = material;
    
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // --- Animation Loop ---
    let animationFrameId: number;
    const animate = () => {
      sphere.rotation.y += 0.005;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // --- Resize Observer ---
    const resizeObserver = new ResizeObserver(() => {
        if (!mountNode) return;
        camera.aspect = mountNode.clientWidth / mountNode.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    });
    resizeObserver.observe(mountNode);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      mountNode.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  // Update color when prop changes
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.color.set(color);
    }
  }, [color]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />;
};

export default ColorSphere;