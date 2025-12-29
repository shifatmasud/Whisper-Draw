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
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdateProperty: (id: string, properties: Partial<Layer>) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    isReordering?: boolean;
}

const BLEND_MODES: { value: BlendMode, label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

const LayerItem: React.FC<LayerItemProps> = React.memo(({ layer, isActive, onSelect, onDelete, onDuplicate, onUpdateProperty, onDragStart, onDragEnd, isReordering = false }) => {
    const { theme } = useTheme();
    const dragControls = useDragControls();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [isDraggingThisItem, setIsDraggingThisItem] = useState(false);

    const isOtherItemDragging = isReordering && !isDraggingThisItem;

    const handleDragStartInternal = () => {
        setIsDraggingThisItem(true);
        onDragStart();
    };
    
    const handleDragEndInternal = () => {
        setIsDraggingThisItem(false);
        onDragEnd();
    };

    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing['Space.S'],
        padding: theme.spacing['Space.S'],
        borderRadius: theme.radius['Radius.S'],
        backgroundColor: isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[2],
        color: isActive ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[1],
        border: `1px solid ${isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[3]}`,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        transition: `background-color ${theme.time['Time.1x']} ease, border-color ${theme.time['Time.1x']} ease, opacity 0.2s ease`,
        opacity: isOtherItemDragging ? 0.4 : 1,
        pointerEvents: isOtherItemDragging ? 'none' : 'auto',
    };
    
    const handleMenuOpen = (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setIsMenuOpen(true);
    };
    
    const menuItems = [
      {
        label: 'Blending Mode',
        subItems: BLEND_MODES.map(mode => ({
          label: mode.label,
          onClick: () => onUpdateProperty(layer.id, { blendMode: mode.value }),
          isSelected: layer.blendMode === mode.value,
        }))
      },
      { type: 'separator' as const },
      { label: 'Duplicate Layer', icon: 'ph-copy', onClick: () => onDuplicate(layer.id) },
      { type: 'separator' as const },
      { label: 'Delete Layer', icon: 'ph-trash', onClick: () => onDelete(layer.id), isDestructive: true },
    ];

    const iconStyle: React.CSSProperties = {
        fontSize: '18px',
        color: isActive ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[2],
        padding: '6px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `background-color ${theme.time['Time.1x']} ease`,
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
                    style={{ ...iconStyle, cursor: isOtherItemDragging ? 'default' : 'grab', touchAction: 'none' }}
                >
                    <i className="ph-bold ph-dots-six-vertical" />
                </div>

                {/* Visibility Toggle */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        onUpdateProperty(layer.id, { isVisible: !layer.isVisible });
                    }}
                    style={{ ...iconStyle, cursor: 'pointer' }}
                >
                    <i className={`ph-bold ${layer.isVisible ? 'ph-eye' : 'ph-eye-slash'}`} />
                </div>

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
                <div
                    onClick={handleMenuOpen}
                    style={{ ...iconStyle, cursor: 'pointer' }}
                >
                    <i className="ph-bold ph-dots-three-vertical" />
                </div>
            </div>
            {isMenuOpen && <ContextMenu items={menuItems} position={menuPosition} onClose={() => setIsMenuOpen(false)} />}
        </Reorder.Item>
    );
});

export default LayerItem;