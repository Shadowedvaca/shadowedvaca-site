/* ============================================================
   ideas.js — Shadowedvaca Ideation Board
   Requires: marked.min.js loaded before this file
   ============================================================ */

var JWT_KEY = 'sv_site_jwt';
var API_BASE = '/api';

// ---- Mode ----

var currentMode = 'ideas';  // 'ideas' | 'projects'
var allProjects = [];
var projectsLoaded = false;

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
var reactions = {};   // keyed by idea_id string → {score, ups, downs, favorites, my_vote, my_favorite, voters?, favorited_by?}
var isAdmin = false;
var expandedTags = {};   // keyed by idea id string; true = expanded
var currentSort = 'votes';    // 'votes' | 'updated' | 'name'
var currentStatus = '';       // '' | status value | '__secret__'
var currentSearch = '';
var accessCache = {};  // keyed by idea_id string → array of {user_id, username, override}

async function loadIdeas() {
  var token = getToken();
  if (!token) {
    var next = encodeURIComponent(location.pathname);
    location.href = '/login.html?next=' + next;
    return;
  }

  var authHeaders = { 'Authorization': 'Bearer ' + token };

  try {
    // Fetch admin status and ideas in parallel
    var [meResp, ideasResp, reactResp] = await Promise.all([
      fetch(API_BASE + '/auth/me', { headers: authHeaders }),
      fetch(API_BASE + '/ideas?limit=200', { headers: authHeaders }),
      fetch(API_BASE + '/ideas/reactions', { headers: authHeaders }),
    ]);

    if (meResp.status === 401 || ideasResp.status === 401) {
      localStorage.removeItem(JWT_KEY);
      location.href = '/login.html';
      return;
    }

    if (meResp.ok) {
      var me = await meResp.json();
      isAdmin = me.isAdmin || false;
      if (isAdmin) {
        var select = document.getElementById('status-filter');
        var secretOpt = document.createElement('option');
        secretOpt.value = '__secret__';
        secretOpt.textContent = 'Secret';
        select.appendChild(secretOpt);
      }
    }

    if (!ideasResp.ok) throw new Error('HTTP ' + ideasResp.status);
    var data = await ideasResp.json();
    allIdeas = data.ideas || [];
    if (reactResp.ok) {
      var reactData = await reactResp.json();
      reactions = reactData.reactions || {};
    }
    renderGrid();
  } catch (e) {
    document.getElementById('idea-grid').innerHTML =
      '<p class="ideas-state-msg ideas-error">Failed to load ideas. ' + e.message + '</p>';
  }
}

// ---- Filtering & sorting ----

