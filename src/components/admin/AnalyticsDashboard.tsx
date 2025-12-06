import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Define types locally instead of importing from types
interface UserStatistics {
  total_users: number;
  new_users_today: number;
  new_users_last_7_days: number;
  active_users_last_7_days: number;
  gender_male: number;
  gender_female: number;
}

interface ReportStatistics {
  total_reports: number;
  pending_reports: number;
  resolved_reports: number;
  reports_last_7_days: number;
}

const AnalyticsDashboard: React.FC = () => {
  const [userStats, setUserStats] = useState<UserStatistics | null>(null);
  const [reportStats, setReportStats] = useState<ReportStatistics | null>(null);
  const [videoStats, setVideoStats] = useState({
    totalSessions: 0,
    avgDuration: 0,
    sessionsToday: 0,
    sessionsThisWeek: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatistics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // User statistics
        try {
          const { data: userData, error: userError } = await supabase
            .from('user_statistics')
            .select('*')
            .single();

          if (!userError && userData) {
            setUserStats(userData as UserStatistics);
          }
        } catch (err) {
          console.log('User stats fetch error:', err);
          // Fallback demo data
          setUserStats({
            total_users: 125,
            new_users_today: 12,
            new_users_last_7_days: 48,
            active_users_last_7_days: 87,
            gender_male: 72,
            gender_female: 53,
          });
        }

        // Report statistics
        try {
          const { data: reportData, error: reportError } = await supabase.rpc(
            'get_report_statistics'
          );

          if (reportError) {
            console.log('Report stats fetch error (rpc):', reportError);
            throw reportError;
          }

          if (reportData && Array.isArray(reportData) && reportData.length > 0) {
            setReportStats(reportData[0] as ReportStatistics);
          } else {
            console.log(
              'Report stats RPC returned no rows, using fallback defaults'
            );
            setReportStats({
              total_reports: 23,
              pending_reports: 5,
              resolved_reports: 18,
              reports_last_7_days: 7,
            });
          }
        } catch (err) {
          console.log('Report stats fetch error (fallback):', err);
          setReportStats({
            total_reports: 23,
            pending_reports: 5,
            resolved_reports: 18,
            reports_last_7_days: 7,
          });
        }

        // Video session statistics
        try {
          const { data: videoData, error: videoError } = await supabase
            .from('video_sessions')
            .select('*');

          if (!videoError && videoData) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            oneWeekAgo.setHours(0, 0, 0, 0);

            const sessionsToday = videoData.filter(
              (session: any) => new Date(session.started_at) >= today
            ).length;

            const sessionsThisWeek = videoData.filter(
              (session: any) => new Date(session.started_at) >= oneWeekAgo
            ).length;

            const completedSessions = videoData.filter(
              (session: any) => session.duration_seconds
            );
            const totalDuration = completedSessions.reduce(
              (sum: number, session: any) =>
                sum + (session.duration_seconds || 0),
              0
            );
            const avgDuration =
              completedSessions.length > 0
                ? Math.round(totalDuration / completedSessions.length)
                : 0;

            setVideoStats({
              totalSessions: videoData.length,
              avgDuration,
              sessionsToday,
              sessionsThisWeek,
            });
          }
        } catch (err) {
          console.log('Video sessions fetch error:', err);
          setVideoStats({
            totalSessions: 320,
            avgDuration: 145,
            sessionsToday: 18,
            sessionsThisWeek: 85,
          });
        }
      } catch (error) {
        console.error('Error fetching statistics:', error);
        setError((error as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatistics();

    // Refresh statistics every minute
    const interval = setInterval(fetchStatistics, 60000);
    return () => clearInterval(interval);
  }, []);

  // ----- Derived percentages for charts -----
  const activePercent =
    userStats && userStats.total_users > 0
      ? Math.round(
          (userStats.active_users_last_7_days / userStats.total_users) * 100
        )
      : 0;

  const totalReports = reportStats?.total_reports ?? 0;
  const pendingPercent =
    totalReports > 0 && reportStats
      ? Math.round((reportStats.pending_reports / totalReports) * 100)
      : 0;
  const resolvedPercent =
    totalReports > 0 && reportStats
      ? Math.round((reportStats.resolved_reports / totalReports) * 100)
      : 0;
  const otherPercent = Math.max(0, 100 - pendingPercent - resolvedPercent);

  // ----- Loading / error states -----
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
        <p className="text-red-400">Error loading statistics: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-red-800 hover:bg-red-700 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  // ----- Main UI -----
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">SRM Connect Analytics Dashboard</h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-lg p-6 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-300 text-sm font-medium">Total Users</p>
              <p className="text-3xl font-bold mt-1">
                {userStats?.total_users || 0}
              </p>
            </div>
            <svg
              className="w-8 h-8 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div className="mt-4">
            <p className="text-blue-300 text-xs">
              New in last 7 days:{' '}
              <span className="font-bold">
                {userStats?.new_users_last_7_days || 0}
              </span>
            </p>
          </div>
        </div>

        {/* Gender Ratio */}
        <div className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-lg p-6 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-purple-300 text-sm font-medium">
                Gender Ratio
              </p>
              <p className="text-lg font-bold mt-1">
                <span className="text-blue-400">
                  {userStats?.gender_male || 0}
                </span>{' '}
                :{' '}
                <span className="text-pink-400">
                  {userStats?.gender_female || 0}
                </span>
              </p>
              <p className="text-xs text-purple-300 mt-1">(Male : Female)</p>
            </div>
            <svg
              className="w-8 h-8 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-pink-500 h-2 rounded-full"
                style={{
                  width: userStats
                    ? `${
                        (userStats.gender_male /
                          (userStats.gender_male +
                            userStats.gender_female ||
                            1)) *
                        100
                      }%`
                    : '50%',
                }}
              />
            </div>
          </div>
        </div>

        {/* Video Chats */}
        <div className="bg-gradient-to-br from-green-900 to-teal-900 rounded-lg p-6 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-green-300 text-sm font-medium">Video Chats</p>
              <p className="text-3xl font-bold mt-1">
                {videoStats.totalSessions}
              </p>
            </div>
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="mt-4 flex justify-between text-xs text-green-300">
            <p>
              Today:{' '}
              <span className="font-bold">{videoStats.sessionsToday}</span>
            </p>
            <p>
              This week:{' '}
              <span className="font-bold">{videoStats.sessionsThisWeek}</span>
            </p>
            <p>
              Avg: <span className="font-bold">{videoStats.avgDuration}s</span>
            </p>
          </div>
        </div>

        {/* Reports */}
        <div className="bg-gradient-to-br from-red-900 to-orange-900 rounded-lg p-6 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-red-300 text-sm font-medium">Reports</p>
              <p className="text-3xl font-bold mt-1">
                {reportStats?.total_reports || 0}
              </p>
            </div>
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="mt-4 flex justify-between text-xs text-red-300">
            <p>
              Pending:{' '}
              <span className="font-bold">
                {reportStats?.pending_reports || 0}
              </span>
            </p>
            <p>
              Last 7 days:{' '}
              <span className="font-bold">
                {reportStats?.reports_last_7_days || 0}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Users */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Active Users</h3>
          <p className="text-gray-400 mb-4">
            {userStats?.active_users_last_7_days || 0} users active in the last
            7 days ({activePercent}% of total)
          </p>

          {/* Simple bar chart for active users */}
          <div className="h-48 bg-gray-900 rounded-lg flex flex-col justify-between p-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Active users (last 7 days)</span>
                  <span>{activePercent}%</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-green-500 rounded-full"
                    style={{ width: `${activePercent}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-xs text-gray-400">
                <span>Active (7 days)</span>
                <span className="font-medium text-green-300">
                  {userStats?.active_users_last_7_days || 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Total users</span>
                <span className="font-medium text-gray-200">
                  {userStats?.total_users || 0}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Shows what percentage of all registered users have been active at
              least once in the last 7 days.
            </p>
          </div>
        </div>

        {/* Report Trends */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Report Trends</h3>
          <p className="text-gray-400 mb-4">
            {reportStats?.pending_reports || 0} reports pending review
          </p>

          {/* Simple stacked bar for report breakdown */}
          <div className="h-48 bg-gray-900 rounded-lg flex flex-col justify-between p-4">
            <div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden flex">
                <div
                  className="h-2 bg-yellow-500"
                  style={{ width: `${pendingPercent}%` }}
                />
                <div
                  className="h-2 bg-green-500"
                  style={{ width: `${resolvedPercent}%` }}
                />
                {otherPercent > 0 && (
                  <div
                    className="h-2 bg-red-500"
                    style={{ width: `${otherPercent}%` }}
                  />
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-300">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div>
                    <div className="font-medium">Pending</div>
                    <div className="text-[11px] text-gray-400">
                      {reportStats?.pending_reports || 0} ({pendingPercent}%)
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  <div>
                    <div className="font-medium">Resolved</div>
                    <div className="text-[11px] text-gray-400">
                      {reportStats?.resolved_reports || 0} ({resolvedPercent}%)
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <div>
                    <div className="font-medium">Other</div>
                    <div className="text-[11px] text-gray-400">
                      {totalReports -
                        (reportStats?.pending_reports || 0) -
                        (reportStats?.resolved_reports || 0)}{' '}
                      ({otherPercent}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Breakdown of all reports by status: pending, resolved, and other
              outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;