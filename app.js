const state = {
  registry: null,
  capabilities: [],
  nodes: [],
  dataProducts: [],
  tasks: [],
  plan: null,
  job: null,
  animationTimers: [],
  activeTab: 'task-list',
  routeReady: false,
};

const el = (id) => document.getElementById(id);

const refs = {
  apiStatus: el('apiStatus'),
  apiStatusText: el('apiStatusText'),
  runDemoBtn: el('runDemoBtn'),
  omniInput: el('omniInput'),
  omniRunBtn: el('omniRunBtn'),
  runMissionSecondary: el('runMissionSecondary'),
  refreshBtn: el('refreshBtn'),
  capabilityCount: el('capabilityCount'),
  nodeCount: el('nodeCount'),
  skillCount: el('skillCount'),
  jobStatus: el('jobStatus'),
  adminTaskCount: el('adminTaskCount'),
  adminCapabilityCount: el('adminCapabilityCount'),
  adminNodeCount: el('adminNodeCount'),
  registrySummary: el('registrySummary'),
  searchInput: el('searchInput'),
  typeFilter: el('typeFilter'),
  regionFilter: el('regionFilter'),
  capabilityGrid: el('capabilityGrid'),
  dataProductGrid: el('dataProductGrid'),
  taskList: el('taskList'),
  taskTitle: el('taskTitle'),
  taskDetail: el('taskDetail'),
  capabilityTitle: el('capabilityTitle'),
  capabilityDetail: el('capabilityDetail'),
  missionInput: el('missionInput'),
  routeCard: el('routeCard'),
  progressBar: el('progressBar'),
  timeline: el('timeline'),
  graphStage: el('graphStage'),
  kgStage: el('kgStage'),
  graphFocus: el('graphFocus'),
  apiRequest: el('apiRequest'),
  apiResponse: el('apiResponse'),
  taskForm: el('taskForm'),
  capabilityForm: el('capabilityForm'),
  dataProductForm: el('dataProductForm'),
  geomcpDiscoverBtn: el('geomcpDiscoverBtn'),
  runtimeUrl: el('runtimeUrl'),
  runtimeRegion: el('runtimeRegion'),
  runtimeRunBtn: el('runtimeRunBtn'),
  runtimeResult: el('runtimeResult'),
  detailTabs: () => Array.from(document.querySelectorAll('.detail-tab')),
  detailPanels: () => Array.from(document.querySelectorAll('.detail-panel')),
  productLinks: () => Array.from(document.querySelectorAll('[data-route]')),
};

refs.missionInput.value = 'Assess flood impact for the Mekong Delta for the last 14 days and estimate crop loss.';

function typeLabel(type) {
  return type.replace('Geo', '').replace('Capability', '');
}

function apiPath(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') url.searchParams.set(key, value);
  });
  return url;
}

