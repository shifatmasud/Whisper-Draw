
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useState } from 'react';
import Two from 'two.js';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings } from '../../types/index.tsx';

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
}

const Stage: React.FC<StageProps> = ({ 
    layers, 
    activeLayerId,
    activeTool,
    toolSettings,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const twoRef = useRef<Two | null>(null);
  
  // Map layer IDs to Two.js Groups
  const groupsRef = useRef<Map<string, Two.Group>>(new Map());
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<Two.Path | null>(null);

  // --- Pen Tool State ---
  // The path currently being constructed by the pen
  const penPathRef = useRef<Two.Path | null>(null);
  // Group to hold visual helpers (vertices, handles) so they don't get baked into the layer
  const penHelpersRef = useRef<Two.Group | null>(null);
  // Track if we are currently dragging to adjust handles
  const isPenDraggingRef = useRef(false);
  // Track the start point for closing the path
  const penStartAnchorRef = useRef<Two.Anchor | null>(null);

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
        // Important: Update scene matrix if needed, but Two.js mostly handles this
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

  // Cleanup Pen tool when switching tools
  useEffect(() => {
      if (activeTool !== 'pen') {
          cleanupPenHelpers();
          penPathRef.current = null;
          penStartAnchorRef.current = null;
      }
  }, [activeTool]);

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

    // Ensure Pen Helpers stay on top if they exist
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
        rectShape.fill = toolSettings.color;
        rectShape.noStroke();
        group.add(rectShape);
    } else {
        // Brush / Eraser
        setIsDrawing(true);
        const color = activeTool === 'eraser' ? '#ffffff' : toolSettings.color;
        const path = new Two.Path([new Two.Anchor(x, y)], false, true);
        path.noFill();
        path.stroke = color;
        path.linewidth = toolSettings.size;
        path.cap = 'round';
        path.join = 'round';
        
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
      // 1. Check if we need to start a new path
      if (!penPathRef.current) {
          const path = new Two.Path([], false, false, true); // open, no-curved (manual), manual commands
          path.noFill();
          path.stroke = toolSettings.color;
          path.linewidth = toolSettings.size;
          path.cap = 'round';
          path.join = 'round';
          
          activeGroup.add(path);
          penPathRef.current = path;

          // Create helpers group on top of everything
          if (!penHelpersRef.current) {
              const helpers = new Two.Group();
              twoRef.current!.add(helpers);
              penHelpersRef.current = helpers;
          }
      }

      // 2. Check for closing path (Tap on start point)
      // Standard touch hit radius ~20px
      if (penStartAnchorRef.current) {
          const dx = x - penStartAnchorRef.current.x;
          const dy = y - penStartAnchorRef.current.y;
          if (Math.hypot(dx, dy) < 20) {
              penPathRef.current.closed = true;
              penPathRef.current.fill = toolSettings.color; // Optionally fill when closed
              // Finish path
              cleanupPenHelpers();
              penPathRef.current = null;
              penStartAnchorRef.current = null;
              return;
          }
      }

      // 3. Add new anchor
      const anchor = new Two.Anchor(x, y, 0, 0, 0, 0, Two.Commands.curve);
      penPathRef.current.vertices.push(anchor);
      
      if (!penStartAnchorRef.current) {
          penStartAnchorRef.current = anchor;
      }

      // 4. Add visual helpers (Vertex circle)
      if (penHelpersRef.current) {
          const circle = new Two.Circle(x, y, 5);
          circle.fill = theme.Color.Focus.Content[1];
          circle.noStroke();
          penHelpersRef.current.add(circle);
      }

      // 5. Start dragging handles
      isPenDraggingRef.current = true;
  };

  const handlePenMove = (x: number, y: number) => {
      if (!isPenDraggingRef.current || !penPathRef.current) return;
      
      // Get the last anchor (active one)
      const vertices = penPathRef.current.vertices;
      const activeAnchor = vertices[vertices.length - 1];
      
      // Calculate delta from anchor center
      const dx = x - activeAnchor.x;
      const dy = y - activeAnchor.y;

      // Update Bezier controls (mirrored for smooth curve)
      activeAnchor.controls.right.x = dx;
      activeAnchor.controls.right.y = dy;
      activeAnchor.controls.left.x = -dx;
      activeAnchor.controls.left.y = -dy;

      // Visual feedback for handles
      updatePenHelpers(activeAnchor);
  };

  const handlePenUp = () => {
      isPenDraggingRef.current = false;
  };

  const updatePenHelpers = (anchor: Two.Anchor) => {
      if (!penHelpersRef.current) return;
      
      // Clear previous handle lines for this anchor (simplified: clear lines, keep dots)
      // A more robust way would be to track handle IDs, but for MVP we can redraw handles 
      // or just trust the user sees the curve changing.
      
      // Let's add a visual line for the handle being dragged to give feedback
      // We'll tag it to remove it next frame or just pile them up (Two.js is fast, but better to be clean)
      
      // For this implementation, the changing curve itself is the best feedback. 
      // The blue dots show where the vertices are.
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
};

export default Stage;
