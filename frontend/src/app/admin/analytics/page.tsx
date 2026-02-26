'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DataCard } from '@/components/DataCard';
import { MiniTrendChart } from '@/components/MiniTrendChart';
import { ChartBar, Pulse, Users, GraduationCap, TrendUp } from '@phosphor-icons/react';

interface AnalyticsData {
    course_comparison: Array<{ course: string; average_engagement: number; sessions: number }>;
    teacher_effectiveness: Array<{ teacher_id: number; average_engagement: number; sessions: number }>;
    department_trends: Array<{ department: string; average_engagement: number; sessions: number }>;
    dropout_risk_trend: Array<{ timestamp: string; distracted_percent: number }>;
}

export default function AdminAnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAnalytics() {
            try {
                const result = await api.getAdminAnalytics();
                setData(result);
            } catch (err) {
                console.error('Failed to load analytics', err);
            } finally {
                setLoading(false);
            }
        }
        fetchAnalytics();
    }, []);

    const totals = useMemo(() => {
        if (!data) return { courses: 0, teachers: 0, departments: 0, avgEngagement: 0 };
        const avgEngagement = data.course_comparison.length
            ? data.course_comparison.reduce((sum, item) => sum + item.average_engagement, 0) / data.course_comparison.length
            : 0;
        return {
            courses: data.course_comparison.length,
            teachers: data.teacher_effectiveness.length,
            departments: data.department_trends.length,
            avgEngagement: Number(avgEngagement.toFixed(1)),
        };
    }, [data]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-purple-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-purple-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Analytics...
                </p>
            </div>
        );
    }

    if (!data) {
        return <div className="text-slate-500">No analytics data available.</div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <ChartBar size={28} weight="duotone" className="text-purple-400" />
                    Analytics Dashboard
                </h1>
                <p className="text-slate-500 mt-1">Engagement insights across courses, teachers, and departments</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <DataCard title="Courses" value={totals.courses} icon={GraduationCap} />
                <DataCard title="Teachers" value={totals.teachers} icon={Users} />
                <DataCard title="Departments" value={totals.departments} icon={TrendUp} />
                <DataCard title="Avg Engagement" value={`${totals.avgEngagement}%`} icon={ChartBar} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Course Comparison</h3>
                    <div className="space-y-3">
                        {data.course_comparison.length === 0 && (
                            <div className="text-slate-500">No course analytics yet.</div>
                        )}
                        {data.course_comparison.map((row) => (
                            <div key={row.course} className="flex items-center justify-between bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-200">{row.course}</div>
                                    <div className="text-xs text-slate-500">Sessions: {row.sessions}</div>
                                </div>
                                <div className="text-lg font-mono text-slate-100">{row.average_engagement.toFixed(1)}%</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Teacher Effectiveness</h3>
                    <div className="space-y-3">
                        {data.teacher_effectiveness.length === 0 && (
                            <div className="text-slate-500">No teacher analytics yet.</div>
                        )}
                        {data.teacher_effectiveness.map((row) => (
                            <div key={row.teacher_id} className="flex items-center justify-between bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-200">Teacher #{row.teacher_id}</div>
                                    <div className="text-xs text-slate-500">Sessions: {row.sessions}</div>
                                </div>
                                <div className="text-lg font-mono text-slate-100">{row.average_engagement.toFixed(1)}%</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Department Trends</h3>
                    <div className="space-y-3">
                        {data.department_trends.length === 0 && (
                            <div className="text-slate-500">No department analytics yet.</div>
                        )}
                        {data.department_trends.map((row) => (
                            <div key={row.department} className="flex items-center justify-between bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-200">{row.department}</div>
                                    <div className="text-xs text-slate-500">Sessions: {row.sessions}</div>
                                </div>
                                <div className="text-lg font-mono text-slate-100">{row.average_engagement.toFixed(1)}%</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Dropout Risk Trend</h3>
                    <MiniTrendChart
                        data={data.dropout_risk_trend.map((row) => ({ timestamp: row.timestamp, value: row.distracted_percent }))}
                        height={180}
                        stroke="#f97316"
                    />
                    <div className="mt-4 text-xs text-slate-500">Lower distracted % indicates healthier engagement.</div>
                </div>
            </div>
        </div>
    );
}