async function apiGet(path, params = {}) {
  const url = apiPath(path, params);
  refs.apiRequest.textContent = `GET ${url.pathname}${url.search}`;
  const response = await fetch(url);
  const data = await response.json();
  refs.apiResponse.textContent = JSON.stringify(data, null, 2);
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body = {}) {
  const url = apiPath(path);
  refs.apiRequest.textContent = `POST ${url.pathname}\n${JSON.stringify(body, null, 2)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  refs.apiResponse.textContent = JSON.stringify(data, null, 2);
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPut(path, body = {}) {
  const url = apiPath(path);
  refs.apiRequest.textContent = `PUT ${url.pathname}\n${JSON.stringify(body, null, 2)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  refs.apiResponse.textContent = JSON.stringify(data, null, 2);
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setStatus(ok, text) {
  refs.apiStatus.classList.toggle('is-live', ok);
  refs.apiStatusText.textContent = text;
}

function clearTimers() {
  state.animationTimers.forEach((timer) => window.clearTimeout(timer));
  state.animationTimers = [];
}

function setActiveTab(tab) {
  state.activeTab = tab;
  refs.detailTabs().forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  refs.detailPanels().forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
}

function navigate(path) {
  window.history.pushState({}, '', path);
  applyRoute();
}

function markProductNav(pathname) {
  refs.productLinks().forEach((link) => {
    const route = link.dataset.route;
    const active = route === '/' ? pathname === '/' : pathname.startsWith(route);
    link.classList.toggle('active', active);
  });
}

function setRouteMode(mode) {
  document.body.dataset.routeMode = mode;
}

function renderSummary(summary) {
  refs.capabilityCount.textContent = summary.total;
  refs.nodeCount.textContent = summary.nodeCount;
  refs.skillCount.textContent = summary.skillCount;
  refs.adminCapabilityCount.textContent = summary.total;
  refs.adminNodeCount.textContent = summary.nodeCount;
  refs.registrySummary.innerHTML = [
    `Filtered ${summary.filtered}`,
    `Nodes ${summary.nodeCount}`,
    `Skills ${summary.skillCount}`,
    `Data products ${summary.dataProductCount || 0}`,
  ].map((item) => `<span class="chip">${item}</span>`).join('');
}

function renderTypeOptions(capabilities) {
  const types = ['all', ...new Set(capabilities.map((item) => item.type))];
  refs.typeFilter.innerHTML = types.map((type) => `<option value="${type}">${type === 'all' ? 'All types' : typeLabel(type)}</option>`).join('');
}

function renderCapabilities(capabilities) {
  refs.capabilityGrid.innerHTML = capabilities.map((capability, index) => `
    <article class="capability-card panel-fade" style="animation-delay:${index * 40}ms">
      <header>
        <div>
          <span class="mini-pill">${typeLabel(capability.type)}</span>
          <h3>${capability.name}</h3>
        </div>
        <span class="status-text">${capability.status}</span>
      </header>
      <p>${capability.description}</p>
      <div class="cap-meta">
        <span>${capability.nodeId}</span>
        <span>${capability.trustLevel}</span>
        <span>${capability.latencyClass}</span>
      </div>
      <div class="chip-row">
        ${(capability.tags || []).slice(0, 4).map((tag) => `<span class="chip">${tag}</span>`).join('')}
      </div>
      <button class="button secondary capability-action" data-capability-id="${capability.id}" type="button">Inspect</button>
    </article>
  `).join('');

  refs.capabilityGrid.querySelectorAll('[data-capability-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(`/capabilities/${button.dataset.capabilityId}`));
  });
}

function renderDataProducts(products) {
  if (!refs.dataProductGrid) return;
  refs.dataProductGrid.innerHTML = products.map((product, index) => {
    const card = product.geoCard || product;
    return `
      <article class="capability-card geocard panel-fade" style="animation-delay:${index * 40}ms">
        <header>
          <div>
            <span class="mini-pill">GeoCard</span>
            <h3>${card.title || card.name}</h3>
          </div>
          <span class="status-text">${card.status}</span>
        </header>
        <p>${card.description}</p>
        <div class="detail-pairs compact-pairs">
          <div><strong>Provider</strong><span>${card.provider}</span></div>
          <div><strong>Node</strong><span>${card.nodeId}</span></div>
          <div><strong>Region</strong><span>${card.region}</span></div>
          <div><strong>Kind</strong><span>${card.kind || card.geometryType || 'data_product'}</span></div>
        </div>
        <div class="chip-row">
          ${(card.tags || []).slice(0, 5).map((tag) => `<span class="chip">${tag}</span>`).join('')}
        </div>
        <div class="cap-meta">
          <span>${card.policy?.id || product.policyId}</span>
          <span>raw export: ${card.policy?.rawDataExport ? 'yes' : 'no'}</span>
        </div>
        <button class="button secondary geocard-action" data-geocard-id="${card.id}" type="button">Inspect GeoCard</button>
      </article>
    `;
  }).join('');

  refs.dataProductGrid.querySelectorAll('[data-geocard-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const payload = await apiGet(`/api/geocards/${encodeURIComponent(button.dataset.geocardId)}`);
      refs.capabilityTitle.textContent = payload.geoCard.title;
      refs.capabilityDetail.classList.remove('empty-state');
      refs.capabilityDetail.innerHTML = `<pre class="code-card"><code>${JSON.stringify(payload.geoCard, null, 2)}</code></pre>`;
      setActiveTab('capability-detail');
    });
  });
}

function renderTaskList(tasks) {
  refs.adminTaskCount.textContent = tasks.length;
  refs.taskList.innerHTML = tasks.map((task) => `
    <article class="task-row" data-task-id="${task.id}">
      <div>
        <span class="mini-pill">${task.region}</span>
        <h3>${task.title}</h3>
        <p>${task.mission}</p>
      </div>
      <div class="task-side">
        <span>${task.hazard}</span>
        <span>${task.status}</span>
      </div>
    </article>
  `).join('');

  refs.taskList.querySelectorAll('[data-task-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(`/tasks/${button.dataset.taskId}`));
  });
}

function renderTaskDetail(task) {
  refs.taskTitle.textContent = task.title;
  refs.taskDetail.classList.remove('empty-state');
  refs.taskDetail.innerHTML = `
    <div class="detail-grid-two">
      <div>
        <span class="mini-pill">${task.region}</span>
        <p>${task.mission}</p>
        <div class="detail-pairs">
          <div><strong>Hazard</strong><span>${task.hazard}</span></div>
          <div><strong>Requested by</strong><span>${task.requestedBy}</span></div>
          <div><strong>Node</strong><span>${task.nodeId}</span></div>
          <div><strong>Policy</strong><span>${task.policyId}</span></div>
        </div>
      </div>
      <div>
        <strong>Capabilities</strong>
        <div class="chip-row">${task.capabilities.map((item) => `<span class="chip">${item}</span>`).join('')}</div>
        <strong>Outputs</strong>
        <div class="chip-row">${task.outputs.map((item) => `<span class="chip">${item}</span>`).join('')}</div>
      </div>
    </div>
  `;
}

