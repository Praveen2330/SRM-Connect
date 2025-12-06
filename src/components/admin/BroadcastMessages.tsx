import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

type SystemAnnouncement = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string | null;
  target_users?: string | null;
  is_active?: boolean | null;
};

const BroadcastMessages: React.FC = () => {
  const { user } = useAuth();

  const [announcementData, setAnnouncementData] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetUsers, setTargetUsers] = useState("all");
  const [expiry, setExpiry] = useState<string>("");

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAnnouncementData(data || []);
    } catch (error) {
      console.error("Failed to fetch announcements:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const createAnnouncement = async () => {
    if (!title.trim() || !message.trim()) return alert("Please fill title and message");

    setCreating(true);
    try {
      const { error } = await supabase.from("system_announcements").insert([
        {
          title,
          message,
          target_users: targetUsers,
          expires_at: expiry || null,
          is_active: true
        }
      ]);

      if (error) throw error;

      setTitle("");
      setMessage("");
      setExpiry("");
      setTargetUsers("all");

      fetchAnnouncements();
      alert("Announcement created successfully");
    } catch (error) {
      alert("Failed to create announcement");
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    await supabase.from("system_announcements").update({ is_active: !currentState }).eq("id", id);
    fetchAnnouncements();
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;

    await supabase.from("system_announcements").delete().eq("id", id);
    fetchAnnouncements();
  };

  const now = new Date();

  const visibleAnnouncements = announcementData.filter(
    (a) => !a.expires_at || new Date(a.expires_at) >= now
  );

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-6">Broadcast Messages</h1>

      {/* CREATE ANNOUNCEMENT */}
      <div className="bg-zinc-900 p-6 rounded-lg mb-8 border border-zinc-700">
        <h2 className="text-xl font-semibold mb-4">Create New Announcement</h2>

        <input
          type="text"
          placeholder="Title"
          className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 mb-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          placeholder="Message"
          className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 mb-3"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <div className="mb-3">
          <label className="block mb-1">Target Audience</label>
          <select
            className="p-2 rounded bg-zinc-800 border border-zinc-700"
            value={targetUsers}
            onChange={(e) => setTargetUsers(e.target.value)}
          >
            <option value="all">All</option>
            <option value="male">Male Users</option>
            <option value="female">Female Users</option>
            <option value="any">Any</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-1">Expires At (optional)</label>
          <input
            type="datetime-local"
            className="p-2 rounded bg-zinc-800 border border-zinc-700"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </div>

        <button
          onClick={createAnnouncement}
          disabled={creating}
          className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-semibold"
        >
          {creating ? "Posting..." : "Create Announcement"}
        </button>
      </div>

      {/* EXISTING ANNOUNCEMENTS */}
      <h2 className="text-xl font-semibold mb-4">All Announcements</h2>

      {loading ? (
        <p>Loading...</p>
      ) : visibleAnnouncements.length === 0 ? (
        <p className="text-gray-400">No announcements found.</p>
      ) : (
        <ul className="space-y-4">
          {visibleAnnouncements.map((a) => (
            <li key={a.id} className="bg-zinc-900 p-5 rounded-lg border border-zinc-700">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg">{a.title}</h3>
                <span className="text-xs text-gray-400">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </div>

              <p className="text-gray-300 mb-3">{a.message}</p>

              <p className="text-sm text-gray-400 mb-2">
                🎯 Target Audience: <span className="text-white">{a.target_users || "all"}</span>
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => toggleActive(a.id, a.is_active ?? true)}
                  className={`px-3 py-1 rounded text-sm ${
                    a.is_active
                      ? "bg-yellow-600 hover:bg-yellow-500"
                      : "bg-green-600 hover:bg-green-500"
                  }`}
                >
                  {a.is_active ? "Deactivate" : "Activate"}
                </button>

                <button
                  onClick={() => deleteAnnouncement(a.id)}
                  className="px-3 py-1 rounded text-sm bg-red-600 hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BroadcastMessages;