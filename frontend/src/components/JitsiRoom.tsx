'use client';

import React, { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        JitsiMeetExternalAPI?: any;
    }
}

const scriptPromises = new Map<string, Promise<void>>();

function buildScriptUrl(domain: string, appId?: string) {
    if (domain === '8x8.vc' && appId) {
        return `https://${domain}/${appId}/external_api.js`;
    }
    return `https://${domain}/external_api.js`;
}

function loadJitsiScript(domain: string, appId?: string): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.JitsiMeetExternalAPI) return Promise.resolve();

    const key = `${domain}:${appId || 'default'}`;
    const existing = scriptPromises.get(key);
    if (existing) return existing;

    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = buildScriptUrl(domain, appId);
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Jitsi script'));
        document.body.appendChild(script);
    });
    scriptPromises.set(key, promise);
    return promise;
}

interface JitsiRoomProps {
    roomName: string;
    displayName?: string;
    email?: string;
    domain?: string;
    appId?: string;
    jwt?: string | null;
    height?: number;
    onReady?: () => void;
}

export default function JitsiRoom({
    roomName,
    displayName,
    email,
    domain = 'meet.jit.si',
    appId,
    jwt,
    height = 520,
    onReady,
}: JitsiRoomProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;

        async function init() {
            setError('');
            setLoading(true);
            try {
                if (domain === '8x8.vc' && !appId) {
                    throw new Error('Missing JaaS App ID');
                }
                await loadJitsiScript(domain, appId);
                if (!mounted) return;

                if (!containerRef.current || !window.JitsiMeetExternalAPI) {
                    throw new Error('Jitsi API not available');
                }

                containerRef.current.innerHTML = '';
                apiRef.current = new window.JitsiMeetExternalAPI(domain, {
                    roomName,
                    parentNode: containerRef.current,
                    jwt: jwt || undefined,
                    userInfo: {
                        displayName,
                        email,
                    },
                    configOverwrite: {
                        disableDeepLinking: true,
                        prejoinPageEnabled: false,
                        startWithAudioMuted: false,
                        // Keep camera dedicated for engagement vision sampling by default.
                        startWithVideoMuted: true,
                    },
                    interfaceConfigOverwrite: {
                        SHOW_JITSI_WATERMARK: false,
                        SHOW_WATERMARK_FOR_GUESTS: false,
                        DEFAULT_REMOTE_DISPLAY_NAME: 'Student',
                        TOOLBAR_ALWAYS_VISIBLE: false,
                    },
                });

                setLoading(false);
                onReady?.();
            } catch (err: any) {
                if (!mounted) return;
                setError(err.message || 'Unable to load meeting');
                setLoading(false);
            }
        }

        if (roomName) {
            init();
        }

        return () => {
            mounted = false;
            if (apiRef.current) {
                apiRef.current.dispose();
                apiRef.current = null;
            }
        };
    }, [roomName, displayName, email, domain, appId, jwt, onReady]);

    return (
        <div className="w-full">
            {loading && (
                <div className="h-32 flex items-center justify-center text-slate-500 text-xs uppercase tracking-widest font-mono">
                    Loading Live Class...
                </div>
            )}
            {error && (
                <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-4 text-rose-200 text-sm">
                    {error}
                </div>
            )}
            <div
                ref={containerRef}
                style={{ height }}
                className="w-full rounded-xl overflow-hidden border border-slate-700/60"
            />
        </div>
    );
}
