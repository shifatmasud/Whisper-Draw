
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings } from '../../types/index.tsx';

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
}

export interface StageHandle {
    exportImage: (name: string, format: 'png' | 'svg') => void;
}

const Stage = forwardRef<StageHandle, StageProps>(({ 
    layers, 
    activeLayerId,
    activeTool,
    toolSettings,
}, ref) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const twoRef = useRef<Two | null>(null);
  
  // Map layer IDs to Two.js Groups
  const groupsRef = useRef<Map<string, Two.Group>>(new Map());
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<Two.Path | null>(null);

  // --- Pen Tool State ---
  const penPathRef = useRef<Two.Path | null>(null);
  const penHelpersRef = useRef<Two.Group | null>(null);
  const isPenDraggingRef = useRef(false);
  const penStartAnchorRef = useRef<Two.Anchor | null>(null);

  // Expose export functionality
  useImperativeHandle(ref, () => ({
      exportImage: (name: string, format: 'png' | 'svg') => {
          if (!twoRef.current) return;
          
          if (format === 'png') {
              const link = document.createElement('a');
              link.download = `${name}.png`;
              link.href = twoRef.current.renderer.domElement.toDataURL('image/png');
              link.click();
          } else if (format === 'svg') {
              // Create a temporary hidden container in the DOM
              const tempDiv = document.createElement('div');
              tempDiv.style.position = 'absolute';
              tempDiv.style.top = '-9999px';
              tempDiv.style.left = '-9999px';
              document.body.appendChild(tempDiv);

              // @ts-ignore
              const tempTwo = new Two({
                  type: Two.Types.svg,
                  width: twoRef.current.width,
                  height: twoRef.current.height,
              }).appendTo(tempDiv);
              
              const deepClone = (node: any) => {
                  let clone;
                  if (node instanceof Two.Group) {
                      clone = new Two.Group();
                      for (const child of node.children) {
                          clone.add(deepClone(child));
                      }
                      clone.opacity = node.opacity;
                      clone.visible = node.visible;
                      // Transforms
                      clone.translation.copy(node.translation);
                      clone.rotation = node.rotation;
                      clone.scale = node.scale;
                  } else {
                      clone = node.clone();
                      // Manually Copy Path styles
                      clone.fill = node.fill;
                      clone.stroke = node.stroke;
                      clone.linewidth = node.linewidth;
                      clone.opacity = node.opacity;
                      clone.visible = node.visible;
                      clone.cap = node.cap;
                      clone.join = node.join;
                      clone.miter = node.miter;
                      clone.closed = node.closed;
                      clone.curved = node.curved;
                      
                      // Explicitly copy transforms
                      clone.translation.copy(node.translation);
                      clone.rotation = node.rotation;
                      clone.scale = node.scale;
                  }
                  return clone;
              };

              // Clone active scene children (layers)
              twoRef.current.scene.children.forEach((child) => {
                  // Skip helper groups
                  if (child !== penHelpersRef.current) {
                      tempTwo.add(deepClone(child));
                  }
              });
              
              tempTwo.update();
              
              const svgElement = tempDiv.querySelector('svg');
              if (svgElement) {
                  if (!svgElement.getAttribute('xmlns')) {
                      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                  }
                  
                  const svgData = new XMLSerializer().serializeToString(svgElement);
                  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  
                  const link = document.createElement('a');
                  link.download = `${name}.svg`;
                  link.href = url;
                  link.click();
                  
                  URL.revokeObjectURL(url);
              }
              document.body.removeChild(tempDiv);
          }
      }
  }));

  // Initialize Two.js
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (twoRef.current) {
        container.innerHTML = '';
    }

    const two = new Two({
      type: Two.Types.canvas, 
      width: container.clientWidth,
      height: container.clientHeight,
      autostart: true,
    }).appendTo(container);

    twoRef.current = two;

    const handleResize = () => {
        two.width = container.clientWidth;
        two.height = container.clientHeight;
        two.renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      two.pause();
      if (container) container.innerHTML = '';
    };
  }, []);

  // Cleanup Pen tool
  useEffect(() => {
      if (activeTool !== 'pen') {
          cleanupPenHelpers();
          penPathRef.current = null;
          penStartAnchorRef.current = null;
      }
  }, [activeTool]);

  // Reactive Pen Path Update
  // Ensures that changing tool settings while drawing immediately affects the active path.
  useEffect(() => {
    if (activeTool === 'pen' && penPathRef.current) {
      const path = penPathRef.current;
      
      if (toolSettings.strokeEnabled) {
          path.stroke = toolSettings.strokeColor;
          path.linewidth = toolSettings.strokeWidth;
      } else {
          path.noStroke();
      }

      if (toolSettings.fillEnabled) {
          path.fill = toolSettings.fillColor;
      } else {
          path.noFill();
      }
      
      path.cap = toolSettings.lineCap;
      path.join = toolSettings.lineJoin;
    }
  }, [toolSettings, activeTool]);

  const cleanupPenHelpers = () => {
      if (penHelpersRef.current && twoRef.current) {
          twoRef.current.remove(penHelpersRef.current);
          penHelpersRef.current = null;
      }
  };

  // Sync Layers
  useEffect(() => {
    const two = twoRef.current;
    if (!two) return;

    layers.forEach(layer => {
        if (!groupsRef.current.has(layer.id)) {
            const group = new Two.Group();
            group.id = layer.id; 
            groupsRef.current.set(layer.id, group);
            two.add(group);
        }
    });

    const activeLayerIds = new Set(layers.map(l => l.id));
    groupsRef.current.forEach((group, id) => {
        if (!activeLayerIds.has(id)) {
            two.remove(group);
            groupsRef.current.delete(id);
        }
    });

    layers.forEach((layer) => {
        const group = groupsRef.current.get(layer.id);
        if (group) {
            group.visible = layer.isVisible;
            group.opacity = layer.opacity;
        }
    });
    
    // Strict Reorder
    groupsRef.current.forEach(g => {
        if (g.parent) g.remove();
    });
    layers.forEach(layer => {
        const group = groupsRef.current.get(layer.id);
        if (group) two.add(group);
    });

    // Ensure Pen Helpers stay on top
    if (penHelpersRef.current) {
        two.remove(penHelpersRef.current);
        two.add(penHelpersRef.current);
    }

  }, [layers]);


  // --- Event Handlers ---

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeLayerId || !twoRef.current) return;
    const group = groupsRef.current.get(activeLayerId);
    if (!group) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'pen') {
        handlePenDown(x, y, group);
    } else if (activeTool === 'fill') {
        const rectShape = new Two.Rectangle(twoRef.current.width / 2, twoRef.current.height / 2, twoRef.current.width, twoRef.current.height);
        rectShape.fill = toolSettings.fillColor;
        rectShape.noStroke();
        group.add(rectShape);
    } else {
        // Brush / Eraser
        setIsDrawing(true);
        const path = new Two.Path([new Two.Anchor(x, y)], false, true);
        
        if (activeTool === 'eraser') {
            // Eraser always has white stroke, no fill
            path.noFill();
            path.stroke = '#ffffff';
            path.cap = 'round';
            path.linewidth = toolSettings.strokeWidth;
        } else {
            // Apply Stroke Settings
            if (toolSettings.strokeEnabled) {
                path.stroke = toolSettings.strokeColor;
                path.linewidth = toolSettings.strokeWidth;
            } else {
                path.noStroke();
            }

            // Apply Fill Settings
            if (toolSettings.fillEnabled) {
                path.fill = toolSettings.fillColor;
            } else {
                path.noFill();
            }
            
            path.cap = toolSettings.lineCap;
            path.join = toolSettings.lineJoin;
        }
        
        group.add(path);
        currentPathRef.current = path;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'pen') {
        handlePenMove(x, y);
    } else if (isDrawing && currentPathRef.current && twoRef.current) {
        const anchor = new Two.Anchor(x, y);
        currentPathRef.current.vertices.push(anchor);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'pen') {
        handlePenUp();
    } else {
        setIsDrawing(false);
        currentPathRef.current = null;
    }
  };

  // --- Pen Tool Logic ---

  const handlePenDown = (x: number, y: number, activeGroup: Two.Group) => {
      if (!penPathRef.current) {
          const path = new Two.Path([], false, false, true);
          
          if (toolSettings.strokeEnabled) {
              path.stroke = toolSettings.strokeColor;
              path.linewidth = toolSettings.strokeWidth;
          } else {
              path.noStroke();
          }

          if (toolSettings.fillEnabled) {
              path.fill = toolSettings.fillColor;
          } else {
              path.noFill();
          }

          path.cap = toolSettings.lineCap;
          path.join = toolSettings.lineJoin;
          
          activeGroup.add(path);
          penPathRef.current = path;

          if (!penHelpersRef.current) {
              const helpers = new Two.Group();
              twoRef.current!.add(helpers);
              penHelpersRef.current = helpers;
          }
      }

      if (penStartAnchorRef.current) {
          const dx = x - penStartAnchorRef.current.x;
          const dy = y - penStartAnchorRef.current.y;
          // Close path if clicked near start
          if (Math.hypot(dx, dy) < 20) {
              penPathRef.current.closed = true;
              
              // Ensure we re-apply correct styles on close
              // This is critical if settings changed during the draw
              if (toolSettings.fillEnabled) {
                  penPathRef.current.fill = toolSettings.fillColor;
              } else {
                  penPathRef.current.noFill();
              }

              cleanupPenHelpers();
              penPathRef.current = null;
              penStartAnchorRef.current = null;
              return;
          }
      }

      const anchor = new Two.Anchor(x, y, 0, 0, 0, 0, Two.Commands.curve);
      penPathRef.current.vertices.push(anchor);
      
      if (!penStartAnchorRef.current) {
          penStartAnchorRef.current = anchor;
      }

      if (penHelpersRef.current) {
          const circle = new Two.Circle(x, y, 5);
          circle.fill = theme.Color.Focus.Content[1];
          circle.noStroke();
          penHelpersRef.current.add(circle);
      }

      isPenDraggingRef.current = true;
  };

  const handlePenMove = (x: number, y: number) => {
      if (!isPenDraggingRef.current || !penPathRef.current) return;
      const vertices = penPathRef.current.vertices;
      const activeAnchor = vertices[vertices.length - 1];
      const dx = x - activeAnchor.x;
      const dy = y - activeAnchor.y;
      activeAnchor.controls.right.x = dx;
      activeAnchor.controls.right.y = dy;
      activeAnchor.controls.left.x = -dx;
      activeAnchor.controls.left.y = -dy;
  };

  const handlePenUp = () => {
      isPenDraggingRef.current = false;
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
            touchAction: 'none',
            cursor: activeTool === 'brush' ? 'crosshair' : activeTool === 'pen' ? 'cell' : 'default'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    />
  );
});

export default Stage;