function renderCapabilityDetail(capability) {
  refs.capabilityTitle.textContent = capability.name;
  refs.capabilityDetail.classList.remove('empty-state');
  refs.capabilityDetail.innerHTML = `
    <div class="detail-grid-two">
      <div>
        <span class="mini-pill">${typeLabel(capability.type)}</span>
        <p>${capability.description}</p>
        <div class="detail-pairs">
          <div><strong>Provider</strong><span>${capability.provider}</span></div>
          <div><strong>Node</strong><span>${capability.nodeId}</span></div>
          <div><strong>Trust</strong><span>${capability.trustLevel}</span></div>
          <div><strong>Latency</strong><span>${capability.latencyClass}</span></div>
        </div>
      </div>
      <div>
        <strong>Inputs</strong>
        <div class="chip-row">${capability.inputs.map((item) => `<span class="chip">${item}</span>`).join('')}</div>
        <strong>Outputs</strong>
        <div class="chip-row">${capability.outputs.map((item) => `<span class="chip">${item}</span>`).join('')}</div>
        <strong>Relations</strong>
        <div class="chip-row">${(capability.dependencies || []).map((item) => `<span class="chip">${item}</span>`).join('') || '<span class="chip">none</span>'}</div>
      </div>
    </div>
  `;
}

function renderRoute(plan) {
  const { skill, agent, node, policy, data } = plan.selected;
  refs.routeCard.innerHTML = `
    <strong>Route selected</strong>
    <div>GeoAgent: ${agent?.name || 'none'}</div>
    <div>GeoSkill: ${skill.name}</div>
    <div>GeoNode: ${node.name}</div>
    <div>GeoPolicy: ${policy.name}</div>
    <div>Data dependencies: ${data.map((item) => item.name).join(', ')}</div>
  `;
}

function renderTimeline(plan, job) {
  const checkpoints = job?.checkpoints || plan.steps.map((step) => ({ step: step.label, status: 'pending', note: '' }));
  refs.timeline.innerHTML = checkpoints.map((item) => `
    <li class="${item.status === 'done' ? 'done' : item.status === 'running' ? 'running' : ''}">
      <div>
        <strong>${item.step}</strong>
        <span>${item.note || 'Waiting'}</span>
      </div>
      <div class="step-state">${item.status}</div>
    </li>
  `).join('');
  refs.progressBar.style.width = `${job?.progress || 0}%`;
  refs.jobStatus.textContent = job?.status || 'idle';
}