function getFiltered() {
  var ideas = allIdeas.slice();

  if (currentStatus === '__secret__') {
    ideas = ideas.filter(function(i) { return i.public === false; });
  } else if (currentStatus) {
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
  } else if (currentSort === 'updated') {
    ideas.sort(function(a, b) { return b.updated_at.localeCompare(a.updated_at); });
  } else {
    // Default: favorites desc → score desc → updated desc
    ideas.sort(function(a, b) {
      var ra = reactions[String(a.id)] || {};
      var rb = reactions[String(b.id)] || {};
      var favDiff = (rb.favorites || 0) - (ra.favorites || 0);
      if (favDiff !== 0) return favDiff;
      var scoreDiff = (rb.score || 0) - (ra.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return b.updated_at.localeCompare(a.updated_at);
    });
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

// ---- Reaction helpers ----

function getReaction(ideaId) {
  return reactions[String(ideaId)] || {
    score: 0, ups: 0, downs: 0, favorites: 0,
    my_vote: null, my_favorite: false
  };
}

function buildTooltip(r) {
  // Only called for admins — r.voters and r.favorited_by will be present
  var lines = [];
  if (r.voters && r.voters.length) {
    r.voters.forEach(function(v) {
      lines.push((v.vote === 1 ? '▲ ' : '▼ ') + v.username);
    });
  }
  if (r.favorited_by && r.favorited_by.length) {
    lines.push('★ ' + r.favorited_by.join(', '));
  }
  return lines.length ? lines.join('\n') : '';
}

async function sendVote(ideaId, voteValue) {
  // voteValue: 1, -1, or 0 (retract)
  var token = getToken();
  if (!token) return false;
  try {
    var resp;
    if (voteValue === 0) {
      resp = await fetch(API_BASE + '/ideas/' + ideaId + '/vote', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
    } else {
      resp = await fetch(API_BASE + '/ideas/' + ideaId + '/vote', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vote: voteValue }),
      });
    }
    return resp.ok;
  } catch (e) { return false; }
}

async function sendFavorite(ideaId, isFavoriting) {
  var token = getToken();
  if (!token) return false;
  try {
    var resp = await fetch(API_BASE + '/ideas/' + ideaId + '/favorite', {
      method: isFavoriting ? 'PUT' : 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    return resp.ok;
  } catch (e) { return false; }
}

async function handleReactionClick(ideaId, action, bar) {
  var r = reactions[String(ideaId)] || {
    score: 0, ups: 0, downs: 0, favorites: 0,
    my_vote: null, my_favorite: false
  };

  // Snapshot for rollback
  var prev = JSON.parse(JSON.stringify(r));

  // Optimistic update
  if (action === 'up') {
    if (r.my_vote === 1) {
      // retract
      r.my_vote = null; r.ups = Math.max(0, r.ups - 1); r.score -= 1;
    } else {
      if (r.my_vote === -1) { r.downs = Math.max(0, r.downs - 1); r.score += 1; }
      r.my_vote = 1; r.ups += 1; r.score += 1;
    }
  } else if (action === 'down') {
    if (r.my_vote === -1) {
      r.my_vote = null; r.downs = Math.max(0, r.downs - 1); r.score += 1;
    } else {
      if (r.my_vote === 1) { r.ups = Math.max(0, r.ups - 1); r.score -= 1; }
      r.my_vote = -1; r.downs += 1; r.score -= 1;
    }
  } else if (action === 'star') {
    if (r.my_favorite) {
      r.my_favorite = false; r.favorites = Math.max(0, r.favorites - 1);
    } else {
      r.my_favorite = true; r.favorites += 1;
    }
  }

  reactions[String(ideaId)] = r;
  updateReactionBar(bar, r);

  // Send to API
  var ok = false;
  if (action === 'up') {
    ok = await sendVote(ideaId, r.my_vote === null ? 0 : 1);
  } else if (action === 'down') {
    ok = await sendVote(ideaId, r.my_vote === null ? 0 : -1);
  } else if (action === 'star') {
    ok = await sendFavorite(ideaId, r.my_favorite);
  }

  if (!ok) {
    // Rollback
    reactions[String(ideaId)] = prev;
    updateReactionBar(bar, prev);
  } else {
    // Re-fetch reactions so the admin voter breakdown (tooltip) is up to date
    var token = getToken();
    if (token) {
      try {
        var refreshResp = await fetch(API_BASE + '/ideas/reactions', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (refreshResp.ok) {
          var refreshData = await refreshResp.json();
          reactions = refreshData.reactions || {};
          updateReactionBar(bar, getReaction(ideaId));
        }
      } catch (e) { /* stale data is fine */ }
    }
  }
}

function updateReactionBar(bar, r) {
  var upBtn   = bar.querySelector('[data-action="up"]');
  var downBtn = bar.querySelector('[data-action="down"]');
  var starBtn = bar.querySelector('[data-action="star"]');
  var scoreEl = bar.querySelector('.reaction-score');

  upBtn.classList.toggle('reaction-btn--active', r.my_vote === 1);
  downBtn.classList.toggle('reaction-btn--active', r.my_vote === -1);
  starBtn.classList.toggle('reaction-btn--active', !!r.my_favorite);
  starBtn.classList.toggle('reaction-btn--starred', !!r.my_favorite);

  upBtn.querySelector('.reaction-count').textContent   = r.ups || 0;
  downBtn.querySelector('.reaction-count').textContent = r.downs || 0;
  starBtn.querySelector('.reaction-count').textContent = r.favorites || 0;
  scoreEl.textContent = (r.score >= 0 ? '+' : '') + (r.score || 0);
  scoreEl.dataset.positive = (r.score > 0) ? 'true' : '';
  scoreEl.dataset.negative = (r.score < 0) ? 'true' : '';

  if (isAdmin) {
    var tooltip = buildTooltip(r);
    if (tooltip) scoreEl.setAttribute('title', tooltip);
    else scoreEl.removeAttribute('title');
  }
}

// ---- Access control panel (admin only) ----

async function loadAccessPanel(ideaId) {
  var token = getToken();
  if (!token) return;
  try {
    var resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    accessCache[String(ideaId)] = data.users;
    renderAccessPanel(ideaId);
  } catch (e) {
    var panel = document.getElementById('access-panel-' + ideaId);
    if (panel) {
      panel.querySelector('.idea-access-panel-inner').innerHTML =
        '<em class="idea-access-error">Failed to load.</em>';
    }
  }
}

function renderAccessPanel(ideaId) {
  var panel = document.getElementById('access-panel-' + ideaId);
  if (!panel) return;
  var inner = panel.querySelector('.idea-access-panel-inner');
  var users = accessCache[String(ideaId)];
  if (!users || users.length === 0) {
    inner.innerHTML = '<em class="idea-access-empty">No non-admin users.</em>';
    return;
  }
  var idea = allIdeas.find(function(i) { return String(i.id) === String(ideaId); });
  var ideaPublic = idea ? !!idea.public : false;

  var html = '';
  users.forEach(function(u) {
    var effective = (u.override !== null && u.override !== undefined)
      ? u.override
      : ideaPublic;
    var hasOverride = (u.override !== null && u.override !== undefined);
    var indicatorHtml = hasOverride
      ? ' <span class="idea-access-override-dot" title="manually overridden">●</span>'
      : '';
    html +=
      '<label class="idea-access-row">' +
        '<input type="checkbox"' +
          ' class="idea-access-checkbox"' +
          ' data-idea-id="' + ideaId + '"' +
          ' data-user-id="' + u.user_id + '"' +
          (effective ? ' checked' : '') +
        '>' +
        '<span class="idea-access-username">' + escapeHtml(u.username) + indicatorHtml + '</span>' +
      '</label>';
  });
  inner.innerHTML = html;

  inner.querySelectorAll('.idea-access-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function() {
      handleAccessChange(
        parseInt(cb.dataset.ideaId),
        parseInt(cb.dataset.userId),
        cb.checked,
        cb
      );
    });
  });
}

async function handleAccessChange(ideaId, userId, checked, checkbox) {
  var token = getToken();
  if (!token) return;

  var idea = allIdeas.find(function(i) { return i.id === ideaId; });
  var ideaPublic = idea ? !!idea.public : false;
  var isDefault = (checked === ideaPublic);

  checkbox.disabled = true;

  try {
    var resp;
    if (isDefault) {
      resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access/' + userId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } else {
      resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access/' + userId, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ can_view: checked })
      });
    }

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    var users = accessCache[String(ideaId)];
    if (users) {
      var u = users.find(function(x) { return x.user_id === userId; });
      if (u) u.override = isDefault ? null : checked;
    }
    renderAccessPanel(ideaId);

  } catch (e) {
    checkbox.checked = !checked;
    checkbox.disabled = false;
  }
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
    var secretBadge = (isAdmin && idea.public === false)
      ? '<span class="idea-badge idea-badge--secret">Secret</span>' : '';
    var docCount = idea.document_count || 0;
    var artifactCount = idea.artifact_count || 0;
    var countsParts = [];
    if (docCount > 0) countsParts.push(docCount + ' doc' + (docCount !== 1 ? 's' : ''));
    if (artifactCount > 0) countsParts.push(artifactCount + ' artifact' + (artifactCount !== 1 ? 's' : ''));
    var countsText = countsParts.length > 0
      ? '<span class="idea-card-counts">' + countsParts.join(' · ') + '</span>'
      : '';
    var tags = (idea.tags || []).map(function(t) {
      return '<span class="idea-tag">' + escapeHtml(t) + '</span>';
    }).join('');

    var r = getReaction(idea.id);
    var upActive   = r.my_vote === 1  ? ' reaction-btn--active' : '';
    var downActive = r.my_vote === -1 ? ' reaction-btn--active' : '';
    var starActive = r.my_favorite    ? ' reaction-btn--active reaction-btn--starred' : '';
    var tooltip    = isAdmin ? buildTooltip(r) : '';
    var scoreTitle = tooltip ? ' title="' + escapeHtml(tooltip) + '"' : '';

    return (
      '<div class="idea-card" data-id="' + idea.id + '">' +
        '<div class="idea-card-header">' +
          '<span class="idea-status-dot" style="background:' + color + '" title="' + idea.status + '"></span>' +
          '<h2 class="idea-card-title">' + escapeHtml(idea.title) + '</h2>' +
        '</div>' +
        (secretBadge || updatedBadge || countsText
          ? '<div class="idea-card-badges">' + secretBadge + updatedBadge + countsText + '</div>'
          : '') +
        '<p class="idea-card-pitch">' + escapeHtml(idea.elevator_pitch) + '</p>' +
        (tags
          ? '<div class="idea-card-tags" id="tags-' + idea.id + '">' + tags + '</div>' +
            '<button class="tags-toggle" style="display:none" data-id="' + idea.id + '" aria-label="expand tags">▾</button>'
          : '') +
        '<p class="idea-card-meta">' + escapeHtml(idea.status) + ' · updated ' + daysAgo(idea.updated_at) + '</p>' +
        (isAdmin
          ? '<button class="idea-access-toggle" data-idea-id="' + idea.id + '" aria-expanded="false">Access ▾</button>' +
            '<div class="idea-access-panel" id="access-panel-' + idea.id + '" hidden>' +
              '<div class="idea-access-panel-inner"><em class="idea-access-loading">Loading...</em></div>' +
            '</div>'
          : '') +
        '<div class="idea-card-reactions" data-idea-id="' + idea.id + '">' +
          '<button class="reaction-btn reaction-btn--up' + upActive + '" data-action="up" title="Thumbs up">▲ <span class="reaction-count">' + (r.ups || 0) + '</span></button>' +
          '<button class="reaction-btn reaction-btn--down' + downActive + '" data-action="down" title="Thumbs down">▼ <span class="reaction-count">' + (r.downs || 0) + '</span></button>' +
          '<span class="reaction-score"' + scoreTitle + '>' + (r.score >= 0 ? '+' : '') + (r.score || 0) + '</span>' +
          '<button class="reaction-btn reaction-btn--star' + starActive + '" data-action="star" title="Favorite">★ <span class="reaction-count">' + (r.favorites || 0) + '</span></button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  grid.innerHTML = html;

  grid.querySelectorAll('.idea-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      // Don't open overlay when clicking reaction buttons
      if (e.target.closest('.idea-card-reactions')) return;
      if (e.target.closest('.tags-toggle')) return;
      if (e.target.closest('.idea-access-panel')) return;
      if (e.target.closest('.idea-access-toggle')) return;
      openOverlay(parseInt(card.dataset.id));
    });
  });

  grid.querySelectorAll('.idea-card-reactions').forEach(function(bar) {
    var ideaId = parseInt(bar.dataset.ideaId);

    bar.querySelectorAll('.reaction-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleReactionClick(ideaId, btn.dataset.action, bar);
      });
    });
  });

  grid.querySelectorAll('.idea-access-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var ideaId = btn.dataset.ideaId;
      var panel = document.getElementById('access-panel-' + ideaId);
      var isOpen = !panel.hidden;
      panel.hidden = isOpen;
      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      btn.textContent = isOpen ? 'Access ▾' : 'Access ▴';
      if (!isOpen) {
        if (accessCache[ideaId]) {
          renderAccessPanel(ideaId);
        } else {
          loadAccessPanel(ideaId);
        }
      }
    });
  });

  // Tags collapse: show toggle only when tags genuinely wrap to a second line.
  // Temporarily lift max-height so offsetHeight reflects natural content height,
  // then compare against a single tag's height to detect real wrapping.
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      grid.querySelectorAll('.idea-card-tags').forEach(function(el) {
        var id = el.id.replace('tags-', '');
        var btn = el.parentElement.querySelector('.tags-toggle[data-id="' + id + '"]');
        if (!btn) return;
        if (expandedTags[id]) {
          el.classList.add('tags-expanded');
          btn.textContent = '↑';
          btn.style.display = '';
          return;
        }
        var firstTag = el.querySelector('.idea-tag');
        if (!firstTag) { btn.style.display = 'none'; return; }
        var lineH = firstTag.offsetHeight;
        el.style.maxHeight = 'none';
        var fullH = el.offsetHeight;
        el.style.maxHeight = '';
        btn.style.display = fullH <= lineH + 4 ? 'none' : '';
      });
    });
  });
}

