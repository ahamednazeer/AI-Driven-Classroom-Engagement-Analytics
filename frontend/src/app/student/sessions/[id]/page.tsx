'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import JitsiRoom from '@/components/JitsiRoom';
import { Pulse, ArrowLeft, Play, VideoCamera } from '@phosphor-icons/react';

interface SessionData {
    id: number;
    session_code: string;
    class_id?: number;
    course: string;
    subject: string;
    topic: string;
    scheduled_start: string;
    scheduled_end: string;
    tracking_enabled: boolean;
    status: string;
    started_at?: string;
    ended_at?: string;
}

interface SessionQuizItem {
    id: number;
    session_id: number;
    question: string;
    options: string[];
    duration_seconds?: number;
    expires_at?: string | null;
    remaining_seconds?: number | null;
    is_active: boolean;
    created_at: string;
    total_responses: number;
    correct_responses: number;
}

interface StudentQuizStats {
    attempted: number;
    correct: number;
    accuracy: number;
}

function clamp(value: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, value));
}

function optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
}

interface QuizFeedback {
    type: 'SUCCESS' | 'ERROR' | 'INFO';
    message: string;
}

function quizRemainingSeconds(quiz: SessionQuizItem, nowMs: number): number | null {
    if (quiz.expires_at) {
        const expiresAtMs = new Date(quiz.expires_at).getTime();
        if (!Number.isNaN(expiresAtMs)) {
            return Math.max(Math.floor((expiresAtMs - nowMs) / 1000), 0);
        }
    }
    if (typeof quiz.remaining_seconds === 'number') {
        return Math.max(quiz.remaining_seconds, 0);
    }
    return null;
}