function renderGraph(graph, target = refs.graphStage) {
  target.innerHTML = `
    <svg viewBox="0 0 100 100" role="img" aria-label="GeoKG network graph">
      ${graph.links.map((link) => {
        const from = graph.nodes.find((node) => node.id === link.from);
        const to = graph.nodes.find((node) => node.id === link.to);
        if (!from || !to) return '';
        return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="graph-link"></line>`;
      }).join('')}
      ${graph.nodes.map((node) => `
        <g class="graph-node ${node.focus ? 'focus' : ''}" data-node-id="${node.id}">
          <circle cx="${node.x}" cy="${node.y}" r="${node.focus ? 4.8 : 3.6}"></circle>
          <text x="${node.x}" y="${node.y - 6}">${node.label}</text>
        </g>
      `).join('')}
    </svg>
  `;
}

function populateDetails(data) {
  const task = data.tasks.find((item) => item.id === 'task.mekong-flood-01') || data.tasks[0];
  const capability = data.capabilities.find((item) => item.id === 'skill.flood-impact-analysis') || data.capabilities[0];
  renderTaskDetail(task);
  renderCapabilityDetail(capability);
}

async function inspectCapability(id) {
  clearTimers();
  const { capability } = await apiGet(`/api/capabilities/${encodeURIComponent(id)}`);
  renderCapabilityDetail(capability);
  state.activeTab = 'capability-detail';
  setActiveTab('capability-detail');
  renderGraph(await apiGet('/api/kg', { focus: id }), refs.kgStage);
  refs.apiRequest.textContent = `GET /api/capabilities/${id}`;
}

async function inspectTask(id) {
  const { task } = await apiGet(`/api/tasks/${encodeURIComponent(id)}`);
  renderTaskDetail(task);
  state.activeTab = 'task-detail';
  setActiveTab('task-detail');
}

async function applyRoute() {
  if (!state.routeReady) return;
  const pathname = window.location.pathname;
  markProductNav(pathname);
  if (pathname === '/' || pathname === '/overview') {
    setRouteMode('overview');
    setActiveTab('task-list');
    return;
  }
  if (pathname === '/tasks') {
    setRouteMode('detail');
    setActiveTab('task-list');
    return;
  }
  if (pathname.startsWith('/tasks/')) {
    setRouteMode('detail');
    const id = decodeURIComponent(pathname.split('/').pop());
    await inspectTask(id);
    return;
  }
  if (pathname === '/capabilities') {
    setRouteMode('detail');
    setActiveTab('capability-detail');
    return;
  }
  if (pathname === '/data-products') {
    setRouteMode('detail');
    setActiveTab('data-products-detail');
    return;
  }
  if (pathname.startsWith('/capabilities/')) {
    setRouteMode('detail');
    const id = decodeURIComponent(pathname.split('/').pop());
    await inspectCapability(id);
    return;
  }
  if (pathname === '/graph') {
    setRouteMode('detail');
    setActiveTab('graph-detail');
    return;
  }
  if (pathname === '/admin') {
    setRouteMode('admin');
    setActiveTab('admin-detail');
    return;
  }
  if (pathname === '/runtime') {
    setRouteMode('detail');
    setActiveTab('runtime-detail');
    return;
  }
}

async function loadRegistry() {
  setStatus(false, 'Loading GeoCapability Registry…');
  const data = await apiGet('/api/registry', {
    query: refs.searchInput.value,
    type: refs.typeFilter.value,
    region: refs.regionFilter.value,
  });
  state.registry = data;
  state.capabilities = data.capabilities;
  state.nodes = data.nodes;
  state.dataProducts = data.dataProducts || [];
  renderTypeOptions(data.capabilities);
  renderSummary(data.summary);
  renderCapabilities(data.capabilities);
  renderDataProducts(state.dataProducts);
  renderGraph(await apiGet('/api/kg', { focus: 'skill.flood-impact-analysis' }), refs.kgStage);
  setStatus(true, 'GeoMCP gateway online');
}

async function loadTasks() {
  const data = await apiGet('/api/tasks');
  state.tasks = data.tasks;
  renderTaskList(data.tasks);
  populateDetails(data);
}

function csvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function submitTask(event) {
  event.preventDefault();
  const form = new FormData(refs.taskForm);
  const task = await apiPost('/api/tasks', {
    title: form.get('title'),
    region: form.get('region'),
    hazard: form.get('hazard'),
    mission: form.get('mission'),
    requestedBy: 'GeoNexus Admin',
    capabilities: csvList(form.get('capabilities')),
    outputs: ['derived_map', 'risk_summary', 'report'],
    nodeId: 'node.policy',
    policyId: 'policy.data-sovereignty-global',
  });
  await loadTasks();
  navigate(`/tasks/${task.task.id}`);
}

async function submitCapability(event) {
  event.preventDefault();
  const form = new FormData(refs.capabilityForm);
  const capability = await apiPost('/api/capabilities', {
    name: form.get('name'),
    type: form.get('type'),
    provider: form.get('provider'),
    nodeId: form.get('nodeId'),
    description: form.get('description'),
    regions: ['Global'],
    triggers: csvList(form.get('tags')),
    inputs: ['region', 'date_range'],
    outputs: ['risk_map', 'summary'],
    tags: csvList(form.get('tags')),
    dependencies: ['policy.data-sovereignty-global'],
    graphX: 60,
    graphY: 60,
  });
  await loadRegistry();
  navigate(`/capabilities/${capability.capability.id}`);
}

async function submitDataProduct(event) {
  event.preventDefault();
  const form = new FormData(refs.dataProductForm);
  await apiPost('/api/geomcp/register', {
    kind: 'data_product',
    title: form.get('title'),
    provider: form.get('provider'),
    nodeId: form.get('nodeId'),
    region: form.get('region'),
    geometryType: form.get('geometryType'),
    temporalCoverage: form.get('temporalCoverage'),
    accessUrl: form.get('accessUrl'),
    license: form.get('license'),
    policyId: form.get('policyId'),
    rawDataExport: false,
    derivedOutputs: csvList(form.get('derivedOutputs')),
    tags: csvList(form.get('tags')),
    description: form.get('description'),
  });
  await loadRegistry();
  setActiveTab('data-products-detail');
}

async function discoverDataProducts() {
  const payload = await apiPost('/api/geomcp/discover', {
    query: refs.searchInput.value || 'flood',
    region: refs.regionFilter.value || 'all',
    types: ['GeoDataProductCapability'],
  });
  renderDataProducts([...(payload.dataProducts || []), ...(payload.assetCards || [])]);
  setActiveTab('data-products-detail');
}

function renderAuthStatus() {
  if (!refs.authStatus) return;
  refs.authStatus.textContent = state.user
    ? `Signed in as ${state.user.name} (${state.user.org})`
    : 'Not signed in. Register or login before adding local assets.';
}

async function loadCurrentUser() {
  if (!state.authToken) {
    renderAuthStatus();
    return;
  }
  const result = await apiGetAuth('/api/auth/me');
  state.user = result.user;
  renderAuthStatus();
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(refs.authForm);
  const mode = event.submitter?.value || 'login';
  const result = await apiPost(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
    name: form.get('name'),
    email: form.get('email'),
    password: form.get('password'),
    org: form.get('org'),
  });
  state.authToken = result.token;
  state.user = result.user;
  window.localStorage.setItem('geonexusToken', result.token);
  renderAuthStatus();
}

async function submitAssetCard(event) {
  event.preventDefault();
  const form = new FormData(refs.assetCardForm);
  const result = await apiPost('/api/assets', {
    assetKind: form.get('assetKind'),
    title: form.get('title'),
    provider: form.get('provider') || state.user?.org,
    nodeId: form.get('nodeId'),
    region: form.get('region'),
    accessUrl: form.get('accessUrl'),
    license: form.get('license'),
    policyId: form.get('policyId'),
    rawDataExport: false,
    inputs: csvList(form.get('inputs')),
    outputs: csvList(form.get('outputs')),
    tags: csvList(form.get('tags')),
    description: form.get('description'),
  });
  await loadRegistry();
  refs.apiResponse.textContent = JSON.stringify(result.geoCard, null, 2);
  setActiveTab('data-products-detail');
}

async function runGeoNodeRuntime() {
  const base = refs.runtimeUrl.value.replace(/\/$/, '');
  let region;
  try {
    region = JSON.parse(refs.runtimeRegion.value);
  } catch (error) {
    refs.runtimeResult.textContent = `Invalid GeoJSON: ${error.message}`;
    return;
  }
  refs.runtimeResult.textContent = 'Submitting job to GeoNode Runtime...';
  const response = await fetch(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: 'skill.flood-impact-analysis',
      region,
      date_range: 'last_14_days',
      requester: 'GeoNexus Console',
    }),
  });
  const job = await response.json();
  if (!response.ok) {
    refs.runtimeResult.textContent = JSON.stringify(job, null, 2);
    return;
  }
  refs.runtimeResult.textContent = JSON.stringify(job, null, 2);

  const poll = async () => {
    const next = await fetch(`${base}/jobs/${job.id}`);
    const payload = await next.json();
    refs.runtimeResult.textContent = JSON.stringify(payload, null, 2);
    if (payload.status !== 'succeeded' && payload.status !== 'failed') {
      window.setTimeout(poll, 800);
    }
  };
  window.setTimeout(poll, 800);
}

async function simulateMission() {
  clearTimers();
  try {
    const mission = refs.omniInput?.value || refs.missionInput.value;
    refs.missionInput.value = mission;
    document.body.classList.add('is-processing');
    const plan = await apiPost('/api/plan', { mission });
    state.plan = plan;
    renderRoute(plan);
    renderGraph(plan.graph, refs.graphStage);
    refs.graphFocus.textContent = plan.selected.skill.name;
    const job = await apiPost('/api/jobs', { mission, plan });
    state.job = job;
    setActiveTab('routing-detail');
    renderTimeline(plan, job);

    const poll = async () => {
      const latest = await apiGet(`/api/jobs/${job.id}`);
      state.job = latest;
      renderTimeline(plan, latest);
      if (latest.status === 'running') {
        const timer = window.setTimeout(poll, 700);
        state.animationTimers.push(timer);
      } else {
        document.body.classList.remove('is-processing');
      }
    };

    const timer = window.setTimeout(poll, 700);
    state.animationTimers.push(timer);
  } catch (error) {
    refs.routeCard.innerHTML = `<strong>Error</strong><div>${error.message}</div>`;
    document.body.classList.remove('is-processing');
    setStatus(false, 'GeoMCP gateway error');
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

async function loadTemplates() {
  try {
    const data = await apiGet('/api/postcard-templates');
    renderTemplates(data.templates || []);
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
}

async function loadStampGroups() {
  try {
    const data = await apiGet('/api/stamp-groups');
    renderStampGroups(data.groups || []);
    updateGroupSelects(data.groups || [], 'stampGroupSelect');
  } catch (error) {
    console.error('Failed to load stamp groups:', error);
  }
}

async function loadStamps(groupId) {
  try {
    const params = groupId ? { groupId } : {};
    const data = await apiGet('/api/stamps', params);
    renderStamps(data.stamps || []);
  } catch (error) {
    console.error('Failed to load stamps:', error);
  }
}

async function loadPostmarkGroups() {
  try {
    const data = await apiGet('/api/postmark-groups');
    renderPostmarkGroups(data.groups || []);
    updateGroupSelects(data.groups || [], 'postmarkGroupSelect');
  } catch (error) {
    console.error('Failed to load postmark groups:', error);
  }
}

async function loadPostmarks(groupId) {
  try {
    const params = groupId ? { groupId } : {};
    const data = await apiGet('/api/postmarks', params);
    renderPostmarks(data.postmarks || []);
  } catch (error) {
    console.error('Failed to load postmarks:', error);
  }
}

function updateGroupSelects(groups, selectId) {
  const select = el(selectId);
  if (!select) return;
  select.innerHTML = groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
}

async function submitTemplate(event) {
  event.preventDefault();
  const form = event.target;
  const frontFile = form.querySelector('[name="frontImageFile"]')?.files[0];
  const backFile = form.querySelector('[name="backTemplateFile"]')?.files[0];

  let frontImage = '';
  let backTemplate = '';
  if (frontFile) frontImage = await uploadFile(frontFile);
  if (backFile) backTemplate = await uploadFile(backFile);

  const body = {
    name: form.querySelector('[name="name"]').value,
    description: form.querySelector('[name="description"]')?.value || '',
    frontImage,
    backTemplate,
    width: parseInt(form.querySelector('[name="width"]').value, 10) || 0,
    height: parseInt(form.querySelector('[name="height"]').value, 10) || 0,
    status: form.querySelector('[name="status"]')?.value || 'active',
  };
  const id = el('templateId')?.value;
  if (id) {
    await apiPut(`/api/postcard-templates/${id}`, body);
  } else {
    await apiPost('/api/postcard-templates', body);
  }
  form.reset();
  el('templateId').value = '';
  await loadTemplates();
}

async function submitStampGroup(event) {
  event.preventDefault();
  const form = event.target;
  const body = {
    name: form.querySelector('[name="name"]').value,
    description: form.querySelector('[name="description"]')?.value || '',
  };
  const id = el('stampGroupId')?.value;
  if (id) {
    await apiPut(`/api/stamp-groups/${id}`, body);
  } else {
    await apiPost('/api/stamp-groups', body);
  }
  form.reset();
  el('stampGroupId').value = '';
  await loadStampGroups();
  await loadStamps();
}

async function submitStamp(event) {
  event.preventDefault();
  const form = event.target;
  const imageFile = form.querySelector('[name="imageFile"]')?.files[0];
  let imagePath = '';
  if (imageFile) imagePath = await uploadFile(imageFile);

  const body = {
    name: form.querySelector('[name="name"]').value,
    groupId: form.querySelector('[name="groupId"]')?.value,
    imagePath,
    status: form.querySelector('[name="status"]')?.value || 'active',
  };
  const id = el('stampId')?.value;
  if (id) {
    await apiPut(`/api/stamps/${id}`, body);
  } else {
    await apiPost('/api/stamps', body);
  }
  form.reset();
  el('stampId').value = '';
  await loadStamps();
}

async function submitPostmarkGroup(event) {
  event.preventDefault();
  const form = event.target;
  const body = {
    name: form.querySelector('[name="name"]').value,
    description: form.querySelector('[name="description"]')?.value || '',
  };
  const id = el('postmarkGroupId')?.value;
  if (id) {
    await apiPut(`/api/postmark-groups/${id}`, body);
  } else {
    await apiPost('/api/postmark-groups', body);
  }
  form.reset();
  el('postmarkGroupId').value = '';
  await loadPostmarkGroups();
  await loadPostmarks();
}

async function submitPostmark(event) {
  event.preventDefault();
  const form = event.target;
  const imageFile = form.querySelector('[name="imageFile"]')?.files[0];
  let imagePath = '';
  if (imageFile) imagePath = await uploadFile(imageFile);

  const body = {
    name: form.querySelector('[name="name"]').value,
    groupId: form.querySelector('[name="groupId"]')?.value,
    imagePath,
    status: form.querySelector('[name="status"]')?.value || 'active',
  };
  const id = el('postmarkId')?.value;
  if (id) {
    await apiPut(`/api/postmarks/${id}`, body);
  } else {
    await apiPost('/api/postmarks', body);
  }
  form.reset();
  el('postmarkId').value = '';
  await loadPostmarks();
}

async function moveMaterial(type, id, direction) {
  await fetch(`/api/${type}/${id}/${direction === 'up' ? 'move-up' : 'move-down'}`, { method: 'POST' });
  if (type === 'stamps') await loadStamps();
  else if (type === 'postmarks') await loadPostmarks();
}

async function deleteMaterial(type, id) {
  if (!confirm('确定要删除吗？')) return;
  await fetch(`/api/${type}/${id}`, { method: 'DELETE' });
  if (type === 'postcard-templates') await loadTemplates();
  else if (type === 'stamps') await loadStamps();
  else if (type === 'postmarks') await loadPostmarks();
}

async function deleteGroup(type, id) {
  if (!confirm('删除分组将同时删除该分组下的所有素材，确定要删除吗？')) return;
  await fetch(`/api/${type}/${id}`, { method: 'DELETE' });
  if (type === 'stamp-groups') await loadStampGroups();
  else if (type === 'postmark-groups') await loadPostmarkGroups();
}

function renderTemplates(templates) {
  const container = el('templateList');
  if (!container) return;
  container.innerHTML = templates.map((t) => `
    <div class="material-card">
      ${t.frontImage ? `<img src="${t.frontImage}" alt="${t.name}" onerror="this.style.display='none'" />` : '<div style="height:100px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">无图片</div>'}
      <div class="name">${t.name}</div>
      <div class="status">${t.status === 'active' ? '启用' : '禁用'}</div>
      <div class="actions">
        <button type="button" data-template-id="${t.id}" data-action="edit">编辑</button>
        <button type="button" data-template-id="${t.id}" data-action="delete">删除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.templateId;
      const template = templates.find((t) => t.id === id);
      if (!template) return;
      el('templateId').value = template.id;
      const form = el('templateForm');
      form.querySelector('[name="name"]').value = template.name;
      form.querySelector('[name="description"]').value = template.description || '';
      form.querySelector('[name="width"]').value = template.width || 150;
      form.querySelector('[name="height"]').value = template.height || 100;
      form.querySelector('[name="status"]').value = template.status;
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMaterial('postcard-templates', btn.dataset.templateId));
  });
}

