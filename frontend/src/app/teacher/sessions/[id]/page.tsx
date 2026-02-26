'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { DataCard } from '@/components/DataCard';
import { MiniTrendChart } from '@/components/MiniTrendChart';
import JitsiRoom from '@/components/JitsiRoom';
import { ArrowLeft, Play, Stop, Pulse, Users, ChartBar, ChartLineUp, VideoCamera } from '@phosphor-icons/react';

interface SessionData {
    id: number;
    session_code: string;
    class_id?: number;
    teacher_id?: number;
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

interface Participant {
    id: number;
    session_id: number;
    student_id?: number;
    joined_at: string;
    attendance_mark: boolean;
    auth_type?: string;
}

interface EngagementTrendPoint {
    timestamp: string;
    avg: number;
}

interface EngagementClassStats {
    average_engagement: number;
    distracted_percent: number;
    total_signals: number;
    total_active_participants: number;
    trend: EngagementTrendPoint[];
}

interface EngagementStudentSnapshot {
    participant_key: string;
    student_id?: number;
    row_index?: number;
    engagement_score: number;
    visual_attention: number;
    face_visible?: boolean | null;
    face_count?: number | null;
    vision_confidence?: number | null;
    participation: number;
    quiz_accuracy: number;
    attendance_consistency: number;
    category: string;
    last_updated: string;
}

interface EngagementRowHeatmapItem {
    row_index: number;
    average_attention: number;
    average_engagement: number;
    participants: number;
    risk_level: string;
}

interface EngagementSessionHeatmapItem {
    timestamp: string;
    average_engagement: number;
    distracted_percent: number;
    signals: number;
}

interface EngagementPrediction {
    current_average: number;
    predicted_average_10m: number;
    predicted_average_20m: number;
    drop_probability: number;
    estimated_drop_in_minutes?: number | null;
    risk_level: string;
}

interface AdaptiveSuggestion {
    title: string;
    reason: string;
    recommendation: string;
    priority: string;
}

interface SessionQuizItem {
    id: number;
    session_id: number;
    teacher_id?: number;
    question: string;
    options: string[];
    correct_option_index?: number | null;
    duration_seconds?: number;
    expires_at?: string | null;
    remaining_seconds?: number | null;
    is_active: boolean;
    created_at: string;
    closed_at?: string | null;
    total_responses: number;
    correct_responses: number;
}

interface EngagementInsights {
    students: EngagementStudentSnapshot[];
    class_stats: EngagementClassStats;
    row_heatmap: EngagementRowHeatmapItem[];
    session_heatmap: EngagementSessionHeatmapItem[];
    prediction: EngagementPrediction;
    context: {
        topic_difficulty: string;
        time_of_day: string;
        elapsed_minutes: number;
        session_status: string;
    };
    adaptive_suggestions: AdaptiveSuggestion[];
    privacy: {
        identity_storage: boolean;
        stored_representation: string;
        face_images_stored: boolean;
    };
}

function heatClass(score: number): string {
    if (score >= 75) return 'bg-emerald-950/30 border-emerald-700/40';
    if (score >= 55) return 'bg-amber-950/30 border-amber-700/40';
    return 'bg-rose-950/30 border-rose-700/40';
}

function riskClass(risk: string): string {
    if (risk === 'HIGH') return 'text-rose-300 border-rose-700/50 bg-rose-950/40';
    if (risk === 'MEDIUM') return 'text-amber-300 border-amber-700/50 bg-amber-950/40';
    return 'text-emerald-300 border-emerald-700/50 bg-emerald-950/40';
}

function categoryClass(category: string): string {
    if (category === 'High') return 'text-emerald-300 border-emerald-700/40 bg-emerald-950/30';
    if (category === 'Medium') return 'text-sky-300 border-sky-700/40 bg-sky-950/30';
    if (category === 'Low') return 'text-amber-300 border-amber-700/40 bg-amber-950/30';
    return 'text-rose-300 border-rose-700/40 bg-rose-950/30';
}

function optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
}

