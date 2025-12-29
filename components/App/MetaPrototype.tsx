/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import ThemeToggleButton from '../Core/ThemeToggleButton.tsx';
import FloatingWindow from '../Package/FloatingWindow.tsx';
import Dock from '../Section/Dock.tsx';
import Stage from '../Section/Stage.tsx';
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
  
  // -- Canvas & Tool State --
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('brush');
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    color: theme.Color.Accent.Surface[1],
    size: 20,
    opacity: 1,
  });

  // --- Window Management ---
  const WINDOW_WIDTH = 320;
  const PROPERTIES_PANEL_HEIGHT = 250;
  const ASSETS_PANEL_HEIGHT = 200;
  const LAYERS_PANEL_HEIGHT = 300;

  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    properties: { id: 'properties', title: 'Properties', isOpen: true, zIndex: 3, x: -WINDOW_WIDTH / 2, y: -PROPERTIES_PANEL_HEIGHT / 2 },
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
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${layers.length + 1}`,
      isVisible: true,
      opacity: 1,
      blendMode: 'source-over',
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [layers]);

  // Add initial layer on mount
  useEffect(() => {
    if (layers.length === 0) {
      handleAddLayer();
    }
  }, [layers.length, handleAddLayer]);

  const handleSelectLayer = (id: string) => {
    setActiveLayerId(id);
  };
  
  const handleToolSettingChange = (key: keyof ToolSettings, value: any) => {
    setToolSettings(prev => ({...prev, [key]: value}));
  };

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
        layers={layers}
        activeLayerId={activeLayerId}
        activeTool={activeTool}
        toolSettings={toolSettings}
      />

      {/* --- WINDOWS --- */}
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
            />
          </FloatingWindow>
        )}

        {windows.layers.isOpen && (
          <FloatingWindow
            key="layers"
            {...windows.layers}
            onClose={() => toggleWindow('layers')}
            onFocus={() => bringToFront('layers')}
          >
            <LayersPanel
              layers={layers}
              activeLayerId={activeLayerId}
              onAddLayer={handleAddLayer}
              onSelectLayer={handleSelectLayer}
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
            <AssetsPanel />
          </FloatingWindow>
        )}
      </AnimatePresence>

      <Dock windows={windows} toggleWindow={toggleWindow} />
    </div>
  );
};

export default MetaPrototype;