function renderStampGroups(groups) {
  const container = el('stampGroupList');
  if (!container) return;
  container.innerHTML = groups.map((g, index) => `
    <div class="group-item" data-group-id="${g.id}">
      <div class="group-info">
        <div class="group-name">${g.name}</div>
        <div class="group-desc">${g.description || ''}</div>
      </div>
      <div class="group-actions">
        <button type="button" data-group-id="${g.id}" data-action="edit">编辑</button>
        <button type="button" data-group-id="${g.id}" data-action="delete">删除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.groupId;
      const group = groups.find((g) => g.id === id);
      if (!group) return;
      el('stampGroupId').value = group.id;
      const form = el('stampGroupForm');
      form.querySelector('[name="name"]').value = group.name;
      form.querySelector('[name="description"]').value = group.description || '';
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteGroup('stamp-groups', btn.dataset.groupId));
  });
  container.querySelectorAll('.group-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      container.querySelectorAll('.group-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      loadStamps(item.dataset.groupId);
    });
  });
}

function renderStamps(stamps) {
  const container = el('stampList');
  if (!container) return;
  container.innerHTML = stamps.map((s, index) => `
    <div class="material-card">
      ${s.imagePath ? `<img src="${s.imagePath}" alt="${s.name}" onerror="this.style.display='none'" />` : '<div style="height:100px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">无图片</div>'}
      <div class="name">${s.name}</div>
      <div class="status">${s.status === 'active' ? '启用' : '禁用'}</div>
      <div class="sort-controls">
        <button type="button" data-stamp-id="${s.id}" data-action="up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-stamp-id="${s.id}" data-action="down" ${index === stamps.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <div class="actions">
        <button type="button" data-stamp-id="${s.id}" data-action="edit">编辑</button>
        <button type="button" data-stamp-id="${s.id}" data-action="delete">删除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button[data-action="up"]').forEach((btn) => {
    btn.addEventListener('click', () => moveMaterial('stamps', btn.dataset.stampId, 'up'));
  });
  container.querySelectorAll('button[data-action="down"]').forEach((btn) => {
    btn.addEventListener('click', () => moveMaterial('stamps', btn.dataset.stampId, 'down'));
  });
  container.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.stampId;
      const stamp = stamps.find((s) => s.id === id);
      if (!stamp) return;
      el('stampId').value = stamp.id;
      const form = el('stampForm');
      form.querySelector('[name="name"]').value = stamp.name;
      form.querySelector('[name="groupId"]').value = stamp.groupId;
      form.querySelector('[name="status"]').value = stamp.status;
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMaterial('stamps', btn.dataset.stampId));
  });
}

