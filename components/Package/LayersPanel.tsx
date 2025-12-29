/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useMemo, useCallback } from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer } from '../../types/index.tsx';
import LayerItem from '../Core/LayerItem.tsx';
import Button from '../Core/Button.tsx';
import { Reorder } from 'framer-motion';

interface LayersPanelProps {
    layers: Layer[];
    activeLayerId: string | null;
    onAddLayer: () => void;
    onSelectLayer: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    onUpdateLayerProperty: (id: string, properties: Partial<Layer>) => void;
    onReorderLayers: (layers: Layer[]) => void;
}

const LayersPanel: React.FC<LayersPanelProps> = ({ 
    layers, 
    activeLayerId, 
    onAddLayer, 
    onSelectLayer,
    onDeleteLayer,
    onDuplicateLayer,
    onUpdateLayerProperty,
    onReorderLayers,
}) => {
    const { theme } = useTheme();

    // Visual Order: Top-to-Bottom (standard for layer lists)
    // We reverse the underlying state (Bottom-to-Top) for display.
    const displayLayers = useMemo(() => [...layers].reverse(), [layers]);

    const handleReorder = useCallback((newDisplayOrder: Layer[]) => {
        // newDisplayOrder is Top -> Bottom.
        // Convert back to Bottom -> Top for the logical rendering order.
        const newRenderOrder = [...newDisplayOrder].reverse();
        onReorderLayers(newRenderOrder);
    }, [onReorderLayers]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}>
            {/* Scroll Wrapper: Reorder.Group often fails if it is its own scroll container */}
            <div style={{ 
                maxHeight: '350px', 
                overflowY: 'auto', 
                paddingRight: '4px',
                paddingBottom: '8px',
                scrollbarWidth: 'thin',
                scrollbarColor: `${theme.Color.Base.Surface[3]} transparent`
            }}>
                <Reorder.Group
                    axis="y"
                    values={displayLayers}
                    onReorder={handleReorder}
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}
                >
                    {displayLayers.map(layer => (
                        <LayerItem
                            key={layer.id}
                            layer={layer}
                            isActive={layer.id === activeLayerId}
                            onSelect={onSelectLayer}
                            onDelete={onDeleteLayer}
                            onDuplicate={onDuplicateLayer}
                            onUpdateProperty={onUpdateLayerProperty}
                        />
                    ))}
                </Reorder.Group>
            </div>
            
            <Button
                label="Add Layer"
                icon="ph-plus"
                variant="secondary"
                size="M"
                onClick={onAddLayer}
            />
        </div>
    );
};

export default LayersPanel;