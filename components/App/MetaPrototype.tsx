
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
import AIAssistantPanel from '../Package/AIAssistantPanel.tsx';
import { WindowId, WindowState, Layer, Tool, ToolSettings, ShapeType } from '../../types/index.tsx';

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
  const [selectedObjectType, setSelectedObjectType] = useState<any>(null);
  
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    strokeColor: '#000000',
    fillColor: '#EF476F',
    strokeWidth: 4,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeEnabled: true,
    fillEnabled: true,
    selectionMode: 'vector',
    penHandleMode: 'mirrored',
    penClosePath: false,
    // Shape Tool Defaults
    shapeType: 'rectangle',
    shapeMode: 'insert',
    buildMode: 'add',
    cornerRadius: 16,
    starPoints: 5,
    starInnerRadius: 0.5,
    polygonSides: 6,
  });

  // --- Window Management ---
  const WINDOW_WIDTH = 320;
  const PROPERTIES_PANEL_HEIGHT = 500;
  const ASSETS_PANEL_HEIGHT = 300;
  const LAYERS_PANEL_HEIGHT = 400;
  const AI_PANEL_HEIGHT = 500;

  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    properties: { id: 'properties', title: 'Inspector', isOpen: true, zIndex: 3, x: -WINDOW_WIDTH / 2, y: -PROPERTIES_PANEL_HEIGHT / 2 },
    layers: { id: 'layers', title: 'Layers', isOpen: true, zIndex: 2, x: -WINDOW_WIDTH / 2, y: -LAYERS_PANEL_HEIGHT / 2 },
    assets: { id: 'assets', title: 'Assets', isOpen: false, zIndex: 1, x: -WINDOW_WIDTH / 2, y: -ASSETS_PANEL_HEIGHT / 2 },
    aiAssistant: { id: 'aiAssistant', title: 'AI ASSISTANT', isOpen: true, zIndex: 4, x: window.innerWidth / 2 - WINDOW_WIDTH - 40, y: -AI_PANEL_HEIGHT / 2 },
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

  // --- Recursive Layer Helpers ---
  const findLayer = (nodes: Layer[], id: string): Layer | null => {
      for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
              const found = findLayer(node.children, id);
              if (found) return found;
          }
      }
      return null;
  };

  const updateLayerInTree = (nodes: Layer[], id: string, updater: (l: Layer) => Layer): Layer[] => {
      return nodes.map(node => {
          if (node.id === id) return updater(node);
          if (node.children) return { ...node, children: updateLayerInTree(node.children, id, updater) };
          return node;
      });
  };

  const deleteLayerFromTree = (nodes: Layer[], id: string): Layer[] => {
      return nodes.filter(node => node.id !== id).map(node => ({
          ...node,
          children: deleteLayerFromTree(node.children, id)
      }));
  };
  
  const flattenLayerTree = (nodes: Layer[]): Layer[] => {
      let flat: Layer[] = [];
      nodes.forEach(node => {
          flat.push(node);
          if (node.children) flat = flat.concat(flattenLayerTree(node.children));
      });
      return flat;
  };

  // --- Layer Management Callbacks ---
  const handleAddLayer = useCallback(() => {
    const newLayerId = `layer-${Date.now()}`;
    const newLayer: Layer = {
      id: newLayerId,
      type: 'layer',
      name: 'New Layer',
      isVisible: true,
      opacity: 1,
      blendMode: 'source-over',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      children: [],
      isOpen: true,
    };

    setLayers(prevLayers => {
        if (activeLayerId) {
             const active = findLayer(prevLayers, activeLayerId);
             if (active && active.type === 'group') {
                 return updateLayerInTree(prevLayers, activeLayerId, l => ({
                     ...l,
                     children: [newLayer, ...l.children]
                 }));
             }
        }
        return [newLayer, ...prevLayers];
    });
    setActiveLayerId(newLayerId);
  }, [activeLayerId]);

  useEffect(() => {
    if (layers.length === 0) {
      handleAddLayer();
    }
  }, [layers.length, handleAddLayer]);

  const handleSelectLayer = useCallback((id: string) => {
    setActiveLayerId(id);
  }, []);
  
  const handleToolSettingChange = useCallback((key: keyof ToolSettings, value: any) => {
    setToolSettings(prev => {
        if (key === 'penClosePath') {
            stageRef.current?.setPathClosed(value);
        }
        return ({...prev, [key]: value});
    });
  }, []);

  const handleSelectionPropertiesChange = useCallback((properties: Partial<ToolSettings>) => {
    setToolSettings(prev => ({ ...prev, ...properties }));
  }, []);

  const handleStageAction = useCallback((action: string) => {
      if (!stageRef.current) return;
      switch (action) {
          case 'finishPath': stageRef.current.finishPath(); setActiveTool('select'); break;
          case 'deleteAnchor': stageRef.current.deleteSelectedAnchor(); break;
          case 'sharpAnchor': stageRef.current.setAnchorSharp(); break;
          case 'flatten': stageRef.current.flattenSelectedShape(); break;
          case 'ungroup': stageRef.current.ungroupSelected(); break;
      }
  }, []);

  const handleDeleteLayer = useCallback((id: string) => {
    setLayers(prevLayers => {
      const newLayers = deleteLayerFromTree(prevLayers, id);
      if (activeLayerId === id) {
          const flat = flattenLayerTree(newLayers);
          if (flat.length > 0) setActiveLayerId(flat[0].id);
          else setActiveLayerId(null);
      }
      return newLayers;
    });
  }, [activeLayerId]);

  const handleDuplicateLayer = useCallback((id: string) => {
    const newLayerId = `layer-${Date.now()}`;
    stageRef.current?.duplicateLayerContent(id, newLayerId);

    setLayers(prev => {
      const insertDuplicate = (nodes: Layer[]): Layer[] => {
          const idx = nodes.findIndex(n => n.id === id);
          if (idx !== -1) {
              const original = nodes[idx];
              const copy = { ...original, id: newLayerId, name: `${original.name} Copy` };
              const newNodes = [...nodes];
              newNodes.splice(idx, 0, copy);
              return newNodes;
          }
          return nodes.map(n => ({ ...n, children: insertDuplicate(n.children) }));
      };
      
      const newLayers = insertDuplicate(prev);
      setActiveLayerId(newLayerId);
      return newLayers;
    });
  }, []);

  const handleUpdateLayerProperty = useCallback((id: string, properties: Partial<Layer>) => {
    setLayers(prev => updateLayerInTree(prev, id, l => ({ ...l, ...properties })));
  }, []);

  const handleReorderLayers = useCallback((reorderedLayers: Layer[]) => {
      setLayers(reorderedLayers);
  }, []);

  const handleGroupSelection = useCallback(() => {
      if (!activeLayerId) return;
      setLayers(prev => {
          const layerToGroup = findLayer(prev, activeLayerId);
          if (!layerToGroup) return prev;
          if (layerToGroup.type === 'group') return prev; 

          const newGroupId = `group-${Date.now()}`;
          const newGroup: Layer = {
              id: newGroupId,
              type: 'group',
              name: 'Group',
              isVisible: true,
              opacity: 1,
              blendMode: 'source-over',
              x: 0, y: 0, scale: 1, rotation: 0,
              children: [layerToGroup],
              isOpen: true
          };

          const replaceInTree = (nodes: Layer[]): Layer[] => {
              const idx = nodes.findIndex(n => n.id === activeLayerId);
              if (idx !== -1) {
                  const newNodes = [...nodes];
                  newNodes[idx] = newGroup;
                  return newNodes;
              }
              return nodes.map(n => ({ ...n, children: replaceInTree(n.children) }));
          };
          
          setActiveLayerId(newGroupId);
          return replaceInTree(prev);
      });
  }, [activeLayerId]);
  
  const handleUngroup = useCallback((id: string) => {
      setLayers(prev => {
          const groupToUngroup = findLayer(prev, id);
          if (!groupToUngroup || groupToUngroup.type !== 'group') return prev;
          
          const ungroupRecursive = (nodes: Layer[]): Layer[] => {
              const idx = nodes.findIndex(n => n.id === id);
              if (idx !== -1) {
                  const newNodes = [...nodes];
                  newNodes.splice(idx, 1, ...groupToUngroup.children);
                  return newNodes;
              }
              return nodes.map(n => ({ ...n, children: ungroupRecursive(n.children) }));
          };
          
          return ungroupRecursive(prev);
      });
  }, []);

  const handleMoveLayer = useCallback((layerId: string, targetGroupId: string | null) => {
    setLayers(prev => {
        let layerToMove: Layer | null = null;
        
        const removeRecursive = (nodes: Layer[]): Layer[] => {
            const filtered: Layer[] = [];
            for (const node of nodes) {
                if (node.id === layerId) {
                    layerToMove = node;
                } else {
                    const newChildren = removeRecursive(node.children);
                    if (newChildren.length !== node.children.length || newChildren !== node.children) {
                         filtered.push({ ...node, children: newChildren });
                    } else {
                         filtered.push(node);
                    }
                }
            }
            return filtered;
        };

        const layersWithoutItem = removeRecursive(prev);
        if (!layerToMove) return prev;

        if (targetGroupId === null) {
            return [layerToMove, ...layersWithoutItem];
        } else {
            const addToGroupRecursive = (nodes: Layer[]): Layer[] => {
                return nodes.map(node => {
                    if (node.id === targetGroupId && node.type === 'group') {
                        return { ...node, children: [layerToMove!, ...node.children], isOpen: true };
                    }
                    if (node.children.length > 0) {
                         return { ...node, children: addToGroupRecursive(node.children) };
                    }
                    return node;
                });
            };
            return addToGroupRecursive(layersWithoutItem);
        }
    });
  }, []);

  const handleUpdateThumbnail = useCallback((id: string, dataUrl: string) => {
      setLayers(prev => updateLayerInTree(prev, id, l => ({ ...l, thumbnail: dataUrl })));
  }, []);

  const handleExport = useCallback((fileName: string, format: 'png' | 'svg') => {
      stageRef.current?.exportImage(fileName, format);
  }, []);
  
  const handleAddSVGToCanvas = useCallback((svgString: string) => {
    stageRef.current?.importSVG(svgString);
  }, []);

  const activeLayer = useMemo(() => findLayer(layers, activeLayerId || ''), [layers, activeLayerId]);
  
  const handleContentDragStart = useCallback(() => setIsContentDragging(true), []);
  const handleContentDragEnd = useCallback(() => setIsContentDragging(false), []);

  const headerButtonStyles: { [key: string]: React.CSSProperties } = {
    button: {
      width: '44px',
      height: '44px',
      borderRadius: theme.radius['Radius.Full'],
      backgroundColor: theme.Color.Base.Surface['2'],
      border: 'none',
      cursor: 'grab',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.Color.Base.Content['2'],
      boxShadow: theme.effects['Effect.Shadow.Drop.1'],
      overflow: 'hidden',
      zIndex: 1001,
      touchAction: 'none',
      position: 'absolute',
      top: theme.spacing['Space.L'],
    },
    icon: {
      fontSize: '24px',
      lineHeight: '0',
    }
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
      <motion.button
        style={{ ...headerButtonStyles.button, right: `calc(${theme.spacing['Space.L']} + 44px + ${theme.spacing['Space.S']})` }}
        onClick={() => toggleWindow('aiAssistant')}
        aria-label="Toggle AI Assistant"
        whileHover={{ scale: 1.1, boxShadow: theme.effects['Effect.Shadow.Drop.2'] }}
        whileTap={{ scale: 0.95 }}
        whileDrag={{ scale: 1.1, cursor: 'grabbing', boxShadow: theme.effects['Effect.Shadow.Drop.3'] }}
        drag
        dragMomentum={false}
        transition={{ duration: 0.2 }}
      >
          <i className="ph-bold ph-sparkle" style={headerButtonStyles.icon}/>
      </motion.button>
      <ThemeToggleButton />
      <Toolbar activeTool={activeTool} onToolSelect={setActiveTool} />

      <Stage
        ref={stageRef}
        layers={layers} 
        activeLayerId={activeLayerId}
        activeTool={activeTool}
        toolSettings={toolSettings}
        onToolChange={setActiveTool}
        onAnchorSelect={setIsAnchorSelected}
        onSelectionTypeChange={setSelectedObjectType}
        onSelectionPropertiesChange={handleSelectionPropertiesChange}
        onThumbnailReady={handleUpdateThumbnail}
      />

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
              activeTool={activeTool}
              isAnchorSelected={isAnchorSelected}
              onPenAction={handleStageAction}
              selectedObjectType={selectedObjectType}
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
              onGroupSelection={handleGroupSelection}
              onUngroup={handleUngroup}
              onMoveLayer={handleMoveLayer}
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
            <AssetsPanel onExport={handleExport} onImportSVG={handleAddSVGToCanvas} />
          </FloatingWindow>
        )}
        
        {windows.aiAssistant.isOpen && (
          <FloatingWindow
            key="aiAssistant"
            {...windows.aiAssistant}
            onClose={() => toggleWindow('aiAssistant')}
            onFocus={() => bringToFront('aiAssistant')}
          >
            <AIAssistantPanel onAddToCanvas={handleAddSVGToCanvas} />
          </FloatingWindow>
        )}
      </AnimatePresence>

      <Dock windows={windows} toggleWindow={toggleWindow} />
    </div>
  );
};

export default MetaPrototype;
