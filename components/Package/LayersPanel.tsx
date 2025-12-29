/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer } from '../../types/index.tsx';
import LayerItem from '../Core/LayerItem.tsx';
import Button from '../Core/Button.tsx';

interface LayersPanelProps {
    layers: Layer[];
    activeLayerId: string | null;
    onAddLayer: () => void;
    onSelectLayer: (id: string) => void;
}

const LayersPanel: React.FC<LayersPanelProps> = ({ layers, activeLayerId, onAddLayer, onSelectLayer }) => {
    const { theme } = useTheme();
    const reversedLayers = [...layers].reverse();

    return (
        <div>
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: theme.spacing['Space.M'], paddingRight: '4px' }}>
                {reversedLayers.map(layer => (
                    <LayerItem
                        key={layer.id}
                        layer={layer}
                        isActive={layer.id === activeLayerId}
                        onSelect={onSelectLayer}
                    />
                ))}
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