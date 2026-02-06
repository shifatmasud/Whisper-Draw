/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
import { useTheme } from '../../../Theme.tsx';
import { Layer, Tool, ToolSettings, SelectedObjectType } from '../../../types/index.tsx';
import { CanvasEngine } from './Engine.ts';

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
  onToolChange?: (tool: Tool) => void;
  onAnchorSelect?: (isSelected: boolean) => void;
  onSelectionTypeChange?: (type: SelectedObjectType) => void;
  onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
  onThumbnailReady?: (id: string, dataUrl: string) => void;
}

export interface StageHandle {
    exportImage: (name: string, format: 'png' | 'svg') => void;
    finishPath: () => void;
    deleteSelectedAnchor: () => void;
    setAnchorSharp: () => void;
    setPathClosed: (closed: boolean) => void;
    flattenSelectedShape: () => void;
    duplicateLayerContent: (originalId: string, newId: string) => void;
    importSVG: (svgString: string) => void;
    ungroupSelected: () => void;
}

const Stage = forwardRef<StageHandle, StageProps>(({ 
    layers, 
    activeLayerId, 
    activeTool,
    toolSettings,
    onToolChange,
    onAnchorSelect,
    onSelectionTypeChange,
    onSelectionPropertiesChange,
    onThumbnailReady,
}, ref) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CanvasEngine(containerRef.current);
    engineRef.current = engine;
    
    const handleResize = () => { 
        if (containerRef.current) engine.resize(containerRef.current.clientWidth, containerRef.current.clientHeight); 
    };
    
    window.addEventListener('resize', handleResize);
    return () => { 
        window.removeEventListener('resize', handleResize); 
        engine.destroy(); 
    };
  }, []);

  // Sync React state to Engine
  useEffect(() => { engineRef.current?.updateLayers(layers); }, [layers]);
  useEffect(() => { engineRef.current?.setActiveLayerId(activeLayerId); }, [activeLayerId]);
  useEffect(() => { engineRef.current?.setTool(activeTool); }, [activeTool]);
  useEffect(() => { engineRef.current?.setToolSettings(toolSettings); }, [toolSettings]);
  useEffect(() => { 
    engineRef.current?.setCallbacks({ 
        onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange, onThumbnailReady 
    }); 
  }, [onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange, onThumbnailReady]);

  useImperativeHandle(ref, () => ({
      exportImage: (name, format) => {
          const engine = engineRef.current; if (!engine) return;
          if (format === 'png') {
              const link = document.createElement('a'); link.download = `${name}.png`; link.href = engine.two.renderer.domElement.toDataURL('image/png'); link.click();
          } else if (format === 'svg') {
              const tempDiv = document.createElement('div');
              const svgTwo = new Two({ type: Two.Types.svg, width: engine.two.width, height: engine.two.height }).appendTo(tempDiv);
              svgTwo.scene.translation.copy(engine.two.scene.translation); 
              engine.groups.forEach((group) => { svgTwo.add((group as any).clone()); });
              svgTwo.update();
              const svgElem = tempDiv.querySelector('svg');
              if (svgElem) {
                  svgElem.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                  const blob = new Blob([svgElem.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url; link.download = `${name}.svg`; document.body.appendChild(link);
                  link.click(); document.body.removeChild(link);
              }
          }
      },
      finishPath: () => engineRef.current?.finishPath(),
      deleteSelectedAnchor: () => engineRef.current?.deleteSelectedAnchor(),
      setAnchorSharp: () => engineRef.current?.setAnchorSharp(),
      setPathClosed: (closed) => engineRef.current?.setPathClosed(closed),
      flattenSelectedShape: () => engineRef.current?.flattenSelectedShape(),
      duplicateLayerContent: (originalId, newId) => engineRef.current?.duplicateLayerContent(originalId, newId),
      importSVG: (svgString) => engineRef.current?.importSVG(svgString),
      ungroupSelected: () => engineRef.current?.ungroupSelected(),
  }));

  const getLocalCoords = (e: React.PointerEvent) => { 
      const rect = containerRef.current!.getBoundingClientRect(); 
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
  };

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
        onPointerDown={(e) => { e.preventDefault(); const { x, y } = getLocalCoords(e); engineRef.current?.handleDown(x, y); }}
        onPointerMove={(e) => { e.preventDefault(); const { x, y } = getLocalCoords(e); engineRef.current?.handleMove(x, y); }}
        onPointerUp={() => engineRef.current?.handleUp()}
        onPointerLeave={() => engineRef.current?.handleUp()}
    />
  );
});

export default Stage;
