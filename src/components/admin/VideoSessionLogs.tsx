import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { VideoSession } from '../../types';

type TimeFilter = 'all' | 'today' | '7days' | '30days';
type SortField = 'started_at' | 'duration_seconds';
type SortDirection = 'asc' | 'desc';

const SESSIONS_PER_PAGE = 10;

const VideoSessionLogs: React.FC = () => {
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortBy, setSortBy] = useState<SortField>('started_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState<number>(1);
  const [totalSessions, setTotalSessions] = useState<number>(0);

  // ---------- Helpers ----------

  const buildDateFilter = useCallback(
    (filter: TimeFilter): Record<string, string> => {
      const now = new Date();
      let startDate: Date | null = null;

      if (filter === 'today') {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      } else if (filter === '7days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
      } else if (filter === '30days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
      }

      if (!startDate) return {};
      return { started_at: `gte.${startDate.toISOString()}` };
    },
    []
  );

  const formatDuration = (seconds?: number | null): string => {
    if (!seconds || seconds <= 0) return 'N/A';

    if (seconds < 60) {
      return `${seconds}s`;
    }

    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const remainingSeconds = seconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    return `${hours}h ${minutes}m`;
  };

  const handleSortClick = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  // ---------- Data fetching ----------

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dateFilter = buildDateFilter(timeFilter);

      // Total count
      let countQuery = supabase
        .from('video_sessions')
        .select('*', { count: 'exact', head: true });

      if (Object.keys(dateFilter).length > 0) {
        const [field, value] = Object.entries(dateFilter)[0];
        countQuery = countQuery.filter(field, value);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalSessions(count ?? 0);

      // Paginated sessions + joined profiles
      let query = supabase
        .from('video_sessions')
        .select(
          `
          *,
          user1:user1_id ( id, full_name, avatar_url ),
          user2:user2_id ( id, full_name, avatar_url )
        `
        )
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range((page - 1) * SESSIONS_PER_PAGE, page * SESSIONS_PER_PAGE - 1);

      if (Object.keys(dateFilter).length > 0) {
        const [field, value] = Object.entries(dateFilter)[0];
        query = query.filter(field, value);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSessions((data || []) as VideoSession[]);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [buildDateFilter, page, sortBy, sortDirection, timeFilter]);

  // Fetch when pagination / filters / sort changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ---------- Derived data ----------

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;

    const term = searchTerm.toLowerCase();

    return sessions.filter((session) => {
      const user1Name = session.user1?.full_name?.toLowerCase() || '';
      const user2Name = session.user2?.full_name?.toLowerCase() || '';
      const sessionId = session.id.toLowerCase();

      return (
        user1Name.includes(term) ||
        user2Name.includes(term) ||
        sessionId.includes(term)
      );
    });
  }, [sessions, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(totalSessions / SESSIONS_PER_PAGE));

  const averageDuration = useMemo(() => {
    const withDuration = sessions.filter((s) => s.duration_seconds);
    if (!withDuration.length) return 'N/A';

    const total = withDuration.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );
    return formatDuration(Math.floor(total / withDuration.length));
  }, [sessions]);

  const sessionsTodayCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return sessions.filter((s) => new Date(s.started_at) >= today).length;
  }, [sessions]);

  const activeSessionsCount = useMemo(
    () => sessions.filter((s) => !s.ended_at).length,
    [sessions]
  );

  // ---------- Render ----------

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Video Session Logs</h2>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchSessions}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh sessions"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Total Sessions</div>
            <div className="text-xl font-semibold mt-1">{totalSessions}</div>
          </div>
          <svg
            className="w-8 h-8 text-indigo-500"
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

        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Avg. Duration</div>
            <div className="text-xl font-semibold mt-1">{averageDuration}</div>
          </div>
          <svg
            className="w-8 h-8 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Sessions Today</div>
            <div className="text-xl font-semibold mt-1">
              {sessionsTodayCount}
            </div>
          </div>
          <svg
            className="w-8 h-8 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Active Now</div>
            <div className="text-xl font-semibold mt-1">
              {activeSessionsCount}
            </div>
          </div>
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label
            htmlFor="search"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Search
          </label>
          <input
            id="search"
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search by user or session ID"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>

        <div>
          <label
            htmlFor="timeFilter"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Time Period
          </label>
          <select
            id="timeFilter"
            value={timeFilter}
            onChange={(e) => {
              setTimeFilter(e.target.value as TimeFilter);
              setPage(1);
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sort"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Sort By
          </label>
          <select
            id="sort"
            value={`${sortBy}_${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('_') as [
                SortField,
                SortDirection
              ];
              setSortBy(field);
              setSortDirection(direction);
              setPage(1);
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="started_at_desc">Latest First</option>
            <option value="started_at_asc">Oldest First</option>
            <option value="duration_seconds_desc">Longest Duration</option>
            <option value="duration_seconds_asc">Shortest Duration</option>
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
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSortClick('started_at')}
              >
                <div className="flex items-center">
                  Started At
                  {sortBy === 'started_at' && (
                    <svg
                      className={`w-4 h-4 ml-1 ${
                        sortDirection === 'asc' ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  )}
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSortClick('duration_seconds')}
              >
                <div className="flex items-center">
                  Duration
                  {sortBy === 'duration_seconds' && (
                    <svg
                      className={`w-4 h-4 ml-1 ${
                        sortDirection === 'asc' ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-4 text-center text-gray-400"
                >
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
                  </div>
                </td>
              </tr>
            ) : !filteredSessions.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-4 text-center text-gray-400"
                >
                  No sessions found
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-mono text-gray-300">
                      {session.id.substring(0, 8)}...
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      {/* User 1 */}
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          {session.user1?.avatar_url ? (
                            <img
                              className="h-8 w-8 rounded-full object-cover"
                              src={session.user1.avatar_url}
                              alt={session.user1.full_name || 'User 1'}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-sm text-gray-300">
                                {(session.user1?.full_name || 'U')
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium text-white">
                            {session.user1?.full_name || 'Unknown User'}
                          </div>
                        </div>
                      </div>

                      <div className="text-gray-400 flex items-center">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 5l7 7-7 7M5 5l7 7-7 7"
                          />
                        </svg>
                      </div>

                      {/* User 2 */}
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          {session.user2?.avatar_url ? (
                            <img
                              className="h-8 w-8 rounded-full object-cover"
                              src={session.user2.avatar_url}
                              alt={session.user2.full_name || 'User 2'}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-sm text-gray-300">
                                {(session.user2?.full_name || 'U')
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium text-white">
                            {session.user2?.full_name || 'Unknown User'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(session.started_at).toLocaleString()}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {formatDuration(session.duration_seconds)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {session.ended_at ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-300">
                        Ended
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900 text-green-300">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <div className="text-sm text-gray-400">
          Showing {filteredSessions.length} of {totalSessions} sessions
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${
              page === 1
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Previous
          </button>

          <span className="px-3 py-1 bg-gray-800 rounded">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages}
            className={`px-3 py-1 rounded ${
              page >= totalPages
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoSessionLogs;