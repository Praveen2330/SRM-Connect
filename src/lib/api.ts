import { supabase } from './supabase';

export const api = {
  matches: {
    getAll: async (userId: string) => {
      const response = await fetch(`/api/matches/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch matches');
      return response.json();
    }
  },
  
  messages: {
    getByMatch: async (matchId: string) => {
      const response = await fetch(`/api/messages/${matchId}`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    
    send: async (matchId: string, content: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          match_id: matchId,
          sender_id: user.id,
          content
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    }
  },
  
  profile: {
    update: async (profile: Partial<Profile>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .update(profile)
        .eq('id', user.id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    
    getPreferences: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('matching_preferences')
        .eq('id', user.id)
        .single();
        
      if (error) throw error;
      return data.matching_preferences;
    }
  }
};