function formatDuration(seconds: number | null): string {
    if (seconds === null) return '--:--';
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const secs = safe % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;
        return `${hours}:${String(remMinutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function StudentSessionDetailPage() {
    const params = useParams();
    const sessionId = useMemo(() => {
        const raw = (params as { id?: string | string[] })?.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        return id ? Number(id) : NaN;
    }, [params]);

    const [session, setSession] = useState<SessionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false);
    const [showMeeting, setShowMeeting] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [jitsiConfig, setJitsiConfig] = useState<{ domain: string; room: string; jwt?: string | null; appId?: string } | null>(null);
    const [jitsiError, setJitsiError] = useState('');

    const [telemetryState, setTelemetryState] = useState<'IDLE' | 'ACTIVE' | 'ERROR'>('IDLE');
    const [telemetryMessage, setTelemetryMessage] = useState('');
    const [cameraState, setCameraState] = useState<'IDLE' | 'ACTIVE' | 'DENIED' | 'ERROR'>('IDLE');
    const [cameraMessage, setCameraMessage] = useState('');
    const [socketState, setSocketState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('DISCONNECTED');
    const [faceVisibility, setFaceVisibility] = useState<'UNKNOWN' | 'VISIBLE' | 'NOT_VISIBLE'>('UNKNOWN');
    const [faceConfidence, setFaceConfidence] = useState<number | null>(null);

    const [activeQuizzes, setActiveQuizzes] = useState<SessionQuizItem[]>([]);
    const [quizStats, setQuizStats] = useState<StudentQuizStats>({ attempted: 0, correct: 0, accuracy: 0 });
    const [answeringQuizId, setAnsweringQuizId] = useState<number | null>(null);
    const [selectedQuizOptions, setSelectedQuizOptions] = useState<Record<number, number>>({});
    const [quizFeedback, setQuizFeedback] = useState<QuizFeedback | null>(null);
    const [quizClock, setQuizClock] = useState<number>(Date.now());

    const joinStartedAtRef = useRef<number | null>(null);
    const lastInteractionRef = useRef<number>(Date.now());
    const interactionCountRef = useRef<number>(0);
    const hiddenAccumulatedRef = useRef<number>(0);
    const hiddenStartedAtRef = useRef<number | null>(null);
    const focusedRef = useRef<boolean>(true);
    const answeredQuizAtRef = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const cameraRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const engagementWsRef = useRef<WebSocket | null>(null);

    const loadSession = useCallback(async () => {
        if (!Number.isFinite(sessionId)) return;
        setLoading(true);
        setError('');
        try {
            const data = await api.getSession(sessionId);
            setSession(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load session';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    const loadActiveQuizzes = useCallback(async () => {
        if (!session) return;
        try {
            const data = await api.listActiveSessionQuizzes(session.id);
            setActiveQuizzes(data.quizzes || []);
        } catch {
            setActiveQuizzes([]);
        }
    }, [session]);

    const loadQuizStats = useCallback(async () => {
        if (!session || !joined) return;
        try {
            const stats = await api.getMySessionQuizStats(session.id);
            setQuizStats(stats);
        } catch {
            setQuizStats({ attempted: 0, correct: 0, accuracy: 0 });
        }
    }, [session, joined]);

    useEffect(() => {
        void loadSession();
    }, [loadSession]);

    useEffect(() => {
        async function loadUser() {
            try {
                const me = await api.getMe();
                const name = `${me.first_name || ''} ${me.last_name || ''}`.trim();
                setDisplayName(name || me.username || 'Student');
            } catch {
                setDisplayName('Student');
            }
        }
        void loadUser();
    }, []);

    useEffect(() => {
        async function loadJitsi() {
            if (!showMeeting || !session) return;
            setJitsiError('');
            try {
                const data = await api.getJitsiToken(session.id);
                setJitsiConfig({
                    domain: data.domain,
                    room: data.room,
                    jwt: data.jwt || null,
                    appId: data.app_id,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load live class';
                setJitsiError(message);
            }
        }
        void loadJitsi();
    }, [showMeeting, session]);

    useEffect(() => {
        if (!joined || !session || session.status !== 'LIVE') return;
        void loadActiveQuizzes();
        void loadQuizStats();
        const interval = setInterval(() => {
            void loadActiveQuizzes();
            void loadQuizStats();
        }, 10000);
        return () => clearInterval(interval);
    }, [joined, session, loadActiveQuizzes, loadQuizStats]);

    useEffect(() => {
        setSelectedQuizOptions((prev) => {
            const activeIds = new Set(activeQuizzes.map((quiz) => quiz.id));
            const next: Record<number, number> = {};
            Object.entries(prev).forEach(([quizId, selectedIndex]) => {
                const parsed = Number(quizId);
                if (activeIds.has(parsed)) {
                    next[parsed] = selectedIndex;
                }
            });
            return next;
        });
    }, [activeQuizzes]);

    useEffect(() => {
        if (!quizFeedback) return;
        const timeoutId = setTimeout(() => setQuizFeedback(null), 5000);
        return () => clearTimeout(timeoutId);
    }, [quizFeedback]);

    useEffect(() => {
        const interval = setInterval(() => setQuizClock(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const stopCamera = useCallback(() => {
        if (cameraRecoveryTimerRef.current) {
            clearTimeout(cameraRecoveryTimerRef.current);
            cameraRecoveryTimerRef.current = null;
        }
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach((track) => {
                track.onended = null;
                track.onmute = null;
                track.onunmute = null;
                track.stop();
            });
            cameraStreamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const startCamera = useCallback(async () => {
        const existingStream = cameraStreamRef.current;
        if (existingStream && existingStream.getVideoTracks().some((track) => track.readyState === 'live')) {
            setCameraState('ACTIVE');
            return;
        }
        if (existingStream) {
            stopCamera();
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraState('ERROR');
            setCameraMessage('Camera API unavailable. Real-only signal mode is blocked.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: 'user',
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 8, max: 12 },
                },
            });
            cameraStreamRef.current = stream;
            const [videoTrack] = stream.getVideoTracks();
            if (videoTrack) {
                videoTrack.onended = () => {
                    if (cameraRecoveryTimerRef.current) return;
                    setCameraState('ERROR');
                    setCameraMessage('Camera interrupted (stream-ended). Recovering...');
                    cameraRecoveryTimerRef.current = setTimeout(() => {
                        cameraRecoveryTimerRef.current = null;
                        void (async () => {
                            stopCamera();
                            await startCamera();
                        })();
                    }, 1200);
                };
                videoTrack.onmute = () => setCameraMessage('Camera temporarily muted...');
                videoTrack.onunmute = () => {
                    setCameraState('ACTIVE');
                    setCameraMessage('Live camera attention sampling enabled');
                };
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }
            setCameraState('ACTIVE');
            setCameraMessage('Live camera attention sampling enabled');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Camera permission denied';
            const lowered = message.toLowerCase();
            if (lowered.includes('permission') || lowered.includes('denied') || lowered.includes('notallowed')) {
                setCameraState('DENIED');
                setCameraMessage('Camera permission denied. Real-only signal mode is blocked.');
            } else {
                setCameraState('ERROR');
                setCameraMessage('Unable to start camera. Real-only signal mode is blocked.');
            }
            stopCamera();
        }
    }, [stopCamera]);

    const captureVisionFrame = useCallback(async (): Promise<File | null> => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
            return null;
        }
        const width = Math.max(video.videoWidth || 320, 1);
        const height = Math.max(video.videoHeight || 240, 1);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(video, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.72);
        });
        if (!blob) return null;
        return new File([blob], `attention-${Date.now()}.jpg`, { type: 'image/jpeg' });
    }, []);

    useEffect(() => {
        if (!joined || !session || session.status !== 'LIVE') {
            stopCamera();
            setCameraState((prev) => (prev === 'IDLE' ? prev : 'IDLE'));
            setCameraMessage('');
            return;
        }

        let cancelled = false;
        const activate = async () => {
            await startCamera();
            if (cancelled) {
                stopCamera();
            }
        };
        void activate();

        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [joined, session, startCamera, stopCamera]);

    const fileToDataUrl = useCallback(async (file: File): Promise<string | null> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(typeof reader.result === 'string' ? reader.result : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }, []);

    const disconnectEngagementSocket = useCallback(() => {
        if (engagementWsRef.current) {
            engagementWsRef.current.onopen = null;
            engagementWsRef.current.onclose = null;
            engagementWsRef.current.onerror = null;
            engagementWsRef.current.onmessage = null;
            engagementWsRef.current.close();
            engagementWsRef.current = null;
        }
    }, []);

    const connectEngagementSocket = useCallback(() => {
        if (!session || !joined || session.status !== 'LIVE') return;
        const existing = engagementWsRef.current;
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = api.getEngagementWebSocketUrl(session.id);
        if (!wsUrl.includes('token=')) {
            setSocketState('ERROR');
            setTelemetryState('ERROR');
            setTelemetryMessage('Missing auth token for engagement socket');
            return;
        }

        try {
            setSocketState('CONNECTING');
            const ws = new WebSocket(wsUrl);
            engagementWsRef.current = ws;

            ws.onopen = () => {
                setSocketState('CONNECTED');
            };
            ws.onclose = () => {
                setSocketState('DISCONNECTED');
                if (engagementWsRef.current === ws) {
                    engagementWsRef.current = null;
                }
            };
            ws.onerror = () => {
                setSocketState('ERROR');
            };
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data as string);
                    if (data?.type === 'signal_ack') {
                        const hasFace = data?.vision?.face_visible === true || Number(data?.vision?.face_count || 0) > 0;
                        const confidence = typeof data?.vision?.confidence === 'number'
                            ? clamp(Number(data.vision.confidence))
                            : null;
                        setFaceVisibility(hasFace ? 'VISIBLE' : 'NOT_VISIBLE');
                        setFaceConfidence(confidence);
                        setTelemetryState('ACTIVE');
                        setTelemetryMessage(
                            hasFace
                                ? `Vision sample: ${new Date().toLocaleTimeString()} | Face visible`
                                : `Vision sample: ${new Date().toLocaleTimeString()} | Face not visible`
                        );
                    } else if (data?.type === 'error') {
                        setTelemetryState('ERROR');
                        setTelemetryMessage(String(data?.detail || 'Socket signal error'));
                    }
                } catch {
                    // Ignore non-JSON socket payloads.
                }
            };
        } catch {
            setSocketState('ERROR');
            setTelemetryState('ERROR');
            setTelemetryMessage('Unable to open engagement socket');
        }
    }, [session, joined]);

    useEffect(() => {
        if (!joined || !session || session.status !== 'LIVE') {
            disconnectEngagementSocket();
            setSocketState('DISCONNECTED');
            return;
        }
        connectEngagementSocket();
        return () => {
            disconnectEngagementSocket();
        };
    }, [joined, session, connectEngagementSocket, disconnectEngagementSocket]);

    const registerInteraction = useCallback(() => {
        lastInteractionRef.current = Date.now();
        interactionCountRef.current += 1;
    }, []);

    useEffect(() => {
        if (!joined || !session || session.status !== 'LIVE') return;

        const onVisibilityChange = () => {
            const now = Date.now();
            const isVisible = document.visibilityState === 'visible';
            if (!isVisible) {
                hiddenStartedAtRef.current = now;
                focusedRef.current = false;
            } else {
                if (hiddenStartedAtRef.current !== null) {
                    hiddenAccumulatedRef.current += now - hiddenStartedAtRef.current;
                    hiddenStartedAtRef.current = null;
                }
                focusedRef.current = document.hasFocus();
                registerInteraction();
            }
        };

        const onFocus = () => {
            focusedRef.current = true;
            registerInteraction();
        };

        const onBlur = () => {
            focusedRef.current = false;
        };

        const eventNames: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        eventNames.forEach((name) => window.addEventListener(name, registerInteraction, { passive: true }));
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        return () => {
            eventNames.forEach((name) => window.removeEventListener(name, registerInteraction));
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
        };
    }, [joined, session, registerInteraction]);

    const sendTelemetrySignal = useCallback(async () => {
        if (!session || !joined || session.status !== 'LIVE') return;
        if (joinStartedAtRef.current === null) {
            joinStartedAtRef.current = Date.now();
        }

        const now = Date.now();
        const joinAt = joinStartedAtRef.current || now;
        const sessionElapsedMs = Math.max(now - joinAt, 1);
        const hiddenMs = hiddenAccumulatedRef.current + (hiddenStartedAtRef.current !== null ? now - hiddenStartedAtRef.current : 0);
        const visibleRatio = clamp(1 - (hiddenMs / sessionElapsedMs));

        const isVisible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
        const isFocused = typeof document === 'undefined' ? true : (isVisible && focusedRef.current && document.hasFocus());

        const recencySeconds = (now - lastInteractionRef.current) / 1000;
        const interactionBurst = clamp(interactionCountRef.current / 10);
        const answeredRecently = answeredQuizAtRef.current !== null && (now - answeredQuizAtRef.current) < (3 * 60 * 1000);
        const movementIntensity = clamp(
            (interactionBurst * 0.65)
            + (isFocused ? 0.2 : 0.06)
            + (isVisible ? 0.09 : 0)
        );
        const participationEstimate = clamp(
            0.18
            + (interactionBurst * 0.5)
            + (answeredRecently ? 0.22 : 0)
            + (showMeeting ? 0.08 : 0)
            + (isFocused ? 0.05 : 0)
        );
        const attendanceConsistency = clamp(0.55 + (visibleRatio * 0.45));

        try {
            if (cameraState !== 'ACTIVE' || !cameraStreamRef.current) {
                setTelemetryState('ERROR');
                setTelemetryMessage('Camera is reconnecting...');
                await startCamera();
            }

            const socket = engagementWsRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                setTelemetryState('ERROR');
                setTelemetryMessage('Engagement socket is disconnected');
                connectEngagementSocket();
                return;
            }

            let frame = await captureVisionFrame();
            if (!frame) {
                await startCamera();
                await new Promise((resolve) => setTimeout(resolve, 200));
                frame = await captureVisionFrame();
            }
            if (!frame) {
                setTelemetryState('ERROR');
                setTelemetryMessage('Unable to capture camera frame. Check camera visibility.');
                return;
            }

            const imageBase64 = await fileToDataUrl(frame);
            if (!imageBase64) {
                setTelemetryState('ERROR');
                setTelemetryMessage('Unable to encode camera frame');
                return;
            }

            socket.send(JSON.stringify({
                type: 'vision_sample',
                image_base64: imageBase64,
                participation: Number(participationEstimate.toFixed(3)),
                attendance_consistency: Number(attendanceConsistency.toFixed(3)),
                interaction_recency_seconds: Number(recencySeconds.toFixed(1)),
                interaction_events: interactionCountRef.current,
                movement_intensity: Number(movementIntensity.toFixed(3)),
            }));
            setTelemetryState('ACTIVE');
            setTelemetryMessage(`Vision sample queued: ${new Date().toLocaleTimeString()}`);
            interactionCountRef.current = 0;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to send engagement sample';
            setTelemetryState('ERROR');
            setTelemetryMessage(message);
        }
    }, [session, joined, showMeeting, captureVisionFrame, cameraState, connectEngagementSocket, fileToDataUrl, startCamera]);

    useEffect(() => {
        if (!joined || !session || session.status !== 'LIVE') {
            setTelemetryState('IDLE');
            setTelemetryMessage('');
            setFaceVisibility('UNKNOWN');
            setFaceConfidence(null);
            return;
        }
        void sendTelemetrySignal();
        const interval = setInterval(() => {
            void sendTelemetrySignal();
        }, 12000);
        return () => clearInterval(interval);
    }, [joined, session, sendTelemetrySignal]);

    const handleJoin = async () => {
        if (!session) return;
        try {
            setJoining(true);
            await api.joinSession(session.id, {
                auth_type: 'password',
                device_info: {
                    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
                },
            });
            joinStartedAtRef.current = Date.now();
            hiddenAccumulatedRef.current = 0;
            hiddenStartedAtRef.current = null;
            focusedRef.current = true;
            interactionCountRef.current = 0;
            lastInteractionRef.current = Date.now();
            setJoined(true);
            await loadActiveQuizzes();
            await loadQuizStats();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to join session';
            alert(message);
        } finally {
            setJoining(false);
        }
    };

    const handleSelectQuizOption = (quizId: number, selectedOptionIndex: number) => {
        setSelectedQuizOptions((prev) => ({ ...prev, [quizId]: selectedOptionIndex }));
    };

    const handleQuizAnswer = async (quiz: SessionQuizItem) => {
        if (!session) return;
        const remainingSeconds = quizRemainingSeconds(quiz, quizClock);
        if (remainingSeconds !== null && remainingSeconds <= 0) {
            setQuizFeedback({ type: 'ERROR', message: 'Quiz time is over. Wait for the next checkpoint.' });
            await loadActiveQuizzes();
            return;
        }
        const selectedOptionIndex = selectedQuizOptions[quiz.id];
        if (selectedOptionIndex === undefined) {
            setQuizFeedback({ type: 'ERROR', message: 'Please choose an option before submitting.' });
            return;
        }
        try {
            setAnsweringQuizId(quiz.id);
            const result = await api.submitSessionQuizAnswer(session.id, quiz.id, selectedOptionIndex);
            answeredQuizAtRef.current = Date.now();
            setQuizFeedback({
                type: result?.is_correct ? 'SUCCESS' : 'INFO',
                message: result?.is_correct
                    ? `Answer submitted. Correct (${optionLabel(selectedOptionIndex)}).`
                    : `Answer submitted. Correct option is ${optionLabel(Number(result?.correct_option_index ?? 0))}.`,
            });
            setSelectedQuizOptions((prev) => {
                const next = { ...prev };
                delete next[quiz.id];
                return next;
            });
            await loadActiveQuizzes();
            await loadQuizStats();
            await sendTelemetrySignal();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to submit answer';
            setQuizFeedback({ type: 'ERROR', message });
        } finally {
            setAnsweringQuizId(null);
        }
    };

    if (!Number.isFinite(sessionId)) {
        return <div className="text-slate-500">Invalid session.</div>;
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-sky-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-sky-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Session...
                </p>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="space-y-4">
                <a href="/student/sessions" className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-2">
                    <ArrowLeft size={18} /> Back to Sessions
                </a>
                <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-6 text-rose-200">
                    {error || 'Session not found'}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <video ref={videoRef} autoPlay muted playsInline className="hidden" />
            <canvas ref={canvasRef} className="hidden" />

            <a href="/student/sessions" className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-2">
                <ArrowLeft size={18} /> Back to Sessions
            </a>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider">{session.topic}</h1>
                    <p className="text-slate-500 mt-1">{session.subject} / {session.course}</p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge status={session.status} />
                    {session.status === 'LIVE' && (
                        <button
                            onClick={handleJoin}
                            disabled={joining || joined}
                            className="bg-emerald-700/80 hover:bg-emerald-600 rounded-xl px-4 py-2 text-sm uppercase tracking-wider font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            <Play size={16} /> {joined ? 'Joined' : 'Join Session'}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Session Info</h3>
                    <div className="space-y-2 text-sm text-slate-300">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Session Code</span>
                            <span>{session.session_code}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Scheduled</span>
                            <span>{new Date(session.scheduled_start).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Ends</span>
                            <span>{new Date(session.scheduled_end).toLocaleString()}</span>
                        </div>
                    </div>
                    {session.status === 'LIVE' && joined && (
                        <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-mono uppercase tracking-wider">Telemetry</span>
                                <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                                        telemetryState === 'ACTIVE'
                                            ? 'text-emerald-300 border-emerald-700/40 bg-emerald-950/40'
                                            : telemetryState === 'ERROR'
                                                ? 'text-rose-300 border-rose-700/40 bg-rose-950/40'
                                                : 'text-slate-400 border-slate-700/40 bg-slate-900/40'
                                    }`}
                                >
                                    {telemetryState}
                                </span>
                            </div>
                            {telemetryMessage && (
                                <div className="text-xs text-slate-500">{telemetryMessage}</div>
                            )}
                            <div className="text-xs text-slate-500">
                                Camera: {cameraState}
                                {cameraState === 'ACTIVE' ? ' (real visual attention)' : ' (real-only mode blocked)'}
                            </div>
                            <div className="text-xs text-slate-500">
                                Face: {
                                    faceVisibility === 'VISIBLE'
                                        ? 'Visible'
                                        : faceVisibility === 'NOT_VISIBLE'
                                            ? 'Not visible'
                                            : 'Unknown'
                                }
                                {faceConfidence !== null ? ` (${Math.round(faceConfidence * 100)}% confidence)` : ''}
                            </div>
                            <div className="text-xs text-slate-500">
                                Socket: {socketState}
                            </div>
                            {cameraMessage && (
                                <div className="text-xs text-slate-500">{cameraMessage}</div>
                            )}
                            <div className="text-xs text-slate-500">
                                Quiz Accuracy: {(quizStats.accuracy * 100).toFixed(1)}% ({quizStats.correct}/{quizStats.attempted})
                            </div>
                            <button
                                onClick={() => void sendTelemetrySignal()}
                                className="w-full bg-slate-700/70 hover:bg-slate-600 rounded-lg px-3 py-2 text-[11px] uppercase tracking-wider font-mono"
                            >
                                Send Real Signal
                            </button>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Live Class</h3>
                            <p className="text-slate-500 text-sm mt-1">
                                Room: classroom-{session.session_code.toLowerCase()}
                            </p>
                        </div>
                        {session.status === 'LIVE' && joined && (
                            <button
                                onClick={() => setShowMeeting((prev) => !prev)}
                                className="bg-indigo-700/80 hover:bg-indigo-600 rounded-xl px-4 py-2 text-sm uppercase tracking-wider font-bold flex items-center gap-2"
                            >
                                <VideoCamera size={16} /> {showMeeting ? 'Hide Live Class' : 'Join Live Class'}
                            </button>
                        )}
                    </div>
                    {session.status !== 'LIVE' && (
                        <div className="text-slate-500">Live class opens when the session is live.</div>
                    )}
                    {session.status === 'LIVE' && !joined && (
                        <div className="text-slate-500">Join the session to unlock the live class and submit engagement signals.</div>
                    )}
                    {session.status === 'LIVE' && joined && showMeeting && (
                        <>
                            {jitsiError && (
                                <div className="text-xs text-amber-300">{jitsiError}</div>
                            )}
                            {jitsiConfig && (
                                <JitsiRoom
                                    roomName={jitsiConfig.room}
                                    displayName={displayName}
                                    domain={jitsiConfig.domain}
                                    appId={jitsiConfig.appId}
                                    jwt={jitsiConfig.jwt}
                                    height={520}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Live Quiz Checkpoints</h3>
                    <div className="text-xs text-slate-500 font-mono">
                        Pending {activeQuizzes.length} | Accuracy {(quizStats.accuracy * 100).toFixed(1)}%
                    </div>
                </div>
                {quizFeedback && (
                    <div className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                        quizFeedback.type === 'SUCCESS'
                            ? 'text-emerald-200 border-emerald-700/40 bg-emerald-950/30'
                            : quizFeedback.type === 'INFO'
                                ? 'text-sky-200 border-sky-700/40 bg-sky-950/30'
                                : 'text-rose-200 border-rose-700/40 bg-rose-950/30'
                    }`}>
                        {quizFeedback.message}
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                        <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Pending</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">{activeQuizzes.length}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                        <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Attempted</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">{quizStats.attempted}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                        <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Correct</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">{quizStats.correct}</div>
                    </div>
                </div>
                {!joined || session.status !== 'LIVE' ? (
                    <div className="text-slate-500 text-sm">Join live session to receive checkpoints.</div>
                ) : activeQuizzes.length === 0 ? (
                    <div className="text-slate-500 text-sm">No active quiz checkpoints right now.</div>
                ) : (
                    <div className="space-y-3">
                        {activeQuizzes.map((quiz) => {
                            const remainingSeconds = quizRemainingSeconds(quiz, quizClock);
                            const isTimedOut = remainingSeconds !== null && remainingSeconds <= 0;
                            return (
                                <div key={quiz.id} className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="text-sm font-semibold text-slate-100">{quiz.question}</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono text-emerald-300 border-emerald-700/40 bg-emerald-950/30 w-fit">
                                                LIVE
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                                                isTimedOut
                                                    ? 'text-rose-200 border-rose-700/40 bg-rose-950/30'
                                                    : (remainingSeconds !== null && remainingSeconds <= 10)
                                                        ? 'text-amber-200 border-amber-700/40 bg-amber-950/30'
                                                        : 'text-sky-200 border-sky-700/40 bg-sky-950/30'
                                            }`}>
                                                Time Left {formatDuration(remainingSeconds)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono">
                                        Responses received: {quiz.total_responses} | Duration {formatDuration(quiz.duration_seconds ?? 60)}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {quiz.options.map((option, index) => (
                                            <button
                                                key={`${quiz.id}-${index}`}
                                                onClick={() => handleSelectQuizOption(quiz.id, index)}
                                                disabled={answeringQuizId === quiz.id || isTimedOut}
                                                className={`text-left rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${
                                                    selectedQuizOptions[quiz.id] === index
                                                        ? 'border-sky-600/60 bg-sky-950/30 text-sky-100'
                                                        : 'border-slate-700/60 bg-slate-950/40 hover:bg-slate-800/70 text-slate-300'
                                                }`}
                                            >
                                                <span className="text-slate-500 font-mono mr-2">{optionLabel(index)}.</span>
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="text-[11px] text-slate-500 font-mono">
                                            Selected: {selectedQuizOptions[quiz.id] !== undefined ? `${optionLabel(selectedQuizOptions[quiz.id])}` : 'None'}
                                        </div>
                                        <button
                                            onClick={() => void handleQuizAnswer(quiz)}
                                            disabled={isTimedOut || answeringQuizId === quiz.id || selectedQuizOptions[quiz.id] === undefined}
                                            className="bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3 py-2 text-xs uppercase tracking-wider font-mono"
                                        >
                                            {isTimedOut ? 'Time Over' : (answeringQuizId === quiz.id ? 'Submitting...' : 'Submit Answer')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
