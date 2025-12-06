// src/components/admin/VideoSessionLogs.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { VideoSession } from '../../types';

type UserNameMap = Record<string, string>;

const VideoSessionLogs: React.FC = () => {
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [userNames, setUserNames] = useState<UserNameMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, sortBy]);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1) Time filter
      let fromDate: string | null = null;
      if (timeFilter === '24h') {
        const d = new Date();
        d.setHours(d.getHours() - 24);
        fromDate = d.toISOString();
      } else if (timeFilter === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        fromDate = d.toISOString();
      } else if (timeFilter === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        fromDate = d.toISOString();
      }

      let query = supabase
        .from('video_sessions')
        .select('*')
        .order('started_at', { ascending: sortBy === 'oldest' });

      if (fromDate) {
        query = query.gte('started_at', fromDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const sessionsData = (data || []) as VideoSession[];
      setSessions(sessionsData);

      // 2) Collect all unique user IDs from user1_id and user2_id
      const idSet = new Set<string>();
      sessionsData.forEach((s) => {
        if (s.user1_id) idSet.add(s.user1_id);
        if (s.user2_id) idSet.add(s.user2_id);
      });

      if (idSet.size === 0) {
        setUserNames({});
        return;
      }

      const ids = Array.from(idSet);

      // 3) Fetch names from profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ids);

      if (profilesError) {
        console.error('Error fetching profile names:', profilesError);
        // Don’t throw – we still want sessions to show
      }

      const nameMap: UserNameMap = {};
      (profilesData || []).forEach((p: any) => {
        nameMap[p.id] = p.display_name || 'Unknown User';
      });

      setUserNames(nameMap);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserName = (id?: string | null) => {
    if (!id) return 'Unknown User';
    return userNames[id] || 'Unknown User';
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.id.toLowerCase().includes(term) ||
      getUserName(s.user1_id).toLowerCase().includes(term) ||
      getUserName(s.user2_id).toLowerCase().includes(term)
    );
  });

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleString();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Video Sessions</h2>
        <button
          onClick={fetchSessions}
          className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
          title="Refresh sessions"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Search
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by user or session ID"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Time Period
          </label>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="latest">Latest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Sessions table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Session ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Started At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
                  </div>
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  No sessions found
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {session.id.slice(0, 7)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {getUserName(session.user1_id)} &nbsp;»&nbsp; {getUserName(session.user2_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {formatDateTime(session.started_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {formatDuration(session.duration_seconds)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        !session.ended_at
                          ? 'bg-green-900 text-green-300'
                          : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {!session.ended_at ? 'Active' : 'Ended'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VideoSessionLogs;