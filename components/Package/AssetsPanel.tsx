/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef } from 'react';
import { useTheme } from '../../Theme.tsx';
import Button from '../Core/Button.tsx';
import Input from '../Core/Input.tsx';
import Select from '../Core/Select.tsx';

interface AssetsPanelProps {
  onExport: (fileName: string, format: 'png' | 'svg') => void;
  onImportSVG: (svgString: string) => void;
}

const AssetsPanel: React.FC<AssetsPanelProps> = ({ onExport, onImportSVG }) => {
    const { theme } = useTheme();
    const [fileName, setFileName] = useState('My Texture');
    const [format, setFormat] = useState<'png' | 'svg'>('png');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === "image/svg+xml") {
            const reader = new FileReader();
            reader.onload = (e) => {
                const svgString = e.target?.result as string;
                if (svgString) {
                    onImportSVG(svgString);
                }
            };
            reader.readAsText(file);
        } else {
            console.error("Please select a valid SVG file.");
        }
        
        if (event.target) {
            event.target.value = '';
        }
    };

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

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".svg,image/svg+xml"
                style={{ display: 'none' }}
            />
            <Button 
                label="Import SVG" 
                variant="ghost" 
                size="S" 
                icon="ph-upload-simple"
                onClick={handleImportClick}
            />
            <Button label="Copy Canvas Code" variant="ghost" size="S" icon="ph-code" />
        </div>
    );
};

export default AssetsPanel;