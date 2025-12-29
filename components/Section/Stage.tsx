/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings } from '../../types/index.tsx';
import { useDraw } from '../../hooks/useDraw.tsx';

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
}

// Store offscreen canvases in a map that persists across re-renders
const layerCanvasCache = new Map<string, HTMLCanvasElement>();

const Stage: React.FC<StageProps> = ({ 
    layers, 
    activeLayerId,
    activeTool,
    toolSettings,
}) => {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{x: number; y: number} | null>(null);

  const draw = useDraw(activeTool, toolSettings);

  // Resize canvas to fit container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      canvas.width = width;
      canvas.height = height;
    });
    
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Composite layers onto visible canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    layers.forEach(layer => {
      if (layer.isVisible) {
        const layerCanvas = layerCanvasCache.get(layer.id);
        if (layerCanvas) {
          ctx.globalAlpha = layer.opacity;
          ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
          ctx.drawImage(layerCanvas, 0, 0);
        }
      }
    });
    // Reset to default
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }, [layers, toolSettings, activeLayerId]); // Re-composite when layers or settings change, or active layer changes


  const getPointInCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const point = getPointInCanvas(e.clientX, e.clientY);
    if (!point || !activeLayerId) return;
    
    if (activeTool === 'fill') {
        // Fill is a single-click action
        handleDrawing(point, null);
    } else {
        // Brush and Eraser are drag actions
        setIsDrawing(true);
        setLastPoint(point);
        handleDrawing(point, null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const point = getPointInCanvas(e.clientX, e.clientY);
    if (point) {
        handleDrawing(point, lastPoint);
        setLastPoint(point);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  const redrawAllLayers = () => {
    const visibleCanvasCtx = canvasRef.current?.getContext('2d');
    if (visibleCanvasCtx) {
        visibleCanvasCtx.clearRect(0, 0, visibleCanvasCtx.canvas.width, visibleCanvasCtx.canvas.height);
        layers.forEach(layer => {
          if (layer.isVisible) {
            const layerCanvas = layerCanvasCache.get(layer.id);
            if (layerCanvas) {
              visibleCanvasCtx.drawImage(layerCanvas, 0, 0);
            }
          }
        });
    }
  };

  const handleDrawing = (currentPoint: {x: number; y: number}, prevPoint: {x: number; y: number} | null) => {
      const activeLayerCanvas = layerCanvasCache.get(activeLayerId!);
      if (!activeLayerCanvas) return;

      const ctx = activeLayerCanvas.getContext('2d');
      if (!ctx) return;
      
      draw(ctx, currentPoint, prevPoint);
      
      // After drawing on the offscreen canvas, re-composite all layers
      // onto the visible canvas.
      redrawAllLayers();
  };

  // Manage offscreen canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    layers.forEach(layer => {
      if (!layerCanvasCache.has(layer.id)) {
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        layerCanvasCache.set(layer.id, offscreenCanvas);
      }
    });

    // Cleanup for deleted layers
    const layerIds = new Set(layers.map(l => l.id));
    for (const id of layerCanvasCache.keys()) {
      if (!layerIds.has(id)) {
        layerCanvasCache.delete(id);
      }
    }
    // Redraw when layers change (e.g., adding a layer)
    redrawAllLayers();
  }, [layers]);


  return (
    <div 
        ref={containerRef}
        style={{ 
            position: 'relative',
            width: 'clamp(300px, 80vw, 1024px)',
            height: 'clamp(300px, 80vh, 768px)',
            backgroundColor: '#FFFFFF',
            borderRadius: theme.radius['Radius.L'],
            boxShadow: theme.effects['Effect.Shadow.Drop.3'],
            overflow: 'hidden',
            touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    >
      <canvas 
        ref={canvasRef} 
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default Stage;