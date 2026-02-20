const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body = null, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body !== null) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, config);
  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  updateMe: (body) => request('PATCH', '/auth/me', body),

  // Invites
  createInvite: () => request('POST', '/invites'),
  listInvites: () => request('GET', '/invites'),

  // Rounds
  listRounds: () => request('GET', '/rounds'),
  createRound: (body) => request('POST', '/rounds', body),
  getRound: (id) => request('GET', `/rounds/${id}`),
  updateRound: (id, body) => request('PATCH', `/rounds/${id}`, body),
  closeRound: (id) => request('POST', `/rounds/${id}/close`),

  // Proposals
  createProposal: (roundId, body) => request('POST', `/rounds/${roundId}/proposals`, body),
  deleteProposal: (id) => request('DELETE', `/proposals/${id}`),

  // Votes
  submitVotes: (roundId, body) => request('POST', `/rounds/${roundId}/votes`, body),
  getMyVotes: (roundId) => request('GET', `/rounds/${roundId}/votes/mine`),
  getResults: (roundId) => request('GET', `/rounds/${roundId}/results`),

  // Meetings
  listMeetings: (roundId) => request('GET', `/rounds/${roundId}/meetings`),
  createMeeting: (roundId, body) => request('POST', `/rounds/${roundId}/meetings`, body),
  submitAvailability: (meetingId, body) => request('POST', `/meetings/${meetingId}/availability`, body),
  confirmMeeting: (meetingId) => request('PATCH', `/meetings/${meetingId}/confirm`),
  deleteMeeting: (meetingId) => request('DELETE', `/meetings/${meetingId}`),

  // Notifications
  listNotifications: (page = 1) => request('GET', `/notifications?page=${page}`),
  sendNotification: (body) => request('POST', '/notifications/send', body),

  // Export
  exportFull: () => request('GET', '/export/full'),
  exportSince: (ts) => request('GET', `/export/since?ts=${encodeURIComponent(ts)}`),

  // Admin
  listMembers: () => request('GET', '/admin/members'),
};