function renderPostmarkGroups(groups) {
  const container = el('postmarkGroupList');
  if (!container) return;
  container.innerHTML = groups.map((g) => `
    <div class="group-item" data-group-id="${g.id}">
      <div class="group-info">
        <div class="group-name">${g.name}</div>
        <div class="group-desc">${g.description || ''}</div>
      </div>
      <div class="group-actions">
        <button type="button" data-group-id="${g.id}" data-action="edit">编辑</button>
        <button type="button" data-group-id="${g.id}" data-action="delete">删除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.groupId;
      const group = groups.find((g) => g.id === id);
      if (!group) return;
      el('postmarkGroupId').value = group.id;
      const form = el('postmarkGroupForm');
      form.querySelector('[name="name"]').value = group.name;
      form.querySelector('[name="description"]').value = group.description || '';
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteGroup('postmark-groups', btn.dataset.groupId));
  });
  container.querySelectorAll('.group-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      container.querySelectorAll('.group-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      loadPostmarks(item.dataset.groupId);
    });
  });
}

function renderPostmarks(postmarks) {
  const container = el('postmarkList');
  if (!container) return;
  container.innerHTML = postmarks.map((p, index) => `
    <div class="material-card">
      ${p.imagePath ? `<img src="${p.imagePath}" alt="${p.name}" onerror="this.style.display='none'" />` : '<div style="height:100px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">无图片</div>'}
      <div class="name">${p.name}</div>
      <div class="status">${p.status === 'active' ? '启用' : '禁用'}</div>
      <div class="sort-controls">
        <button type="button" data-postmark-id="${p.id}" data-action="up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-postmark-id="${p.id}" data-action="down" ${index === postmarks.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <div class="actions">
        <button type="button" data-postmark-id="${p.id}" data-action="edit">编辑</button>
        <button type="button" data-postmark-id="${p.id}" data-action="delete">删除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button[data-action="up"]').forEach((btn) => {
    btn.addEventListener('click', () => moveMaterial('postmarks', btn.dataset.postmarkId, 'up'));
  });
  container.querySelectorAll('button[data-action="down"]').forEach((btn) => {
    btn.addEventListener('click', () => moveMaterial('postmarks', btn.dataset.postmarkId, 'down'));
  });
  container.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.postmarkId;
      const postmark = postmarks.find((p) => p.id === id);
      if (!postmark) return;
      el('postmarkId').value = postmark.id;
      const form = el('postmarkForm');
      form.querySelector('[name="name"]').value = postmark.name;
      form.querySelector('[name="groupId"]').value = postmark.groupId;
      form.querySelector('[name="status"]').value = postmark.status;
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMaterial('postmarks', btn.dataset.postmarkId));
  });
}

