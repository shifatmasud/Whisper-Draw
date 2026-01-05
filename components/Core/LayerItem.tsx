
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer, BlendMode } from '../../types/index.tsx';
import { Reorder, useDragControls } from 'framer-motion';
import ContextMenu from '../Package/ContextMenu.tsx';

interface LayerItemProps {
    layer: Layer;
    isActive: boolean;
    depth?: number;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdateProperty: (id: string, properties: Partial<Layer>) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    onGroupSelection: () => void;
    onUngroup: (id: string) => void;
    // New Drop Zone Props
    draggedLayerId: string | null;
    hoveredTargetId: string | null;
    onDragItemStart: (id: string) => void;
    onDragItemEnd: () => void;
    onDragOver: (x: number, y: number) => void;
    children?: React.ReactNode;
}

const BLEND_MODES: { value: BlendMode, label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

const LayerItem: React.FC<LayerItemProps> = React.memo(({ 
    layer, isActive, depth = 0, onSelect, onDelete, onDuplicate, 
    onUpdateProperty, onDragStart, onDragEnd, onGroupSelection, onUngroup,
    draggedLayerId, hoveredTargetId, onDragItemStart, onDragItemEnd, onDragOver,
    children 
}) => {
    const { theme } = useTheme();
    const dragControls = useDragControls();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    const isDropTarget = draggedLayerId !== null && draggedLayerId !== layer.id && hoveredTargetId === layer.id && layer.type === 'group';

    const handleDragStartInternal = () => {
        onDragItemStart(layer.id);
    };
    
    const handleDragEndInternal = () => {
        onDragItemEnd();
    };
    
    // We update the drag position manually because standard mouse events are blocked by the dragged element
    // Framer Motion's onDrag callback provides the point info
    const handleDrag = (event: any, info: any) => {
        if (draggedLayerId) {
            onDragOver(info.point.x, info.point.y);
        }
    };

    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing['Space.S'],
        padding: theme.spacing['Space.S'],
        borderRadius: theme.radius['Radius.S'],
        backgroundColor: isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[2],
        color: isActive ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[1],
        border: isDropTarget 
            ? `2px solid ${theme.Color.Focus.Content[1]}` 
            : `1px solid ${isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[3]}`,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        marginLeft: `${depth * 16}px`, // Indentation for tree
        transition: `background-color ${theme.time['Time.1x']} ease, border-color ${theme.time['Time.1x']} ease`,
        boxShadow: isDropTarget ? `0 0 8px ${theme.Color.Focus.Surface[1]}` : 'none',
    };
    
    const handleMenuOpen = (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setIsMenuOpen(true);
    };
    
    const menuItems = [
      ...(layer.type === 'layer' ? [{
        label: 'Blending Mode',
        subItems: BLEND_MODES.map(mode => ({
          label: mode.label,
          onClick: () => onUpdateProperty(layer.id, { blendMode: mode.value }),
          isSelected: layer.blendMode === mode.value,
        }))
      }] : []),
      { type: 'separator' as const },
      ...(layer.type === 'group' ? [{ label: 'Ungroup', icon: 'ph-folder-minus', onClick: () => onUngroup(layer.id) }] : []),
      { label: 'Group Selection', icon: 'ph-folder-plus', onClick: onGroupSelection },
      { type: 'separator' as const },
      { label: 'Duplicate', icon: 'ph-copy', onClick: () => onDuplicate(layer.id) },
      { label: 'Delete', icon: 'ph-trash', onClick: () => onDelete(layer.id), isDestructive: true },
    ];

    const iconStyle: React.CSSProperties = {
        fontSize: '18px',
        color: isActive ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[2],
        padding: '6px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
    };

    const thumbnailStyle: React.CSSProperties = {
        width: '32px',
        height: '32px',
        borderRadius: '4px',
        backgroundColor: theme.Color.Base.Surface[1],
        backgroundImage: layer.thumbnail ? `url(${layer.thumbnail})` : 'none',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        border: `1px solid ${theme.Color.Base.Surface[3]}`,
        flexShrink: 0,
    };

    return (
        <Reorder.Item
            value={layer}
            dragListener={false}
            dragControls={dragControls}
            style={{ listStyle: 'none' }}
            onDragStart={handleDragStartInternal}
            onDragEnd={handleDragEndInternal}
            onDrag={handleDrag} // Track drag over other items
            layout="position"
            // Important: We attach these data attributes so elementFromPoint in parent can find us
            data-layer-id={layer.id}
            data-is-group={layer.type === 'group'}
        >
            <div 
                style={itemStyle} 
                onClick={() => onSelect(layer.id)}
            >
                {/* Drag Handle */}
                <div 
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        dragControls.start(e);
                    }}
                    style={{ ...iconStyle, cursor: 'grab', touchAction: 'none' }}
                >
                    <i className="ph-bold ph-dots-six-vertical" />
                </div>

                {/* Visibility Toggle */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        onUpdateProperty(layer.id, { isVisible: !layer.isVisible });
                    }}
                    style={{ ...iconStyle }}
                >
                    <i className={`ph-bold ${layer.isVisible ? 'ph-eye' : 'ph-eye-slash'}`} />
                </div>
                
                {/* Group Chevron */}
                {layer.type === 'group' && (
                     <div 
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdateProperty(layer.id, { isOpen: !layer.isOpen });
                        }}
                        style={{ ...iconStyle, transform: layer.isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                        <i className="ph-bold ph-caret-right" />
                    </div>
                )}

                {/* Thumbnail */}
                <div style={thumbnailStyle} />

                {/* Layer Name */}
                <span style={{ 
                    flex: 1, 
                    ...theme.Type.Readable.Label.M, 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    fontWeight: isActive ? 600 : 400
                }}>
                    {layer.name}
                </span>

                {/* Context Menu Trigger */}
                <div onClick={handleMenuOpen} style={iconStyle}>
                    <i className="ph-bold ph-dots-three-vertical" />
                </div>
            </div>
            
            {/* Render Children (Recursive List) */}
            {children}
            
            {isMenuOpen && <ContextMenu items={menuItems} position={menuPosition} onClose={() => setIsMenuOpen(false)} />}
        </Reorder.Item>
    );
});

export default LayerItem;
