/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { useTheme } from '../../Theme.tsx';
import Button from '../Core/Button.tsx';
import Input from '../Core/Input.tsx';
import Select from '../Core/Select.tsx';

interface AssetsPanelProps {
  onExport: (fileName: string, format: 'png' | 'svg') => void;
}

const AssetsPanel: React.FC<AssetsPanelProps> = ({ onExport }) => {
    const { theme } = useTheme();
    const [fileName, setFileName] = useState('My Texture');
    const [format, setFormat] = useState<'png' | 'svg'>('png');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}>
            <p style={{ ...theme.Type.Readable.Body.S, color: theme.Color.Base.Content[2], margin: 0 }}>
                Export your creation.
            </p>
            
            <div style={{ display: 'flex', gap: theme.spacing['Space.S'], alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <Input 
                        label="File Name" 
                        value={fileName} 
                        onChange={(e) => setFileName(e.target.value)} 
                    />
                </div>
                <div style={{ width: '100px' }}>
                    <Select 
                        label="Format" 
                        value={format} 
                        onChange={(e) => setFormat(e.target.value)}
                        options={[
                            { value: 'png', label: '.PNG' },
                            { value: 'svg', label: '.SVG' }
                        ]}
                    />
                </div>
            </div>

            <Button 
                label="Export File" 
                variant="primary" 
                size="M" 
                icon="ph-download-simple"
                onClick={() => onExport(fileName, format)}
            />

            <div style={{ height: '1px', backgroundColor: theme.Color.Base.Surface[3], margin: `${theme.spacing['Space.S']} 0` }} />

            <Button label="Import Image" variant="ghost" size="S" icon="ph-image" />
            <Button label="Copy Canvas Code" variant="ghost" size="S" icon="ph-code" />
        </div>
    );
};

export default AssetsPanel;