function initPostcardMaterials() {
  loadTemplates();
  loadStampGroups().then(() => loadStamps());
  loadPostmarkGroups().then(() => loadPostmarks());
}

function wireEvents() {
  const refresh = () => Promise.all([loadRegistry(), loadTasks()]).catch((error) => {
    setStatus(false, error.message);
    refs.apiResponse.textContent = JSON.stringify({ error: error.message }, null, 2);
  });

  const rerender = () => loadRegistry().catch((error) => {
    refs.apiResponse.textContent = JSON.stringify({ error: error.message }, null, 2);
  });

  refs.searchInput.addEventListener('input', rerender);
  refs.typeFilter.addEventListener('change', rerender);
  refs.regionFilter.addEventListener('change', rerender);
  refs.runDemoBtn.addEventListener('click', simulateMission);
  refs.omniRunBtn.addEventListener('click', simulateMission);
  if (refs.runMissionSecondary) refs.runMissionSecondary.addEventListener('click', simulateMission);
  refs.refreshBtn.addEventListener('click', refresh);
  refs.detailTabs().forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  refs.productLinks().forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(link.getAttribute('href'));
    });
  });
  refs.taskForm.addEventListener('submit', submitTask);
  refs.capabilityForm.addEventListener('submit', submitCapability);
  refs.dataProductForm.addEventListener('submit', submitDataProduct);
  refs.authForm.addEventListener('submit', submitAuth);
  refs.assetCardForm.addEventListener('submit', submitAssetCard);
  refs.geomcpDiscoverBtn.addEventListener('click', discoverDataProducts);
  refs.runtimeRunBtn.addEventListener('click', runGeoNodeRuntime);

  // Postcard Materials Events
  document.querySelectorAll('.postcard-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.postcard-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.postcard-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-postcard-panel="${tab.dataset.postcardTab}"]`).classList.add('active');
    });
  });

  const templateForm = el('templateForm');
  if (templateForm) templateForm.addEventListener('submit', submitTemplate);
  const templateResetBtn = el('templateResetBtn');
  if (templateResetBtn) templateResetBtn.addEventListener('click', () => templateForm.reset());

  const stampGroupForm = el('stampGroupForm');
  if (stampGroupForm) stampGroupForm.addEventListener('submit', submitStampGroup);
  const stampForm = el('stampForm');
  if (stampForm) stampForm.addEventListener('submit', submitStamp);
  const stampResetBtn = el('stampResetBtn');
  if (stampResetBtn) stampResetBtn.addEventListener('click', () => { stampForm.reset(); el('stampId').value = ''; });

  const postmarkGroupForm = el('postmarkGroupForm');
  if (postmarkGroupForm) postmarkGroupForm.addEventListener('submit', submitPostmarkGroup);
  const postmarkForm = el('postmarkForm');
  if (postmarkForm) postmarkForm.addEventListener('submit', submitPostmark);
  const postmarkResetBtn = el('postmarkResetBtn');
  if (postmarkResetBtn) postmarkResetBtn.addEventListener('click', () => { postmarkForm.reset(); el('postmarkId').value = ''; });

  window.addEventListener('popstate', applyRoute);
}

wireEvents();
Promise.all([loadCurrentUser(), loadRegistry(), loadTasks()]).then(() => {
  state.routeReady = true;
  applyRoute();
  initPostcardMaterials();
}).catch((error) => {
  setStatus(false, error.message);
  refs.apiResponse.textContent = JSON.stringify({ error: error.message }, null, 2);
});
