import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function CanvasContainer({ currentProduct, showcaseRotation }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);
  const cubeRef = useRef(null);

  useEffect(() => {
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8eef2);
    
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Create a simple rotating cube as placeholder
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x2c5f7a,
      roughness: 0.4,
      metalness: 0.6
    });
    const cube = new THREE.Mesh(geometry, material);
    cubeRef.current = cube;
    scene.add(cube);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Start animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      if (showcaseRotation > 0) {
        cube.rotation.y = showcaseRotation;
      }
      
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    // Handle resize
    const updateCanvasSize = () => {
      if (!canvasRef.current || !rendererRef.current || !cameraRef.current) return;
      
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Initialize renderer in canvas
    if (canvasRef.current && rendererRef.current) {
      canvasRef.current.innerHTML = '';
      canvasRef.current.appendChild(rendererRef.current.domElement);
      updateCanvasSize();
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  return (
    <div className="canvas-container">
      <div className="canvas-overlay">
        {currentProduct ? currentProduct.name : 'Select a room to begin'}
      </div>
      <div 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%' }}
      />
      <div className="rotation-indicator">
        <span className="rotation-icon">↻</span>
        <span>360° View Active</span>
      </div>
    </div>
  );
}

export default CanvasContainer;