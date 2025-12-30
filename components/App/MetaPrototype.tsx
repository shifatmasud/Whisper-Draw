
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import ThemeToggleButton from '../Core/ThemeToggleButton.tsx';
import FloatingWindow from '../Package/FloatingWindow.tsx';
import Dock from '../Section/Dock.tsx';
import Stage, { StageHandle } from '../Section/Stage.tsx';
import PropertiesPanel from '../Package/PropertiesPanel.tsx';
import AssetsPanel from '../Package/AssetsPanel.tsx';
import LayersPanel from '../Package/LayersPanel.tsx';
import Toolbar from '../Package/Toolbar.tsx';
import { WindowId, WindowState, Layer, Tool, ToolSettings } from '../../types/index.tsx';

/**
 * 🎨 2D Texture Design Tool
 * Acts as the main state orchestrator for the application.
 */
const MetaPrototype = () => {
  const { theme } = useTheme();
  const stageRef = useRef<StageHandle>(null);
  
  // -- Drag State Management --
  const [isContentDragging, setIsContentDragging] = useState(false);

  // -- Canvas & Tool State --
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isAnchorSelected, setIsAnchorSelected] = useState(false);
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    strokeColor: '#000000',
    fillColor: '#EF476F',
    strokeWidth: 10,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeEnabled: true,
    fillEnabled: false,
  });

  // --- Window Management ---
  const WINDOW_WIDTH = 320;
  const PROPERTIES_PANEL_HEIGHT = 500;
  const ASSETS_PANEL_HEIGHT = 300;
  const LAYERS_PANEL_HEIGHT = 300;

  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    properties: { id: 'properties', title: 'Inspector', isOpen: true, zIndex: 3, x: -WINDOW_WIDTH / 2, y: -PROPERTIES_PANEL_HEIGHT / 2 },
    layers: { id: 'layers', title: 'Layers', isOpen: true, zIndex: 2, x: -WINDOW_WIDTH / 2, y: -LAYERS_PANEL_HEIGHT / 2 },
    assets: { id: 'assets', title: 'Assets', isOpen: false, zIndex: 1, x: -WINDOW_WIDTH / 2, y: -ASSETS_PANEL_HEIGHT / 2 },
  });

  const bringToFront = (id: WindowId) => {
    setWindows(prev => {
      const maxZ = Math.max(...Object.values(prev).map((w: WindowState) => w.zIndex));
      if (prev[id].zIndex === maxZ) return prev;
      return { ...prev, [id]: { ...prev[id], zIndex: maxZ + 1 } };
    });
  };

  const toggleWindow = (id: WindowId) => {
    setWindows(prev => {
      const isOpen = !prev[id].isOpen;
      const next = { ...prev, [id]: { ...prev[id], isOpen } };
      if (isOpen) {
        const maxZ = Math.max(...Object.values(prev).map((w: WindowState) => w.zIndex));
        next[id].zIndex = maxZ + 1;
      }
      return next;
    });
  };

  // --- Layer Management Callbacks ---
  const handleAddLayer = useCallback(() => {
    const newLayerId = `layer-${Date.now()}`;
    setLayers(prevLayers => {
      const newLayer: Layer = {
        id: newLayerId,
        name: `Layer ${prevLayers.length + 1}`,
        isVisible: true,
        opacity: 1,
        blendMode: 'source-over',
      };
      return [newLayer, ...prevLayers];
    });
    setActiveLayerId(newLayerId);
  }, []);

  useEffect(() => {
    if (layers.length === 0) {
      handleAddLayer();
    }
  }, [layers.length, handleAddLayer]);

  const handleSelectLayer = useCallback((id: string) => {
    setActiveLayerId(id);
  }, []);
  
  const handleToolSettingChange = useCallback((key: keyof ToolSettings, value: any) => {
    setToolSettings(prev => ({...prev, [key]: value}));
  }, []);

  const handleDeleteLayer = useCallback((id: string) => {
    setLayers(prevLayers => {
      const newLayers = prevLayers.filter(l => l.id !== id);
      setActiveLayerId(prevActiveId => {
        if (prevActiveId === id) {
          return newLayers.length > 0 ? newLayers[0].id : null;
        }
        return prevActiveId;
      });
      return newLayers;
    });
  }, []);

  const handleDuplicateLayer = useCallback((id: string) => {
    setLayers(prev => {
      const layerIndex = prev.findIndex(l => l.id === id);
      if (layerIndex === -1) return prev;
      const originalLayer = prev[layerIndex];
      const newLayer: Layer = {
        ...originalLayer,
        id: `layer-${Date.now()}`,
        name: `${originalLayer.name} Copy`,
      };
      const newLayers = [...prev];
      newLayers.splice(layerIndex + 1, 0, newLayer);
      setActiveLayerId(newLayer.id);
      return newLayers;
    });
  }, []);

  const handleUpdateLayerProperty = useCallback((id: string, properties: Partial<Layer>) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...properties } : l));
  }, []);

  const handleReorderLayers = useCallback((reorderedLayers: Layer[]) => {
    setLayers(reorderedLayers);
  }, []);

  const handleExport = useCallback((fileName: string, format: 'png' | 'svg') => {
      if (stageRef.current) {
          stageRef.current.exportImage(fileName, format);
      }
  }, []);

  const reversedLayersForStage = useMemo(() => [...layers].reverse(), [layers]);
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId) || null, [layers, activeLayerId]);
  
  const handleContentDragStart = useCallback(() => setIsContentDragging(true), []);
  const handleContentDragEnd = useCallback(() => setIsContentDragging(false), []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: theme.Color.Base.Surface[1],
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <ThemeToggleButton />
      <Toolbar activeTool={activeTool} onToolSelect={setActiveTool} />

      <Stage
        ref={stageRef}
        layers={reversedLayersForStage}
        activeLayerId={activeLayerId}
        activeTool={activeTool}
        toolSettings={toolSettings}
        onToolChange={setActiveTool}
        onAnchorSelect={setIsAnchorSelected}
      />

      <AnimatePresence>
        {activeTool === 'pen' && isAnchorSelected && (
          <motion.button
            key="delete-anchor-btn"
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: -90, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => stageRef.current?.deleteSelectedAnchor()}
            style={{
              position: 'absolute',
              bottom: theme.spacing['Space.XXL'],
              right: `calc(${theme.spacing['Space.L']} + 64px + ${theme.spacing['Space.M']})`, // Positioned to left of checkmark
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: theme.Color.Error.Content[1],
              color: theme.Color.Base.Surface[1],
              border: 'none',
              boxShadow: theme.effects['Effect.Shadow.Drop.3'],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              cursor: 'pointer'
            }}
          >
            <i className="ph-bold ph-trash" style={{ fontSize: '32px' }} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeTool === 'pen' && (
          <motion.button
            key="done-btn"
            initial={{ scale: 0, rotate: 90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              stageRef.current?.finishPath();
              setActiveTool('select');
            }}
            style={{
              position: 'absolute',
              bottom: theme.spacing['Space.XXL'],
              right: theme.spacing['Space.L'],
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: theme.Color.Success.Content[1],
              color: theme.Color.Base.Surface[1],
              border: 'none',
              boxShadow: theme.effects['Effect.Shadow.Drop.3'],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              cursor: 'pointer'
            }}
          >
            <i className="ph-bold ph-check" style={{ fontSize: '32px' }} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {windows.properties.isOpen && (
          <FloatingWindow
            key="properties"
            {...windows.properties}
            onClose={() => toggleWindow('properties')}
            onFocus={() => bringToFront('properties')}
          >
            <PropertiesPanel
              toolSettings={toolSettings}
              onSettingChange={handleToolSettingChange}
              activeLayer={activeLayer}
              onLayerUpdate={handleUpdateLayerProperty}
            />
          </FloatingWindow>
        )}

        {windows.layers.isOpen && (
          <FloatingWindow
            key="layers"
            {...windows.layers}
            onClose={() => toggleWindow('layers')}
            onFocus={() => bringToFront('layers')}
            isDraggable={!isContentDragging}
          >
            <LayersPanel
              layers={layers}
              activeLayerId={activeLayerId}
              onAddLayer={handleAddLayer}
              onSelectLayer={handleSelectLayer}
              onDeleteLayer={handleDeleteLayer}
              onDuplicateLayer={handleDuplicateLayer}
              onUpdateLayerProperty={handleUpdateLayerProperty}
              onReorderLayers={handleReorderLayers}
              onContentDragStart={handleContentDragStart}
              onContentDragEnd={handleContentDragEnd}
            />
          </FloatingWindow>
        )}

        {windows.assets.isOpen && (
          <FloatingWindow
            key="assets"
            {...windows.assets}
            onClose={() => toggleWindow('assets')}
            onFocus={() => bringToFront('assets')}
          >
            <AssetsPanel onExport={handleExport} />
          </FloatingWindow>
        )}
      </AnimatePresence>

      <Dock windows={windows} toggleWindow={toggleWindow} />
    </div>
  );
};

export default MetaPrototype;
