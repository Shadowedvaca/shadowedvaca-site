/* ============================================================
   ideas.js — Shadowedvaca Ideation Board
   Requires: marked.min.js loaded before this file
   ============================================================ */

var JWT_KEY = 'sv_site_jwt';
var API_BASE = '/api';

// ---- Auth gate ----

function getToken() {
  try {
    var raw = localStorage.getItem(JWT_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data.token) return null;
    var parts = data.token.split('.');
    if (parts.length !== 3) return null;
    var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(JWT_KEY);
      return null;
    }
    return data.token;
  } catch (e) { return null; }
}

// ---- Data ----

var allIdeas = [];
var currentSort = 'updated';  // 'updated' | 'name'
var currentStatus = '';
var currentSearch = '';

async function loadIdeas() {
  var token = getToken();
  if (!token) {
    var next = encodeURIComponent(location.pathname);
    location.href = '/login.html?next=' + next;
    return;
  }

  try {
    var resp = await fetch(API_BASE + '/ideas?limit=200', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (resp.status === 401) {
      localStorage.removeItem(JWT_KEY);
      location.href = '/login.html';
      return;
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    allIdeas = data.ideas || [];
    renderGrid();
  } catch (e) {
    document.getElementById('idea-grid').innerHTML =
      '<p class="ideas-state-msg ideas-error">Failed to load ideas. ' + e.message + '</p>';
  }
}

// ---- Filtering & sorting ----

function getFiltered() {
  var ideas = allIdeas.slice();

  if (currentStatus) {
    ideas = ideas.filter(function(i) { return i.status === currentStatus; });
  }
  if (currentSearch) {
    var q = currentSearch.toLowerCase();
    ideas = ideas.filter(function(i) {
      return (i.title + ' ' + i.elevator_pitch + ' ' + (i.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (currentSort === 'name') {
    ideas.sort(function(a, b) { return a.title.localeCompare(b.title); });
  } else {
    ideas.sort(function(a, b) { return b.updated_at.localeCompare(a.updated_at); });
  }
  return ideas;
}

// ---- Badge helpers ----

var STATUS_COLORS = {
  spark:       '#00d4ff',
  exploring:   '#f0a030',
  researching: '#a78bfa',
  committed:   '#2ecc71',
  shelved:     '#6b7280'
};

function isRecentlyUpdated(updatedAt) {
  var d = new Date(updatedAt);
  var diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

function daysAgo(dateStr) {
  var d = new Date(dateStr);
  var diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return diffDays + ' days ago';
}

// ---- Card rendering ----

function renderGrid() {
  var grid = document.getElementById('idea-grid');
  var ideas = getFiltered();

  if (ideas.length === 0) {
    grid.innerHTML = '<p class="ideas-state-msg">No ideas match your filters.</p>';
    return;
  }

  var html = ideas.map(function(idea) {
    var color = STATUS_COLORS[idea.status] || '#c8cdd3';
    var updatedBadge = isRecentlyUpdated(idea.updated_at)
      ? '<span class="idea-badge idea-badge--updated">Updated</span>' : '';
    var docCount = idea.document_count || 0;
    var docBadge = docCount > 0
      ? '<span class="idea-badge idea-badge--docs">' + docCount + ' doc' + (docCount !== 1 ? 's' : '') + '</span>' : '';
    var tags = (idea.tags || []).map(function(t) {
      return '<span class="idea-tag">' + escapeHtml(t) + '</span>';
    }).join('');

    return (
      '<div class="idea-card" data-id="' + idea.id + '">' +
        '<div class="idea-card-header">' +
          '<span class="idea-status-dot" style="background:' + color + '" title="' + idea.status + '"></span>' +
          '<h2 class="idea-card-title">' + escapeHtml(idea.title) + '</h2>' +
          '<div class="idea-card-badges">' + updatedBadge + docBadge + '</div>' +
        '</div>' +
        '<p class="idea-card-pitch">' + escapeHtml(idea.elevator_pitch) + '</p>' +
        (tags ? '<div class="idea-card-tags">' + tags + '</div>' : '') +
        '<p class="idea-card-meta">' + escapeHtml(idea.status) + ' · updated ' + daysAgo(idea.updated_at) + '</p>' +
      '</div>'
    );
  }).join('');

  grid.innerHTML = html;

  grid.querySelectorAll('.idea-card').forEach(function(card) {
    card.addEventListener('click', function() {
      openOverlay(parseInt(card.dataset.id));
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Overlay (drill-in) ----

async function openOverlay(ideaId) {
  var idea = allIdeas.find(function(i) { return i.id === ideaId; });
  if (!idea) return;

  var overlay = document.getElementById('idea-overlay');
  var content = document.getElementById('overlay-content');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  var color = STATUS_COLORS[idea.status] || '#c8cdd3';
  content.innerHTML =
    '<h2 class="overlay-title">' + escapeHtml(idea.title) + '</h2>' +
    '<div class="overlay-meta">' +
      '<span class="idea-status-dot" style="background:' + color + '"></span>' +
      ' ' + escapeHtml(idea.status) +
      (idea.project ? ' · <em>' + escapeHtml(idea.project) + '</em>' : '') +
    '</div>' +
    '<div class="overlay-pitch">' + escapeHtml(idea.elevator_pitch) + '</div>' +
    '<div id="overlay-docs"><em>Loading documents...</em></div>';

  var token = getToken();
  if (!token) return;

  try {
    var resp = await fetch(API_BASE + '/ideas/' + ideaId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) {
      document.getElementById('overlay-docs').innerHTML = '<em>Could not load documents.</em>';
      return;
    }
    var data = await resp.json();
    renderDocs(data.documents || [], data.aspects || []);
  } catch (e) {
    document.getElementById('overlay-docs').innerHTML = '<em>Could not load documents.</em>';
  }
}

function renderDocs(docs, aspects) {
  var container = document.getElementById('overlay-docs');
  var html = '';

  if (aspects && aspects.length > 0) {
    html += '<h3 class="overlay-section-title">Aspects</h3>';
    var byType = {};
    aspects.forEach(function(a) {
      if (!byType[a.aspect_type]) byType[a.aspect_type] = [];
      byType[a.aspect_type].push(a);
    });
    Object.keys(byType).forEach(function(type) {
      html += '<div class="overlay-aspect-group"><strong>' + escapeHtml(type) + '</strong>';
      byType[type].forEach(function(a) {
        var label = a.title ? ' — ' + escapeHtml(a.title) : '';
        html += '<div class="overlay-aspect">' + label + '<pre>' + escapeHtml(JSON.stringify(a.content, null, 2)) + '</pre></div>';
      });
      html += '</div>';
    });
  }

  if (docs.length === 0) {
    html += '<p><em>No documents attached yet.</em></p>';
  } else {
    html += '<h3 class="overlay-section-title">Documents (' + docs.length + ')</h3>';
    docs.forEach(function(doc) {
      html +=
        '<div class="overlay-doc">' +
          '<h4 class="overlay-doc-title">' + escapeHtml(doc.title) +
            ' <span class="overlay-doc-date">' + doc.created_at.slice(0, 10) + '</span>' +
          '</h4>' +
          '<div class="overlay-doc-content">' + marked.parse(doc.content) + '</div>' +
        '</div>';
    });
  }

  container.innerHTML = html;
}

function closeOverlay() {
  document.getElementById('idea-overlay').hidden = true;
  document.body.style.overflow = '';
}

// ---- Controls ----

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.ideas-sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ideas-sort-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      renderGrid();
    });
  });

  document.getElementById('status-filter').addEventListener('change', function(e) {
    currentStatus = e.target.value;
    renderGrid();
  });

  var searchTimeout;
  document.getElementById('search-input').addEventListener('input', function(e) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
      currentSearch = e.target.value.trim();
      renderGrid();
    }, 200);
  });

  document.getElementById('overlay-close').addEventListener('click', closeOverlay);
  document.getElementById('overlay-backdrop').addEventListener('click', closeOverlay);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeOverlay();
  });

  loadIdeas();
});
