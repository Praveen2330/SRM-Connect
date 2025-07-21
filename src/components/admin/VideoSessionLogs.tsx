import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { VideoSession } from '../../types';

const VideoSessionLogs: React.FC = () => {
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<VideoSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('started_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const sessionsPerPage = 10;

  useEffect(() => {
    fetchSessions();
  }, [page, timeFilter, sortBy, sortDirection]);

  useEffect(() => {
    if (!sessions) return;
    
    let filtered = [...sessions];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(session => 
        session.user1?.name?.toLowerCase().includes(term) || 
        session.user2?.name?.toLowerCase().includes(term) ||
        session.id.toLowerCase().includes(term)
      );
    }
    
    setFilteredSessions(filtered);
  }, [sessions, searchTerm]);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare date filters
      let dateFilter = {};
      const now = new Date();
      
      if (timeFilter === 'today') {
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        dateFilter = { started_at: `gte.${today.toISOString()}` };
      } else if (timeFilter === '7days') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        dateFilter = { started_at: `gte.${sevenDaysAgo.toISOString()}` };
      } else if (timeFilter === '30days') {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFilter = { started_at: `gte.${thirtyDaysAgo.toISOString()}` };
      }
      
      // Get total count
      let countQuery = supabase
        .from('video_sessions')
        .select('*', { count: 'exact', head: true });
      
      // Apply date filter to count query if needed
      if (Object.keys(dateFilter).length > 0) {
        countQuery = countQuery.filter(Object.keys(dateFilter)[0], Object.values(dateFilter)[0] as string);
      }
      
      const { count, error: countError } = await countQuery;
      
      if (countError) throw countError;
      setTotalSessions(count || 0);
      
      // Fetch paginated sessions with user profiles
      let query = supabase
        .from('video_sessions')
        .select(`
          *,
          user1:user1_id(id, name, avatar_url),
          user2:user2_id(id, name, avatar_url)
        `)
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range((page - 1) * sessionsPerPage, page * sessionsPerPage - 1);
      
      // Apply date filter if needed
      if (Object.keys(dateFilter).length > 0) {
        query = query.filter(Object.keys(dateFilter)[0], Object.values(dateFilter)[0] as string);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      if (data) {
        setSessions(data as VideoSession[]);
        setFilteredSessions(data as VideoSession[]);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle sort direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingSeconds = seconds % 3600;
      const minutes = Math.floor(remainingSeconds / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const totalPages = Math.ceil(totalSessions / sessionsPerPage);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Video Session Logs</h2>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchSessions}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh sessions"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Total Sessions</div>
            <div className="text-xl font-semibold mt-1">{totalSessions}</div>
          </div>
          <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Avg. Duration</div>
            <div className="text-xl font-semibold mt-1">
              {sessions.length > 0 
                ? formatDuration(Math.floor(
                    sessions
                      .filter(s => s.duration_seconds)
                      .reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 
                    sessions.filter(s => s.duration_seconds).length
                  ))
                : 'N/A'}
            </div>
          </div>
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Sessions Today</div>
            <div className="text-xl font-semibold mt-1">
              {sessions.filter(s => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return new Date(s.started_at) >= today;
              }).length}
            </div>
          </div>
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400">Active Now</div>
            <div className="text-xl font-semibold mt-1">
              {sessions.filter(s => !s.ended_at).length}
            </div>
          </div>
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        </div>
      </div>
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-400 mb-1">
            Search
          </label>
          <input
            type="text"
            id="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by user or session ID"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>
        
        <div>
          <label htmlFor="timeFilter" className="block text-sm font-medium text-gray-400 mb-1">
            Time Period
          </label>
          <select
            id="timeFilter"
            value={timeFilter}
            onChange={(e) => {
              setTimeFilter(e.target.value);
              setPage(1); // Reset to first page
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
          <label htmlFor="sort" className="block text-sm font-medium text-gray-400 mb-1">
            Sort By
          </label>
          <select
            id="sort"
            value={`${sortBy}_${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('_');
              setSortBy(field);
              setSortDirection(direction);
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
      
      {/* Sessions Table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Session ID
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Users
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('started_at')}
              >
                <div className="flex items-center">
                  Started At
                  {sortBy === 'started_at' && (
                    <svg className={`w-4 h-4 ml-1 ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('duration_seconds')}
              >
                <div className="flex items-center">
                  Duration
                  {sortBy === 'duration_seconds' && (
                    <svg className={`w-4 h-4 ml-1 ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
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
              filteredSessions.map(session => (
                <tr key={session.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-mono text-gray-300">
                      {session.id.substring(0, 8)}...
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          {session.user1?.avatar_url ? (
                            <img 
                              className="h-8 w-8 rounded-full object-cover" 
                              src={session.user1.avatar_url} 
                              alt={session.user1?.name || 'User 1'} 
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-sm text-gray-300">
                                {(session.user1?.name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium text-white">
                            {session.user1?.name || 'Unknown User'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-gray-400 flex items-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </div>
                      
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          {session.user2?.avatar_url ? (
                            <img 
                              className="h-8 w-8 rounded-full object-cover" 
                              src={session.user2.avatar_url} 
                              alt={session.user2?.name || 'User 2'} 
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-sm text-gray-300">
                                {(session.user2?.name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium text-white">
                            {session.user2?.name || 'Unknown User'}
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
            onClick={() => setPage(prevPage => Math.max(prevPage - 1, 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${page === 1 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-white hover:bg-gray-600'}`}
          >
            Previous
          </button>
          
          <span className="px-3 py-1 bg-gray-800 rounded">
            Page {page} of {totalPages || 1}
          </span>
          
          <button
            onClick={() => setPage(prevPage => prevPage + 1)}
            disabled={page >= totalPages}
            className={`px-3 py-1 rounded ${page >= totalPages 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-white hover:bg-gray-600'}`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoSessionLogs;
