import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ChatMessage, UserProfile } from '../../types';

interface ExtendedChatMessage extends ChatMessage {
  user_id?: string;
  recipient_id?: string;
  sender?: UserProfile;
  recipient?: UserProfile;
  flagged?: boolean;
}

const ChatMonitoring: React.FC = () => {
  const [chats, setChats] = useState<ExtendedChatMessage[]>([]);
  const [filteredChats, setFilteredChats] = useState<ExtendedChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('24h');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [flaggedKeywords, setFlaggedKeywords] = useState<string[]>([
    'abuse', 'threat', 'suicide', 'attack', 'kill', 'hurt', 'hack',
    'personal info', 'address', 'password', 'credit card'
  ]);
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedChat, setSelectedChat] = useState<ExtendedChatMessage | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalChats, setTotalChats] = useState(0);
  const chatsPerPage = 20;

  useEffect(() => {
    fetchChats();
  }, [page, timeFilter, flaggedOnly]);

  useEffect(() => {
    if (!chats) return;
    
    let filtered = [...chats];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(chat => 
        chat.content.toLowerCase().includes(term) || 
        chat.sender?.name?.toLowerCase().includes(term) ||
        chat.recipient?.name?.toLowerCase().includes(term)
      );
    }
    
    // Flag messages containing keywords
    filtered = filtered.map(chat => ({
      ...chat,
      flagged: flaggedKeywords.some(keyword => 
        chat.content.toLowerCase().includes(keyword.toLowerCase())
      )
    }));
    
    // Filter by flagged status if needed
    if (flaggedOnly) {
      filtered = filtered.filter(chat => chat.flagged);
    }
    
    setFilteredChats(filtered);
  }, [chats, searchTerm, flaggedOnly, flaggedKeywords]);

  const fetchChats = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
           // Prepare time filters using JavaScript dates (Supabase doesn't accept raw SQL in filters)
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
           // if timeFilter === 'all', fromDate stays null and no time filter is applied
            // Get total count
            let countQuery = supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true });
    
          if (fromDate) {
            countQuery = countQuery.gte('created_at', fromDate);
          }
    
          const { count, error: countError } = await countQuery.order('created_at', { ascending: false });
    
          if (countError) throw countError;
          setTotalChats(count || 0);
      
            // Fetch paginated chats with user profiles
            let query = supabase
            .from('chat_messages')
            .select(`
              *,
              sender:user_id(id, name, avatar_url),
              recipient:recipient_id(id, name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .range((page - 1) * chatsPerPage, page * chatsPerPage - 1);
    
          // Apply time filter if needed
          if (fromDate) {
            query = query.gte('created_at', fromDate);
          }
    
          const { data, error } = await query;
    
      
      if (error) throw error;
      
      if (data) {
        const transformedData = data.map(message => ({
          id: message.id,
          content: message.content,
          timestamp: new Date(message.created_at).getTime(),
          fromSelf: false,
          text: message.content,
          user_id: message.user_id,
          recipient_id: message.recipient_id,
          sender: message.sender,
          recipient: message.recipient,
          flagged: false // Will be set in the useEffect
        }));
        
        setChats(transformedData);
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    
    // Check if keyword already exists
    if (flaggedKeywords.includes(newKeyword.trim())) {
      return;
    }
    
    setFlaggedKeywords([...flaggedKeywords, newKeyword.trim()]);
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    setFlaggedKeywords(flaggedKeywords.filter(k => k !== keyword));
  };

  const totalPages = Math.ceil(totalChats / chatsPerPage);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Chat Monitoring</h2>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchChats}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh chats"
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
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-400 mb-1">
            Search Messages
          </label>
          <input
            type="text"
            id="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by message content or username"
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
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Filter Options
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 bg-gray-700 border-gray-600"
            />
            <span className="text-gray-300">Show only flagged messages</span>
          </label>
        </div>
      </div>
      
      {/* Flagged Keywords Section */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-medium">Flagged Keywords</h3>
          
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Add new keyword..."
              className="p-1 text-sm rounded bg-gray-700 border border-gray-600 text-white"
            />
            <button
              onClick={addKeyword}
              className="p-1 bg-green-800 hover:bg-green-700 rounded text-sm"
            >
              Add
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {flaggedKeywords.map(keyword => (
            <div 
              key={keyword} 
              className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-sm flex items-center"
            >
              <span>{keyword}</span>
              <button 
                onClick={() => removeKeyword(keyword)}
                className="ml-2 text-gray-400 hover:text-gray-200"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        
        <p className="text-xs text-gray-500 mt-2">
          Messages containing these keywords will be flagged for review.
        </p>
      </div>
      
      {/* Chats Table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Sender
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Recipient
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Message
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Timestamp
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
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
            ) : filteredChats.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  No messages found
                </td>
              </tr>
            ) : (
              filteredChats.map(chat => (
                <tr 
                  key={chat.id} 
                  className={`hover:bg-gray-800 ${chat.flagged ? 'bg-red-900 bg-opacity-10' : ''}`}
                  onClick={() => {
                    setSelectedChat(chat);
                    setIsChatModalOpen(true);
                  }}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        {chat.sender?.avatar_url ? (
                          <img 
                            className="h-8 w-8 rounded-full object-cover" 
                            src={chat.sender.avatar_url} 
                            alt={chat.sender?.name || 'Sender'} 
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-sm text-gray-300">
                              {(chat.sender?.name || 'S').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-white">
                          {chat.sender?.name || 'Unknown Sender'}
                        </div>
                        <div className="text-xs text-gray-500">{chat.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        {chat.recipient?.avatar_url ? (
                          <img 
                            className="h-8 w-8 rounded-full object-cover" 
                            src={chat.recipient.avatar_url} 
                            alt={chat.recipient?.name || 'Recipient'} 
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-sm text-gray-300">
                              {(chat.recipient?.name || 'R').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-white">
                          {chat.recipient?.name || 'Unknown Recipient'}
                        </div>
                        <div className="text-xs text-gray-500">{chat.recipient_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300 truncate max-w-xs">
                      {chat.content}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(chat.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {chat.flagged && (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900 text-red-300">
                        Flagged
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
          Showing {filteredChats.length} of {totalChats} messages
          {flaggedOnly && (
            <span className="ml-2">
              ({filteredChats.filter(c => c.flagged).length} flagged)
            </span>
          )}
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
      
      {/* Chat Details Modal */}
      {isChatModalOpen && selectedChat && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold">Message Details</h3>
              <button
                onClick={() => {
                  setIsChatModalOpen(false);
                  setSelectedChat(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Sender</h5>
                <div className="bg-gray-800 rounded p-4 flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    {selectedChat.sender?.avatar_url ? (
                      <img 
                        className="h-10 w-10 rounded-full object-cover" 
                        src={selectedChat.sender.avatar_url} 
                        alt={selectedChat.sender?.name || 'Sender'} 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-lg text-gray-300">
                          {(selectedChat.sender?.name || 'S').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{selectedChat.sender?.name || 'Unknown Sender'}</div>
                    <div className="text-sm text-gray-400">ID: {selectedChat.user_id}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Recipient</h5>
                <div className="bg-gray-800 rounded p-4 flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    {selectedChat.recipient?.avatar_url ? (
                      <img 
                        className="h-10 w-10 rounded-full object-cover" 
                        src={selectedChat.recipient.avatar_url} 
                        alt={selectedChat.recipient?.name || 'Recipient'} 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-lg text-gray-300">
                          {(selectedChat.recipient?.name || 'R').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{selectedChat.recipient?.name || 'Unknown Recipient'}</div>
                    <div className="text-sm text-gray-400">ID: {selectedChat.recipient_id}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <h5 className="text-sm font-medium text-gray-400 mb-2">Message</h5>
              <div className="bg-gray-800 rounded p-4">
                <div className="mb-3">
                  <div className="text-xs text-gray-500">Timestamp</div>
                  <div className="text-sm">{new Date(selectedChat.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Content</div>
                  <div className="text-sm bg-gray-900 p-3 rounded mt-1 whitespace-pre-wrap">
                    {selectedChat.content}
                  </div>
                </div>
                
                {selectedChat.flagged && (
                  <div className="mt-4 bg-red-900 bg-opacity-20 border border-red-800 rounded p-3">
                    <div className="text-sm font-medium text-red-400 mb-1">
                      Flagged for containing:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {flaggedKeywords.filter(keyword => 
                        selectedChat.content.toLowerCase().includes(keyword.toLowerCase())
                      ).map(keyword => (
                        <span 
                          key={keyword} 
                          className="bg-red-800 bg-opacity-50 text-red-300 px-2 py-0.5 rounded-full text-xs"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-800">
              <button
                onClick={() => {
                  window.open(`/admin/users?id=${selectedChat.user_id}`, '_blank');
                }}
                className="px-4 py-2 bg-indigo-800 hover:bg-indigo-700 rounded"
              >
                View Sender Profile
              </button>
              
              <button
                onClick={() => {
                  // Generate report URL with pre-filled information
                  const reportUrl = `/admin/reports/new?reported_user_id=${selectedChat.user_id}&reason=Inappropriate message: ${encodeURIComponent(selectedChat.content.substring(0, 50))}...`;
                  window.open(reportUrl, '_blank');
                }}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded"
              >
                Create Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMonitoring;
