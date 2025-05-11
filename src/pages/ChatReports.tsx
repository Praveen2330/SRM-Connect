import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { 
  Shield, AlertTriangle, XCircle, 
  Filter, BarChart2, RefreshCw 
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ReportedChat {
  id: string;
  reporter_id: string;
  reported_id: string;
  chat_session_id: string;
  reported_at: string;
  reason: string;
  description: string | null;
  transcript: any[];
  status: 'pending' | 'reviewed' | 'ignored' | 'warning_issued' | 'user_banned';
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  action_taken: string | null;
  reporter_profile?: {
    display_name: string | null;
  };
  reported_profile?: {
    display_name: string | null;
  };
}

interface ChatAnalytics {
  id: string;
  date: string;
  active_users: number;
  total_chats: number;
  total_reports: number;
  avg_chat_duration: number;
  most_reported_user: string | null;
  most_reported_count: number;
}

export default function ChatReports() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<ReportedChat[]>([]);
  const [analytics, setAnalytics] = useState<ChatAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportedChat | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin on component mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/login');
          return;
        }

        // Check if user is in admin_users table
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (adminError || !adminData) {
          console.error('Not an admin user');
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);
        fetchReports();
        fetchAnalytics();
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [navigate]);

  // Fetch reported chats
  const fetchReports = async () => {
    try {
      let query = supabase
        .from('reported_chats')
        .select(`
          *,
          reporter_profile:profiles!reported_chats_reporter_id_fkey(display_name),
          reported_profile:profiles!reported_chats_reported_id_fkey(display_name)
        `);

      // Apply status filter
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Apply timeframe filter
      if (filterTimeframe !== 'all') {
        const date = new Date();
        if (filterTimeframe === 'today') {
          date.setHours(0, 0, 0, 0);
          query = query.gte('reported_at', date.toISOString());
        } else if (filterTimeframe === 'week') {
          date.setDate(date.getDate() - 7);
          query = query.gte('reported_at', date.toISOString());
        } else if (filterTimeframe === 'month') {
          date.setMonth(date.getMonth() - 1);
          query = query.gte('reported_at', date.toISOString());
        }
      }

      // Apply sorting
      if (sortBy === 'newest') {
        query = query.order('reported_at', { ascending: false });
      } else if (sortBy === 'oldest') {
        query = query.order('reported_at', { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
      setError('Failed to load reports');
    }
  };

  // Fetch chat analytics
  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('instant_chat_analytics')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      setAnalytics(data || []);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  // Handle report action
  const handleReportAction = async (action: string) => {
    if (!selectedReport) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Authentication error');
        return;
      }

      // Update report status
      const { error } = await supabase
        .from('reported_chats')
        .update({
          status: action === 'ignore' ? 'ignored' : 
                 action === 'warn' ? 'warning_issued' : 
                 action === 'ban' ? 'user_banned' : 'reviewed',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes,
          action_taken: action
        })
        .eq('id', selectedReport.id);

      if (error) throw error;

      // If action is to ban user, update user status
      if (action === 'ban') {
        const { error: banError } = await supabase
          .from('profiles')
          .update({ is_banned: true })
          .eq('id', selectedReport.reported_id);

        if (banError) {
          console.error('Error banning user:', banError);
          toast.error('Failed to ban user, but report was updated');
        }
      }

      // If action is to warn user, send notification (in a real system)
      if (action === 'warn') {
        // In a real system, you would send a notification to the user
        console.log(`Warning sent to user ${selectedReport.reported_id}`);
      }

      toast.success(`Report ${action === 'ignore' ? 'ignored' : action === 'warn' ? 'processed with warning' : action === 'ban' ? 'processed with ban' : 'reviewed'}`);
      
      // Refresh reports
      fetchReports();
      setSelectedReport(null);
      setAdminNotes('');
    } catch (error) {
      console.error('Error handling report action:', error);
      toast.error('Failed to process report');
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-400">You do not have permission to view this page.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-6 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-zinc-900">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="text-red-500" />
          Chat Reports & Moderation
        </h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-zinc-900 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter Reports
            </h2>
            <button
              onClick={() => {
                fetchReports();
                fetchAnalytics();
              }}
              className="flex items-center gap-2 px-3 py-1 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="ignored">Ignored</option>
                <option value="warning_issued">Warning Issued</option>
                <option value="user_banned">User Banned</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Timeframe</label>
              <select
                value={filterTimeframe}
                onChange={(e) => setFilterTimeframe(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>
          
          <button
            onClick={fetchReports}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>

        {/* Analytics */}
        <div className="bg-zinc-900 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
            <BarChart2 className="w-5 h-5" />
            Chat Analytics
          </h2>
          
          {analytics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-zinc-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-1">Active Users (Today)</h3>
                <p className="text-3xl font-bold">{analytics[0]?.active_users || 0}</p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-1">Total Chats (Today)</h3>
                <p className="text-3xl font-bold">{analytics[0]?.total_chats || 0}</p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-1">Reports (Today)</h3>
                <p className="text-3xl font-bold">{analytics[0]?.total_reports || 0}</p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-1">Avg Chat Duration</h3>
                <p className="text-3xl font-bold">{analytics[0]?.avg_chat_duration.toFixed(1) || 0} min</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No analytics data available</p>
          )}
        </div>

        {/* Reports list */}
        <div className="bg-zinc-900 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-6">Reported Chats</h2>
          
          {reports.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No reports found matching the current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Reporter</th>
                    <th className="text-left py-3 px-4">Reported User</th>
                    <th className="text-left py-3 px-4">Reason</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b border-zinc-800 hover:bg-zinc-800">
                      <td className="py-3 px-4">{formatDate(report.reported_at)}</td>
                      <td className="py-3 px-4">{report.reporter_profile?.display_name || 'Unknown'}</td>
                      <td className="py-3 px-4">{report.reported_profile?.display_name || 'Unknown'}</td>
                      <td className="py-3 px-4">{report.reason}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          report.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                          report.status === 'reviewed' ? 'bg-blue-900 text-blue-300' :
                          report.status === 'ignored' ? 'bg-gray-700 text-gray-300' :
                          report.status === 'warning_issued' ? 'bg-orange-900 text-orange-300' :
                          'bg-red-900 text-red-300'
                        }`}>
                          {report.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setSelectedReport(report);
                            setShowTranscript(false);
                            setAdminNotes(report.admin_notes || '');
                          }}
                          className="px-3 py-1 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Report detail modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-4xl w-full my-8">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold">Report Details</h3>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 hover:bg-zinc-800 rounded"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h4 className="font-medium text-gray-400 mb-2">Report Information</h4>
                <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
                  <div>
                    <span className="text-sm text-gray-400">Reported At:</span>
                    <p>{formatDate(selectedReport.reported_at)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-400">Reporter:</span>
                    <p>{selectedReport.reporter_profile?.display_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-400">Reported User:</span>
                    <p>{selectedReport.reported_profile?.display_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-400">Reason:</span>
                    <p>{selectedReport.reason}</p>
                  </div>
                  {selectedReport.description && (
                    <div>
                      <span className="text-sm text-gray-400">Description:</span>
                      <p className="whitespace-pre-wrap">{selectedReport.description}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-gray-400">Status:</span>
                    <p>{selectedReport.status.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-400 mb-2">Admin Actions</h4>
                <div className="bg-zinc-800 rounded-lg p-4">
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Admin Notes</label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="w-full bg-zinc-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      placeholder="Add your notes about this report..."
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleReportAction('ignore')}
                      className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                      disabled={selectedReport.status !== 'pending'}
                    >
                      Ignore
                    </button>
                    <button
                      onClick={() => handleReportAction('warn')}
                      className="px-3 py-2 bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                      disabled={selectedReport.status !== 'pending'}
                    >
                      Warn User
                    </button>
                    <button
                      onClick={() => handleReportAction('ban')}
                      className="px-3 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                      disabled={selectedReport.status !== 'pending'}
                    >
                      Ban User
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium text-gray-400">Chat Transcript</h4>
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                </button>
              </div>
              
              {showTranscript && (
                <div className="bg-zinc-800 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                  {selectedReport.transcript && selectedReport.transcript.length > 0 ? (
                    <div className="space-y-4">
                      {selectedReport.transcript.map((message: any, index: number) => (
                        <div 
                          key={index} 
                          className={`flex ${message.senderId === selectedReport.reported_id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div 
                            className={`max-w-[70%] rounded-lg px-4 py-2 ${
                              message.senderId === selectedReport.reported_id ? 'bg-red-900' : 'bg-zinc-700'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-xs text-gray-400">
                                {message.senderId === selectedReport.reported_id ? 'Reported User' : 'Reporter'}
                              </span>
                              <span className="text-xs text-gray-400">
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400">No transcript available</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
