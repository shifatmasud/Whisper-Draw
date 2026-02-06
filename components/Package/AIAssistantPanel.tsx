/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useTheme } from '../../Theme.tsx';
import { ChatMessage } from '../../types/index.tsx';
import { motion, AnimatePresence } from 'framer-motion';

interface AIAssistantPanelProps {
  onAddToCanvas: (svgString: string) => void;
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ onAddToCanvas }) => {
    const { theme } = useTheme();
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini-api-key') || '');
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: "I'm your AI design assistant. Describe a vector illustration or texture you'd like me to create." }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem('gemini-api-key', apiKey);
    }, [apiKey]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const extractSvg = (text: string): string | null => {
        const svgRegex = /<svg[\s\S]*?<\/svg>/i;
        const match = text.match(svgRegex);
        return match ? match[0] : null;
    };

    const handleSend = async () => {
        if (!prompt.trim()) return;
        if (!apiKey.trim()) {
            setError('Please enter your Google AI API key above.');
            return;
        }
        setError('');
        setIsLoading(true);

        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
        setMessages(newMessages);
        setPrompt('');
        
        try {
            const ai = new GoogleGenAI({ apiKey });
            
            const systemInstruction = "You are an expert vector artist. Generate a clean, single-layer SVG code for the following request. The SVG should be simple, black and white, and suitable for use as a texture or an alpha mask. Do not include any XML declaration, comments, or width/height attributes. Only output the `<svg>` tag and its content. The SVG viewbox should be square, e.g., '0 0 100 100'. Ensure paths have a black fill (`fill=\"#000\"`) and no stroke unless specified.";
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                }
            });
            
            const text = response.text;
            const svgContent = extractSvg(text);

            setMessages([...newMessages, { role: 'model', content: text, isSvg: !!svgContent }]);
        } catch (e: any) {
            console.error(e);
            const errorMessage = e.message?.includes('API key not valid') 
              ? 'API key not valid. Please check your key and try again.'
              : 'An error occurred. Please check the console for details.';
            setError(errorMessage);
            setMessages([...newMessages, { role: 'model', content: `Sorry, I encountered an error: ${errorMessage}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !isLoading) {
            handleSend();
        }
    };

    const inputWrapperStyle: React.CSSProperties = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: theme.Color.Base.Surface['2'],
        borderRadius: theme.radius['Radius.M'],
    };

    const inputStyle: React.CSSProperties = {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: theme.spacing['Space.M'],
        paddingLeft: '40px',
        color: theme.Color.Base.Content['1'],
        ...theme.Type.Readable.Body.M,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: theme.spacing['Space.M'] }}>
            <div style={inputWrapperStyle}>
                <i className="ph-bold ph-key" style={{ position: 'absolute', left: '12px', color: theme.Color.Base.Content['3'] }} />
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Google AI API Key..."
                    style={{ ...inputStyle, fontSize: '12px' }}
                />
            </div>

            {error && <p style={{ ...theme.Type.Readable.Body.S, color: theme.Color.Error.Content[1], margin: 0, textAlign: 'center' }}>{error}</p>}
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], padding: `0 ${theme.spacing['Space.S']}` }}>
                <AnimatePresence>
                    {messages.map((msg, index) => (
                        <motion.div
                            key={index}
                            layout
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1.0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                            }}
                        >
                            <div style={{
                                padding: theme.spacing['Space.M'],
                                borderRadius: theme.radius['Radius.M'],
                                backgroundColor: msg.role === 'user' ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface['2'],
                                color: msg.role === 'user' ? theme.Color.Accent.Content[1] : theme.Color.Base.Content['1'],
                                ...theme.Type.Readable.Body.M,
                            }}>
                                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{msg.content}</pre>
                                {msg.isSvg && (
                                    <div style={{ marginTop: theme.spacing['Space.M'], display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.S'] }}>
                                        <div style={{ padding: theme.spacing['Space.S'], backgroundColor: '#fff', borderRadius: theme.radius['Radius.S'], border: `1px solid ${theme.Color.Base.Surface[3]}` }}>
                                          <div dangerouslySetInnerHTML={{ __html: extractSvg(msg.content) || '' }} />
                                        </div>
                                        <motion.button
                                            onClick={() => onAddToCanvas(extractSvg(msg.content) || '')}
                                            style={{
                                              width: '100%', border: 'none', padding: `${theme.spacing['Space.S']} ${theme.spacing['Space.M']}`,
                                              borderRadius: theme.radius['Radius.S'], backgroundColor: theme.Color.Success.Surface[1], color: theme.Color.Success.Content[1],
                                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing['Space.S'], ...theme.Type.Readable.Label.M
                                            }}
                                            whileHover={{ filter: 'brightness(1.1)' }} whileTap={{ scale: 0.98 }}
                                        >
                                            <i className="ph-bold ph-plus-circle" />
                                            <span>Add to Canvas</span>
                                        </motion.button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <div style={inputWrapperStyle}>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    style={{ ...inputStyle, paddingLeft: '16px', paddingRight: '50px' }}
                    disabled={isLoading}
                />
                <motion.button
                    onClick={handleSend}
                    disabled={isLoading}
                    style={{
                        position: 'absolute', right: '8px', width: '32px', height: '32px', borderRadius: theme.radius['Radius.S'],
                        border: 'none', backgroundColor: theme.Color.Accent.Surface[1], color: theme.Color.Accent.Content[1],
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                >
                    {isLoading ? <motion.div
                        style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${theme.Color.Accent.Content[1]}`, borderTopColor: 'transparent' }}
                        animate={{ rotate: 360 }}
                        transition={{ loop: Infinity, duration: 1, ease: 'linear' }}
                    /> : <i className="ph-bold ph-paper-plane-tilt" />}
                </motion.button>
            </div>
        </div>
    );
};

export default AIAssistantPanel;
