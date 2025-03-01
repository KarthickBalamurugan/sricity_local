import { useEffect, useState } from 'react';
import { useSession } from "@clerk/clerk-react";

interface User {
  _id: string;
  email: string;
  isAdmin: boolean;
  isApproved: boolean;
}

interface Transcript {
  audio_url: string;
  full_text: string;
  speakers: {
    speaker: string;
    text: string;
    start: number;
    end: number;
  }[];
  timestamp: number;
  report_url: string;
}

interface Room {
  roomID: string;
  roomName: string;
  email: string;
  participants: string[];
  qrCode: string;
  audio: string[];
  transcripts: Transcript[];
}

const Admin = () => {
  const { session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'reports'>('users');
  const currentUserEmail = session?.user.emailAddresses[0].emailAddress;

  // Add passive event listeners for better scrolling performance
  useEffect(() => {
    const addPassiveListener = () => {
      const wheelOpts = { passive: true } as AddEventListenerOptions;
      const touchOpts = { passive: true } as AddEventListenerOptions;

      document.addEventListener('wheel', () => {}, wheelOpts);
      document.addEventListener('touchstart', () => {}, touchOpts);

      return () => {
        document.removeEventListener('wheel', () => {}, wheelOpts);
        document.removeEventListener('touchstart', () => {}, touchOpts);
      };
    };

    const cleanup = addPassiveListener();
    return () => cleanup();
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersResponse, roomsResponse] = await Promise.all([
        fetch('http://127.0.0.1:5000/users'),
        fetch('http://127.0.0.1:5000/rooms')
      ]);
      
      const [usersData, roomsData] = await Promise.all([
        usersResponse.json(),
        roomsResponse.json()
      ]);
      
      setUsers(usersData);
      setRooms(roomsData);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Fetch error:', error);
      setError('Failed to fetch data');
      setLoading(false);
    }
  };

  const updateUser = async (email: string, updates: { isAdmin?: boolean; isApproved?: boolean }) => {
    if (email === currentUserEmail) {
      setError("You cannot modify your own permissions");
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:5000/users/${email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      fetchData();
    } catch (error: unknown) {
      console.error('Update error:', error);
      setError('Failed to update user');
      setTimeout(() => setError(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 pt-20">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">Manage users and view reports</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-100 border border-red-200 text-red-700 text-sm rounded-lg shadow-sm">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          User Management
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'reports'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Report Generation
        </button>
      </div>

      {/* User Management Section */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {users.length} Users
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id} className={user.email === currentUserEmail ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <span className="text-xl text-white">{user.email[0].toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.email}
                          </div>
                          {user.email === currentUserEmail && (
                            <div className="text-xs text-gray-500">(You)</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${user.isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {user.isApproved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {user.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => updateUser(user.email, { isApproved: !user.isApproved })}
                        className={`mr-3 px-3 py-1 rounded-md ${
                          user.email === currentUserEmail
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                        disabled={user.email === currentUserEmail}
                      >
                        {user.isApproved ? 'Revoke Access' : 'Approve'}
                      </button>
                      <button
                        onClick={() => updateUser(user.email, { isAdmin: !user.isAdmin })}
                        className={`px-3 py-1 rounded-md ${
                          user.email === currentUserEmail
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                        disabled={user.email === currentUserEmail}
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Generation Section */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Meeting Reports</h2>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {rooms.length} Meetings
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Room Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Participants
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recordings & Transcripts
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rooms.map((room) => (
                  <tr key={room.roomID}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{room.roomName}</div>
                      <div className="text-xs text-gray-500">ID: {room.roomID}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{room.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {room.participants.map((participant, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {participant}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-4">
                        {room.transcripts?.map((transcript, index) => (
                          <div key={index} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-gray-900">
                                Recording {index + 1}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(transcript.timestamp * 1000).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <audio
                                controls
                                className="w-full max-w-xs"
                                src={transcript.audio_url}
                              >
                                Your browser does not support the audio element.
                              </audio>
                              <a
                                href={transcript.report_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                              >
                                <svg
                                  className="mr-2 h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                                Download Report
                              </a>
                            </div>
                          </div>
                        ))}
                        {(!room.transcripts || room.transcripts.length === 0) && (
                          <span className="text-sm text-gray-500">No recordings available</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