// ---- Projects ----

var PROJECT_TYPE_COLORS = {
  'product':   '#00d4ff',
  'feature':   '#2ecc71',
  'research':  '#a78bfa',
  'tool':      '#f0a030',
  'website':   '#00d4ff',
  'game':      '#2ecc71',
};

var PHASE_STATUS_COLORS = {
  'complete':    '#2ecc71',
  'in_progress': '#f0a030',
  'planned':     '#6b7280',
};

async function loadProjects() {
  var token = getToken();
  if (!token) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  try {
    var resp = await fetch(API_BASE + '/projects', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (resp.status === 401) {
      localStorage.removeItem(JWT_KEY);
      location.href = '/login.html';
      return;
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    allProjects = data.projects || [];
    projectsLoaded = true;
    renderProjectGrid();
  } catch (e) {
    document.getElementById('idea-grid').innerHTML =
      '<p class="ideas-state-msg ideas-error">Failed to load projects. ' + e.message + '</p>';
  }
}

function getFilteredProjects() {
  var projects = allProjects.slice();
  if (currentSearch) {
    var q = currentSearch.toLowerCase();
    projects = projects.filter(function(p) {
      return (p.name + ' ' + (p.type || '')).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (currentSort === 'name') {
    projects.sort(function(a, b) { return a.name.localeCompare(b.name); });
  } else {
    projects.sort(function(a, b) {
      var da = a.updated_at || '';
      var db = b.updated_at || '';
      return db.localeCompare(da);
    });
  }
  return projects;
}

function renderProjectGrid() {
  var grid = document.getElementById('idea-grid');
  var projects = getFilteredProjects();

  if (projects.length === 0) {
    grid.innerHTML = '<p class="ideas-state-msg">No projects match your filters.</p>';
    return;
  }

  var html = projects.map(function(proj) {
    var type = proj.type || 'project';
    var color = PROJECT_TYPE_COLORS[type] || '#c8cdd3';
    var updatedBadge = proj.updated_at && isRecentlyUpdated(proj.updated_at)
      ? '<span class="idea-badge idea-badge--updated">Updated</span>' : '';
    var typeBadge = '<span class="idea-badge idea-badge--type">' + escapeHtml(type) + '</span>';

    return (
      '<div class="idea-card" data-project-name="' + escapeHtml(proj.name) + '">' +
        '<div class="idea-card-header">' +
          '<span class="idea-status-dot" style="background:' + color + '"></span>' +
          '<h2 class="idea-card-title">' + escapeHtml(proj.name) + '</h2>' +
        '</div>' +
        '<div class="idea-card-badges">' + typeBadge + updatedBadge + '</div>' +
        '<p class="idea-card-meta">' +
          (proj.updated_at ? 'updated ' + daysAgo(proj.updated_at) : 'active') +
        '</p>' +
      '</div>'
    );
  }).join('');

  grid.innerHTML = html;

  grid.querySelectorAll('.idea-card[data-project-name]').forEach(function(card) {
    card.addEventListener('click', function() {
      openProjectOverlay(card.dataset.projectName);
    });
  });
}

async function openProjectOverlay(projectName) {
  var proj = allProjects.find(function(p) { return p.name === projectName; });
  if (!proj) return;

  var overlay = document.getElementById('idea-overlay');
  var content = document.getElementById('overlay-content');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  var type = proj.type || 'project';
  var color = PROJECT_TYPE_COLORS[type] || '#c8cdd3';

  content.innerHTML =
    '<h2 class="overlay-title">' + escapeHtml(proj.name) + '</h2>' +
    '<div class="overlay-meta">' +
      '<span class="idea-status-dot" style="background:' + color + '"></span>' +
      ' ' + escapeHtml(type) +
      (proj.updated_at ? ' · updated ' + daysAgo(proj.updated_at) : '') +
    '</div>' +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Documents</div>' +
      '<div id="project-overlay-docs"><em class="overlay-loading">Loading...</em></div>' +
    '</div>' +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Phases</div>' +
      '<div id="project-overlay-phases"><em class="overlay-loading">Loading...</em></div>' +
    '</div>';

  var token = getToken();
  if (!token) return;

  var encoded = encodeURIComponent(projectName);
  try {
    var [docsResp, phasesResp] = await Promise.all([
      fetch(API_BASE + '/projects/' + encoded + '/documents', {
        headers: { 'Authorization': 'Bearer ' + token }
      }),
      fetch(API_BASE + '/projects/' + encoded + '/phases', {
        headers: { 'Authorization': 'Bearer ' + token }
      }),
    ]);

    var docs   = docsResp.ok   ? ((await docsResp.json()).documents   || []) : [];
    var phases = phasesResp.ok ? ((await phasesResp.json()).phases     || []) : [];

    renderProjectDocs(docs);
    renderProjectPhases(phases);
  } catch (e) {
    var docsEl = document.getElementById('project-overlay-docs');
    if (docsEl) docsEl.innerHTML = '<em class="overlay-error">Could not load details.</em>';
    var phasesEl = document.getElementById('project-overlay-phases');
    if (phasesEl) phasesEl.innerHTML = '';
  }
}

function renderProjectDocs(docs) {
  var el = document.getElementById('project-overlay-docs');
  if (!el) return;
  if (docs.length === 0) {
    el.innerHTML = '<em class="overlay-empty">No documents yet.</em>';
    return;
  }
  var html = docs.map(function(doc) {
    var meta = [];
    if (doc.doc_class) meta.push(escapeHtml(doc.doc_class));
    if (doc.version)   meta.push('v' + escapeHtml(doc.version));
    return (
      '<div class="overlay-link-row">' +
        '<span class="overlay-link">' + escapeHtml(doc.title) + '</span>' +
        (meta.length ? '<span class="overlay-link-meta">' + meta.join(' · ') + '</span>' : '') +
      '</div>'
    );
  }).join('');
  el.innerHTML = html;
}

function renderProjectPhases(phases) {
  var el = document.getElementById('project-overlay-phases');
  if (!el) return;
  if (phases.length === 0) {
    el.innerHTML = '<em class="overlay-empty">No phases defined.</em>';
    return;
  }
  var html = phases.map(function(phase) {
    var color = PHASE_STATUS_COLORS[phase.status] || '#6b7280';
    var meta = [escapeHtml(phase.status)];
    if (phase.version)      meta.push('v' + escapeHtml(phase.version));
    if (phase.completed_at) meta.push('done ' + phase.completed_at.slice(0, 10));
    return (
      '<div class="project-phase-row">' +
        '<span class="idea-status-dot" style="background:' + color + ';flex-shrink:0"></span>' +
        '<span class="project-phase-name">' +
          escapeHtml(phase.phase_number + '. ' + phase.phase_name) +
        '</span>' +
        '<span class="overlay-link-meta">' + meta.join(' · ') + '</span>' +
      '</div>'
    );
  }).join('');
  el.innerHTML = html;
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
  var allTags = (idea.tags || []).map(function(t) {
    return '<span class="idea-tag">' + escapeHtml(t) + '</span>';
  }).join('');

  content.innerHTML =
    '<h2 class="overlay-title">' + escapeHtml(idea.title) + '</h2>' +
    '<div class="overlay-meta">' +
      '<span class="idea-status-dot" style="background:' + color + '"></span>' +
      ' ' + escapeHtml(idea.status) +
      (idea.project ? ' · <em>' + escapeHtml(idea.project) + '</em>' : '') +
    '</div>' +
    '<div class="overlay-pitch">' + escapeHtml(idea.elevator_pitch) + '</div>' +
    (allTags ? '<div class="overlay-tags">' + allTags + '</div>' : '') +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Documents</div>' +
      '<div id="overlay-docs-list"><em class="overlay-loading">Loading...</em></div>' +
    '</div>' +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Artifacts</div>' +
      '<div id="overlay-artifacts-list"><em class="overlay-loading">Loading...</em></div>' +
    '</div>';

  var token = getToken();
  if (!token) return;

  try {
    var authHeaders = { 'Authorization': 'Bearer ' + token };
    var [ideaResp, artResp] = await Promise.all([
      fetch(API_BASE + '/ideas/' + ideaId, { headers: authHeaders }),
      fetch(API_BASE + '/ideas/' + ideaId + '/artifacts', { headers: authHeaders }),
    ]);
    if (!ideaResp.ok) throw new Error('HTTP ' + ideaResp.status);
    var data = await ideaResp.json();
    var artData = artResp.ok ? await artResp.json() : {};
    renderOverlayLinks(ideaId, data.documents || [], artData.artifacts || []);
  } catch (e) {
    var docsEl = document.getElementById('overlay-docs-list');
    if (docsEl) docsEl.innerHTML = '<em class="overlay-error">Could not load details.</em>';
    var artEl = document.getElementById('overlay-artifacts-list');
    if (artEl) artEl.innerHTML = '';
  }
}

function renderOverlayLinks(ideaId, docs, artifacts) {
  renderLinkSection(
    'overlay-docs-list',
    docs,
    function(doc) {
      return '/ideas/viewer/?idea_id=' + ideaId + '&doc_id=' + doc.id;
    },
    function(doc) {
      return escapeHtml(doc.title) +
        ' <span class="overlay-link-meta">' + doc.created_at.slice(0, 10) + '</span>';
    },
    'No documents attached yet.'
  );

  renderLinkSection(
    'overlay-artifacts-list',
    artifacts,
    function(art) {
      return '/ideas/viewer/?idea_id=' + ideaId + '&artifact_id=' + art.id;
    },
    function(art) {
      return escapeHtml(art.title) +
        ' <span class="overlay-link-meta">' +
        escapeHtml(art.artifact_type) + ' · ' + escapeHtml(art.format) +
        '</span>';
    },
    'No artifacts attached yet.'
  );
}

function renderLinkSection(containerId, items, hrefFn, labelFn, emptyMsg) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<em class="overlay-empty">' + emptyMsg + '</em>';
    return;
  }

  var html = '';
  items.forEach(function(item) {
    html +=
      '<div class="overlay-link-row">' +
        '<a href="' + hrefFn(item) + '" target="_blank" rel="noopener" class="overlay-link">' +
          labelFn(item) +
        '</a>' +
      '</div>';
  });
  el.innerHTML = html;
}

function closeOverlay() {
  document.getElementById('idea-overlay').hidden = true;
  document.body.style.overflow = '';
}

// ---- Controls ----

document.addEventListener('DOMContentLoaded', function() {
  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.dataset.mode;
      if (mode === currentMode) return;
      currentMode = mode;

      document.querySelectorAll('.mode-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.mode === mode);
      });

      var subtitle = document.querySelector('.ideas-subtitle');
      if (subtitle) {
        subtitle.textContent = mode === 'ideas'
          ? 'Live ideas — spark to ship'
          : 'Active projects — shipping';
      }

      var statusFilter = document.getElementById('status-filter');
      var sortVotes = document.getElementById('sort-votes');
      var searchInput = document.getElementById('search-input');
      if (statusFilter) statusFilter.style.display = mode === 'ideas' ? '' : 'none';
      if (sortVotes) sortVotes.style.display = mode === 'ideas' ? '' : 'none';
      if (searchInput) {
        searchInput.placeholder = mode === 'ideas' ? 'Search ideas...' : 'Search projects...';
      }

      if (mode === 'projects' && currentSort === 'votes') {
        document.querySelectorAll('.ideas-sort-btn').forEach(function(b) {
          b.classList.remove('active');
          if (b.dataset.sort === 'updated') b.classList.add('active');
        });
        currentSort = 'updated';
      }

      if (mode === 'projects') {
        if (!projectsLoaded) {
          document.getElementById('idea-grid').innerHTML =
            '<div class="ideas-state-msg">Loading...</div>';
          loadProjects();
        } else {
          renderProjectGrid();
        }
      } else {
        renderGrid();
      }
    });
  });

  document.querySelectorAll('.ideas-sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ideas-sort-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      if (currentMode === 'projects') {
        renderProjectGrid();
      } else {
        renderGrid();
      }
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
      if (currentMode === 'projects') {
        renderProjectGrid();
      } else {
        renderGrid();
      }
    }, 200);
  });

  // Tags expand/collapse — delegated on grid so it survives re-renders
  document.getElementById('idea-grid').addEventListener('click', function(e) {
    var btn = e.target.closest('.tags-toggle');
    if (!btn) return;
    e.stopPropagation();
    var id = btn.dataset.id;
    expandedTags[id] = !expandedTags[id];
    var tagsEl = document.getElementById('tags-' + id);
    if (tagsEl) tagsEl.classList.toggle('tags-expanded', !!expandedTags[id]);
    btn.textContent = expandedTags[id] ? '↑' : '▾';
  });

  document.getElementById('overlay-close').addEventListener('click', closeOverlay);
  document.getElementById('overlay-backdrop').addEventListener('click', closeOverlay);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeOverlay();
  });

  loadIdeas();
});