function clampRatio(value: number): number {
    return Math.max(0, Math.min(1, value));
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

export default function TeacherSessionDetailPage() {
    const params = useParams();
    const sessionId = useMemo(() => {
        const raw = (params as { id?: string | string[] })?.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        return id ? Number(id) : NaN;
    }, [params]);

    const [session, setSession] = useState<SessionData | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [insights, setInsights] = useState<EngagementInsights | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [insightsError, setInsightsError] = useState('');
    const [engagementSocketState, setEngagementSocketState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('DISCONNECTED');
    const [quizzes, setQuizzes] = useState<SessionQuizItem[]>([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizNotice, setQuizNotice] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);
    const [quizForm, setQuizForm] = useState({
        question: '',
        optionsText: '',
        correctOptionIndex: 0,
        durationSeconds: 60,
    });
    const [quizClock, setQuizClock] = useState<number>(Date.now());

    const [showMeeting, setShowMeeting] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [topicDifficulty, setTopicDifficulty] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
    const [jitsiConfig, setJitsiConfig] = useState<{ domain: string; room: string; jwt?: string | null; appId?: string } | null>(null);
    const [jitsiError, setJitsiError] = useState('');
    const engagementWsRef = useRef<WebSocket | null>(null);

    const loadSession = useCallback(async () => {
        const data = await api.getSession(sessionId);
        setSession(data);
        return data as SessionData;
    }, [sessionId]);

    const loadParticipants = useCallback(async () => {
        const data = await api.listParticipants(sessionId);
        setParticipants(data || []);
    }, [sessionId]);

    const loadInsights = useCallback(async (options?: { silent?: boolean; topicDifficulty?: 'LOW' | 'MEDIUM' | 'HIGH' }) => {
        if (!Number.isFinite(sessionId)) return;
        if (!options?.silent) setInsightsLoading(true);
        setInsightsError('');
        try {
            const now = new Date();
            const data = await api.getSessionEngagementInsights(sessionId, {
                topic_difficulty: options?.topicDifficulty || 'MEDIUM',
                local_hour: now.getHours(),
            });
            setInsights(data);
        } catch (err: any) {
            setInsightsError(err.message || 'Failed to load engagement insights');
        } finally {
            if (!options?.silent) setInsightsLoading(false);
        }
    }, [sessionId]);

    const loadQuizzes = useCallback(async (options?: { silent?: boolean }) => {
        if (!Number.isFinite(sessionId)) return;
        if (!options?.silent) setQuizLoading(true);
        try {
            const data = await api.listSessionQuizzes(sessionId);
            setQuizzes(data.quizzes || []);
        } catch {
            if (!options?.silent) {
                setQuizzes([]);
            }
        } finally {
            if (!options?.silent) setQuizLoading(false);
        }
    }, [sessionId]);

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
        if (!session || session.status !== 'LIVE') return;
        const existing = engagementWsRef.current;
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = api.getEngagementWebSocketUrl(session.id);
        if (!wsUrl.includes('token=')) {
            setEngagementSocketState('ERROR');
            setInsightsError('Missing auth token for live engagement socket');
            return;
        }

        try {
            setEngagementSocketState('CONNECTING');
            const ws = new WebSocket(wsUrl);
            engagementWsRef.current = ws;

            ws.onopen = () => {
                setEngagementSocketState('CONNECTED');
                ws.send(JSON.stringify({
                    type: 'subscribe_insights',
                    topic_difficulty: topicDifficulty,
                    local_hour: new Date().getHours(),
                }));
            };
            ws.onclose = () => {
                setEngagementSocketState('DISCONNECTED');
                if (engagementWsRef.current === ws) {
                    engagementWsRef.current = null;
                }
            };
            ws.onerror = () => {
                setEngagementSocketState('ERROR');
            };
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data as string);
                    if (data?.type === 'insights_update' && data?.insights) {
                        setInsights(data.insights as EngagementInsights);
                        setInsightsError('');
                    } else if (data?.type === 'error') {
                        setInsightsError(String(data?.detail || 'Socket engagement error'));
                    }
                } catch {
                    // Ignore malformed socket payloads.
                }
            };
        } catch {
            setEngagementSocketState('ERROR');
            setInsightsError('Unable to open live engagement socket');
        }
    }, [session]);

    const loadAll = useCallback(async () => {
        if (!Number.isFinite(sessionId)) return;
        setLoading(true);
        setError('');
        try {
            await loadSession();
            await loadParticipants();
            await loadQuizzes({ silent: true });
        } catch (err: any) {
            setError(err.message || 'Failed to load session');
        } finally {
            setLoading(false);
        }
    }, [sessionId, loadSession, loadParticipants, loadQuizzes]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    useEffect(() => {
        async function loadUser() {
            try {
                const me = await api.getMe();
                const name = `${me.first_name || ''} ${me.last_name || ''}`.trim();
                setDisplayName(name || me.username || 'Teacher');
            } catch {
                setDisplayName('Teacher');
            }
        }
        void loadUser();
    }, []);

    useEffect(() => {
        void loadInsights({ topicDifficulty: 'MEDIUM' });
    }, [sessionId, loadInsights]);

    useEffect(() => {
        if (!session || session.status !== 'LIVE') {
            disconnectEngagementSocket();
            setEngagementSocketState('DISCONNECTED');
            return;
        }
        connectEngagementSocket();
        return () => {
            disconnectEngagementSocket();
        };
    }, [session, connectEngagementSocket, disconnectEngagementSocket]);

    useEffect(() => {
        const socket = engagementWsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !session || session.status !== 'LIVE') return;
        socket.send(JSON.stringify({
            type: 'subscribe_insights',
            topic_difficulty: topicDifficulty,
            local_hour: new Date().getHours(),
        }));
    }, [topicDifficulty, session]);

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
                if (!data.jwt) {
                    setJitsiError('JaaS token missing. Set JITSI_APP_ID, JITSI_KID, and JITSI_PRIVATE_KEY in backend/.env to auto-assign host.');
                }
            } catch (err: any) {
                setJitsiError(err.message || 'Failed to load live class');
            }
        }
        void loadJitsi();
    }, [showMeeting, session]);

    useEffect(() => {
        if (!session || session.status !== 'LIVE') return;
        const interval = setInterval(() => {
            void loadParticipants();
            void loadQuizzes({ silent: true });
        }, 6000);
        return () => clearInterval(interval);
    }, [session, loadParticipants, loadQuizzes]);

    useEffect(() => {
        const interval = setInterval(() => setQuizClock(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const draftOptions = useMemo(() => (
        quizForm.optionsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
    ), [quizForm.optionsText]);

    useEffect(() => {
        setQuizForm((prev) => {
            if (draftOptions.length === 0 && prev.correctOptionIndex !== 0) {
                return { ...prev, correctOptionIndex: 0 };
            }
            if (draftOptions.length > 0 && prev.correctOptionIndex >= draftOptions.length) {
                return { ...prev, correctOptionIndex: draftOptions.length - 1 };
            }
            return prev;
        });
    }, [draftOptions]);

    const handleStart = async () => {
        if (!session) return;
        try {
            await api.startSession(session.id);
            await loadAll();
            await loadInsights({ topicDifficulty });
            await loadQuizzes();
        } catch (err: any) {
            alert(err.message || 'Failed to start session');
        }
    };

    const handleEnd = async () => {
        if (!session) return;
        try {
            await api.endSession(session.id);
            await loadAll();
            await loadInsights({ topicDifficulty });
            await loadQuizzes();
        } catch (err: any) {
            alert(err.message || 'Failed to end session');
        }
    };

    const handleCreateQuiz = async (e: React.FormEvent) => {
        e.preventDefault();
        setQuizNotice(null);
        if (!session || session.status !== 'LIVE') {
            setQuizNotice({ type: 'ERROR', message: 'Start the session before publishing checkpoints.' });
            return;
        }
        const question = quizForm.question.trim();
        const options = [...draftOptions];
        const durationSeconds = Math.max(15, Math.min(3600, Number(quizForm.durationSeconds) || 60));
        if (question.length < 5) {
            setQuizNotice({ type: 'ERROR', message: 'Question should be at least 5 characters.' });
            return;
        }
        if (options.length < 2) {
            setQuizNotice({ type: 'ERROR', message: 'Please provide at least 2 options (one per line).' });
            return;
        }
        if (quizForm.correctOptionIndex < 0 || quizForm.correctOptionIndex >= options.length) {
            setQuizNotice({ type: 'ERROR', message: 'Select a valid correct option from the list.' });
            return;
        }
        if (durationSeconds < 15 || durationSeconds > 3600) {
            setQuizNotice({ type: 'ERROR', message: 'Duration should be between 15s and 3600s.' });
            return;
        }
        try {
            await api.createSessionQuiz(session.id, {
                question,
                options,
                correct_option_index: quizForm.correctOptionIndex,
                duration_seconds: durationSeconds,
            });
            setQuizForm({ question: '', optionsText: '', correctOptionIndex: 0, durationSeconds: 60 });
            setQuizNotice({ type: 'SUCCESS', message: 'Quiz checkpoint published successfully.' });
            await loadQuizzes();
        } catch (err: any) {
            setQuizNotice({ type: 'ERROR', message: err.message || 'Failed to publish quiz checkpoint.' });
        }
    };

    const handleCloseQuiz = async (quizId: number) => {
        if (!session) return;
        try {
            await api.closeSessionQuiz(session.id, quizId);
            setQuizNotice({ type: 'SUCCESS', message: `Quiz #${quizId} has been closed.` });
            await loadQuizzes();
        } catch (err: any) {
            setQuizNotice({ type: 'ERROR', message: err.message || 'Failed to close quiz checkpoint.' });
        }
    };

    if (!Number.isFinite(sessionId)) {
        return <div className="text-slate-500">Invalid session.</div>;
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-emerald-400 animate-pulse" />
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
                <a href="/teacher/sessions" className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-2">
                    <ArrowLeft size={18} /> Back to Sessions
                </a>
                <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-6 text-rose-200">
                    {error || 'Session not found'}
                </div>
            </div>
        );
    }

    const dropRiskPercent = insights ? Math.round(insights.prediction.drop_probability * 100) : 0;
    const recentWindows = insights ? insights.session_heatmap.slice(-8) : [];
    const sortedStudents = insights
        ? [...insights.students].sort((a, b) => b.engagement_score - a.engagement_score)
        : [];
    const activeQuiz = quizzes.find((quiz) => quiz.is_active) || null;
    const closedQuizCount = quizzes.filter((quiz) => !quiz.is_active).length;
    const responseTarget = Math.max(participants.length, 0);
    const activeResponseRate = activeQuiz && responseTarget > 0
        ? clampRatio(activeQuiz.total_responses / responseTarget)
        : 0;
    const activeCorrectRate = activeQuiz && activeQuiz.total_responses > 0
        ? clampRatio(activeQuiz.correct_responses / activeQuiz.total_responses)
        : 0;
    const activeRemainingSeconds = activeQuiz ? quizRemainingSeconds(activeQuiz, quizClock) : null;
    const activeDurationSeconds = activeQuiz?.duration_seconds ?? 60;
    const activeTimeRatio = activeRemainingSeconds !== null && activeDurationSeconds > 0
        ? clampRatio(activeRemainingSeconds / activeDurationSeconds)
        : 0;
    const canPublishQuiz = (
        session.status === 'LIVE'
        && quizForm.question.trim().length >= 5
        && draftOptions.length >= 2
        && quizForm.correctOptionIndex >= 0
        && quizForm.correctOptionIndex < draftOptions.length
        && Number(quizForm.durationSeconds) >= 15
        && Number(quizForm.durationSeconds) <= 3600
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <a href="/teacher/sessions" className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-2">
                    <ArrowLeft size={18} /> Back to Sessions
                </a>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider">
                            {session.topic}
                        </h1>
                        <p className="text-slate-500 mt-1">{session.subject} / {session.course}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={session.status} />
                        {session.status === 'SCHEDULED' && (
                            <button
                                onClick={handleStart}
                                className="bg-emerald-700/80 hover:bg-emerald-600 rounded-xl px-4 py-2 text-sm uppercase tracking-wider font-bold flex items-center gap-2"
                            >
                                <Play size={16} /> Start Session
                            </button>
                        )}
                        {session.status === 'LIVE' && (
                            <button
                                onClick={handleEnd}
                                className="bg-rose-700/80 hover:bg-rose-600 rounded-xl px-4 py-2 text-sm uppercase tracking-wider font-bold flex items-center gap-2"
                            >
                                <Stop size={16} /> End Session
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DataCard title="Session Code" value={session.session_code} icon={ChartBar} />
                <DataCard title="Participants" value={participants.length} icon={Users} />
                <DataCard title="Tracking" value={session.tracking_enabled ? 'Enabled' : 'Off'} icon={ChartLineUp} />
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Engagement Intelligence</h3>
                        <p className="text-slate-500 text-sm mt-1">Row-wise heatmap, trend prediction, and adaptive teaching guidance</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-mono ${
                            engagementSocketState === 'CONNECTED'
                                ? 'text-emerald-300 border-emerald-700/40 bg-emerald-950/30'
                                : engagementSocketState === 'CONNECTING'
                                    ? 'text-amber-300 border-amber-700/40 bg-amber-950/30'
                                    : engagementSocketState === 'ERROR'
                                        ? 'text-rose-300 border-rose-700/40 bg-rose-950/30'
                                        : 'text-slate-400 border-slate-700/40 bg-slate-900/40'
                        }`}>
                            WS {engagementSocketState}
                        </span>
                        <select
                            value={topicDifficulty}
                            onChange={(e) => setTopicDifficulty(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                            className="bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono uppercase tracking-wider"
                        >
                            <option value="LOW">Topic: LOW</option>
                            <option value="MEDIUM">Topic: MEDIUM</option>
                            <option value="HIGH">Topic: HIGH</option>
                        </select>
                        <button
                            onClick={() => {
                                const socket = engagementWsRef.current;
                                if (socket && socket.readyState === WebSocket.OPEN && session.status === 'LIVE') {
                                    socket.send(JSON.stringify({
                                        type: 'subscribe_insights',
                                        topic_difficulty: topicDifficulty,
                                        local_hour: new Date().getHours(),
                                    }));
                                    return;
                                }
                                void loadInsights({ topicDifficulty });
                            }}
                            className="bg-slate-700/70 hover:bg-slate-600 rounded-lg px-3 py-2 text-xs uppercase tracking-wider font-mono"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {insightsLoading && !insights && (
                    <div className="text-slate-500 text-sm">Loading engagement analytics...</div>
                )}
                {insightsError && (
                    <div className="text-rose-300 text-sm">{insightsError}</div>
                )}

                {insights && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <DataCard title="Avg Engagement" value={`${insights.class_stats.average_engagement.toFixed(1)}%`} icon={ChartLineUp} />
                            <DataCard title="Distracted" value={`${insights.class_stats.distracted_percent.toFixed(1)}%`} icon={Users} />
                            <DataCard title="Drop Risk" value={`${dropRiskPercent}%`} icon={ChartBar} subtitle={insights.prediction.risk_level} />
                            <DataCard
                                title="Predicted Drop"
                                value={
                                    insights.prediction.estimated_drop_in_minutes
                                        ? `~${insights.prediction.estimated_drop_in_minutes}m`
                                        : 'Stable'
                                }
                                icon={Pulse}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
                                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Engagement Curve</h4>
                                <MiniTrendChart
                                    data={insights.class_stats.trend.map((point) => ({ timestamp: point.timestamp, avg: point.avg }))}
                                    height={170}
                                    stroke="#10b981"
                                />
                                <div className="mt-3 text-xs text-slate-500">
                                    Predicted 10m: {insights.prediction.predicted_average_10m.toFixed(1)}% | 20m: {insights.prediction.predicted_average_20m.toFixed(1)}%
                                </div>
                            </div>

                            <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
                                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Session Heatmap (5-Minute Windows)</h4>
                                {recentWindows.length === 0 ? (
                                    <div className="text-slate-500 text-sm">No windowed signals yet.</div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {recentWindows.map((windowPoint) => (
                                            <div
                                                key={windowPoint.timestamp}
                                                className={`rounded-lg border p-2 ${heatClass(windowPoint.average_engagement)}`}
                                            >
                                                <div className="text-[10px] text-slate-400 font-mono uppercase">
                                                    {new Date(windowPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="text-sm font-semibold text-slate-100 mt-1">
                                                    {windowPoint.average_engagement.toFixed(1)}%
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    {windowPoint.signals} signals
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
                            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Row Heatmap</h4>
                            {insights.row_heatmap.length === 0 ? (
                                <div className="text-slate-500 text-sm">No row-level signals yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {insights.row_heatmap.map((row) => (
                                        <div key={row.row_index} className={`rounded-xl border p-3 ${heatClass(row.average_engagement)}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-mono uppercase text-slate-300">Row {row.row_index}</div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${riskClass(row.risk_level)}`}>
                                                    {row.risk_level}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-sm text-slate-100 font-semibold">
                                                {row.average_engagement.toFixed(1)}% engagement
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                Attention {row.average_attention.toFixed(1)}% | {row.participants} participants
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Student-wise Metrics</h4>
                                <div className="text-[11px] text-slate-500 font-mono">
                                    {sortedStudents.length} active
                                </div>
                            </div>
                            {sortedStudents.length === 0 ? (
                                <div className="text-slate-500 text-sm">No student-wise signals yet.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[860px]">
                                        <thead>
                                            <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                                                <th className="py-2 pr-3">Student</th>
                                                <th className="py-2 pr-3">Row</th>
                                                <th className="py-2 pr-3">Engagement</th>
                                                <th className="py-2 pr-3">Attention</th>
                                                <th className="py-2 pr-3">Face</th>
                                                <th className="py-2 pr-3">Participation</th>
                                                <th className="py-2 pr-3">Quiz</th>
                                                <th className="py-2 pr-3">Attendance</th>
                                                <th className="py-2 pr-3">Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {sortedStudents.map((student) => (
                                                <tr key={student.participant_key} className="text-xs text-slate-300">
                                                    <td className="py-2 pr-3">
                                                        <div className="font-semibold text-slate-200">
                                                            {student.student_id ? `Student #${student.student_id}` : student.participant_key}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">{student.participant_key}</div>
                                                    </td>
                                                    <td className="py-2 pr-3 text-slate-400">{student.row_index ?? '-'}</td>
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-100">{student.engagement_score.toFixed(1)}%</span>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${categoryClass(student.category)}`}>
                                                                {student.category}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 pr-3 text-slate-300">{student.visual_attention.toFixed(1)}%</td>
                                                    <td className="py-2 pr-3">
                                                        {student.face_visible === true ? (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono text-emerald-300 border-emerald-700/40 bg-emerald-950/30">
                                                                Visible
                                                            </span>
                                                        ) : student.face_visible === false ? (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono text-rose-300 border-rose-700/40 bg-rose-950/30">
                                                                Not Visible
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono text-slate-400 border-slate-700/40 bg-slate-900/40">
                                                                N/A
                                                            </span>
                                                        )}
                                                        {typeof student.vision_confidence === 'number' && (
                                                            <div className="text-[10px] text-slate-500 mt-1">
                                                                {student.vision_confidence.toFixed(0)}% conf
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-3 text-slate-300">{student.participation.toFixed(1)}%</td>
                                                    <td className="py-2 pr-3 text-slate-300">{student.quiz_accuracy.toFixed(1)}%</td>
                                                    <td className="py-2 pr-3 text-slate-300">{student.attendance_consistency.toFixed(1)}%</td>
                                                    <td className="py-2 pr-3 text-slate-500">
                                                        {new Date(student.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
                            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Adaptive Teaching Suggestions</h4>
                            <div className="space-y-2">
                                {insights.adaptive_suggestions.map((item, index) => (
                                    <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${riskClass(item.priority)}`}>
                                                {item.priority}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">{item.reason}</p>
                                        <p className="text-xs text-slate-300 mt-2">{item.recommendation}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 text-[11px] text-slate-500 font-mono">
                                Privacy: {insights.privacy.stored_representation}; identity storage {insights.privacy.identity_storage ? 'enabled' : 'disabled'}.
                            </div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Live Quiz Checkpoints</h4>
                                <div className="text-[11px] text-slate-500 font-mono">
                                    Active {activeQuiz ? 1 : 0} | Closed {closedQuizCount} | Total {quizzes.length}
                                </div>
                            </div>

                            {quizNotice && (
                                <div className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                                    quizNotice.type === 'SUCCESS'
                                        ? 'text-emerald-200 border-emerald-700/40 bg-emerald-950/30'
                                        : 'text-rose-200 border-rose-700/40 bg-rose-950/30'
                                }`}>
                                    {quizNotice.message}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                                    <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Joined Students</div>
                                    <div className="mt-1 text-lg font-semibold text-slate-100">{responseTarget}</div>
                                </div>
                                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                                    <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Active Response Rate</div>
                                    <div className="mt-1 text-lg font-semibold text-slate-100">{(activeResponseRate * 100).toFixed(1)}%</div>
                                </div>
                                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                                    <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Active Correctness</div>
                                    <div className="mt-1 text-lg font-semibold text-slate-100">{(activeCorrectRate * 100).toFixed(1)}%</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <form onSubmit={handleCreateQuiz} className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4 space-y-3">
                                    <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">Publish New Checkpoint</div>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            required
                                            placeholder="Enter checkpoint question..."
                                            value={quizForm.question}
                                            onChange={(e) => setQuizForm((prev) => ({ ...prev, question: e.target.value }))}
                                            className="w-full bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200"
                                        />
                                        <div className="text-[10px] text-slate-500 font-mono">
                                            {quizForm.question.trim().length}/500 chars
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <textarea
                                            required
                                            placeholder={'Options (one per line)\nOption 1\nOption 2'}
                                            value={quizForm.optionsText}
                                            onChange={(e) => setQuizForm((prev) => ({ ...prev, optionsText: e.target.value }))}
                                            className="w-full bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 min-h-[110px]"
                                        />
                                        <div className="text-[10px] text-slate-500 font-mono">
                                            {draftOptions.length} options detected
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-3 items-center">
                                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Correct Option</label>
                                        <select
                                            value={quizForm.correctOptionIndex}
                                            onChange={(e) => setQuizForm((prev) => ({ ...prev, correctOptionIndex: Number(e.target.value) || 0 }))}
                                            disabled={draftOptions.length === 0}
                                            className="bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200"
                                        >
                                            {draftOptions.length === 0 ? (
                                                <option value={0}>Add options first</option>
                                            ) : (
                                                draftOptions.map((option, index) => (
                                                    <option key={`draft-option-${index}`} value={index}>
                                                        {optionLabel(index)}. {option}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Timer (seconds)</label>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input
                                                type="number"
                                                min={15}
                                                max={3600}
                                                step={5}
                                                value={quizForm.durationSeconds}
                                                onChange={(e) => setQuizForm((prev) => ({ ...prev, durationSeconds: Number(e.target.value) || 60 }))}
                                                className="w-28 bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200"
                                            />
                                            <span className="text-[11px] text-slate-500 font-mono">
                                                {formatDuration(Math.max(15, Math.min(3600, Number(quizForm.durationSeconds) || 60)))}
                                            </span>
                                            <button
                                                type="submit"
                                                disabled={!canPublishQuiz}
                                                className="ml-auto bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 text-xs uppercase tracking-wider font-mono"
                                            >
                                                Publish Quiz
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4 space-y-3">
                                    <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">Live Monitor</div>
                                    {!activeQuiz ? (
                                        <div className="text-sm text-slate-500">No active checkpoint. Publish one to collect responses in real time.</div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-semibold text-slate-100">{activeQuiz.question}</div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                                                    (activeRemainingSeconds ?? 0) <= 10
                                                        ? 'text-rose-200 border-rose-700/50 bg-rose-950/40'
                                                        : (activeRemainingSeconds ?? 0) <= 30
                                                            ? 'text-amber-200 border-amber-700/50 bg-amber-950/40'
                                                            : 'text-emerald-200 border-emerald-700/50 bg-emerald-950/40'
                                                }`}>
                                                    Time Left {formatDuration(activeRemainingSeconds)}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {activeQuiz.options.map((option, index) => (
                                                    <div
                                                        key={`active-option-${activeQuiz.id}-${index}`}
                                                        className={`rounded-lg border px-3 py-2 text-xs ${
                                                            activeQuiz.correct_option_index === index
                                                                ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200'
                                                                : 'border-slate-700/60 bg-slate-900/60 text-slate-300'
                                                        }`}
                                                    >
                                                        <span className="font-mono text-slate-400 mr-2">{optionLabel(index)}.</span>
                                                        {option}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${activeTimeRatio <= 0.2 ? 'bg-rose-500' : activeTimeRatio <= 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${(activeTimeRatio * 100).toFixed(1)}%` }}
                                                    />
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono">
                                                    Timer {formatDuration(activeRemainingSeconds)} / {formatDuration(activeDurationSeconds)}
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-sky-500"
                                                        style={{ width: `${(activeResponseRate * 100).toFixed(1)}%` }}
                                                    />
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono">
                                                    Responses {activeQuiz.total_responses}/{responseTarget || 0} | Correct {activeQuiz.correct_responses}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleCloseQuiz(activeQuiz.id)}
                                                className="bg-rose-700/80 hover:bg-rose-600 rounded-lg px-3 py-2 text-xs uppercase tracking-wider font-mono"
                                            >
                                                Close Active Quiz
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-700/50 space-y-2">
                                <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">Checkpoint History</div>
                                {quizLoading ? (
                                    <div className="text-slate-500 text-sm">Loading quizzes...</div>
                                ) : quizzes.length === 0 ? (
                                    <div className="text-slate-500 text-sm">No quizzes published yet.</div>
                                ) : (
                                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                                        {quizzes.map((quiz) => {
                                            const responseRate = responseTarget > 0 ? clampRatio(quiz.total_responses / responseTarget) : 0;
                                            const correctRate = quiz.total_responses > 0 ? clampRatio(quiz.correct_responses / quiz.total_responses) : 0;
                                            const remainingSeconds = quizRemainingSeconds(quiz, quizClock);
                                            const durationSeconds = quiz.duration_seconds ?? 60;
                                            return (
                                                <div key={quiz.id} className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 space-y-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="text-sm text-slate-100 font-semibold">{quiz.question}</div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${quiz.is_active ? 'text-emerald-300 border-emerald-700/40 bg-emerald-950/30' : 'text-slate-300 border-slate-700/40 bg-slate-900/40'}`}>
                                                                {quiz.is_active ? 'ACTIVE' : 'CLOSED'}
                                                            </span>
                                                            {quiz.is_active && (
                                                                <button
                                                                    onClick={() => handleCloseQuiz(quiz.id)}
                                                                    className="text-[10px] px-2 py-1 rounded border border-rose-700/40 bg-rose-950/30 text-rose-300 font-mono uppercase"
                                                                >
                                                                    Close
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {quiz.options.map((option, index) => (
                                                            <div
                                                                key={`history-option-${quiz.id}-${index}`}
                                                                className={`rounded-md border px-2 py-1 text-[11px] ${
                                                                    quiz.correct_option_index === index
                                                                        ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200'
                                                                        : 'border-slate-700/60 bg-slate-900/60 text-slate-300'
                                                                }`}
                                                            >
                                                                <span className="font-mono text-slate-400 mr-2">{optionLabel(index)}.</span>
                                                                {option}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-sky-500" style={{ width: `${(responseRate * 100).toFixed(1)}%` }} />
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono">
                                                        <span>Responses {quiz.total_responses}/{responseTarget || 0}</span>
                                                        <span>Correct {(correctRate * 100).toFixed(1)}%</span>
                                                        <span>Duration {formatDuration(durationSeconds)}</span>
                                                        {quiz.is_active && (
                                                            <span>Time Left {formatDuration(remainingSeconds)}</span>
                                                        )}
                                                        <span>Created {new Date(quiz.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {quiz.closed_at && (
                                                            <span>Closed {new Date(quiz.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Live Class</h3>
                        <p className="text-slate-500 text-sm mt-1">Room: classroom-{session.session_code.toLowerCase()}</p>
                    </div>
                    {session.status === 'LIVE' && (
                        <button
                            onClick={() => setShowMeeting((prev) => !prev)}
                            className="bg-indigo-700/80 hover:bg-indigo-600 rounded-xl px-4 py-2 text-sm uppercase tracking-wider font-bold flex items-center gap-2"
                        >
                            <VideoCamera size={16} /> {showMeeting ? 'Hide Live Class' : 'Open Live Class'}
                        </button>
                    )}
                </div>
                {session.status !== 'LIVE' && (
                    <div className="text-slate-500">Start the session to open the live class room.</div>
                )}
                {session.status === 'LIVE' && showMeeting && (
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

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Participants</h3>
                {participants.length === 0 ? (
                    <div className="text-slate-500">No students joined yet.</div>
                ) : (
                    <div className="space-y-3">
                        {participants.map((p) => (
                            <div key={p.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-200">Student #{p.student_id ?? 'N/A'}</div>
                                    <div className="text-xs text-slate-500">Joined {new Date(p.joined_at).toLocaleTimeString()}</div>
                                </div>
                                <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
                                    {p.auth_type || 'unknown'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
