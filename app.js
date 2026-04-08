/* =====================================================
   TRAEL DASHBOARD — app.js
   Supabase Integration, State, Chart, Upload, Settings
   ===================================================== */

// Supabase Configuration
const SUPABASE_URL = 'https://fmhmqlamcxihqppromxc.supabase.co';
const SUPABASE_KEY = 'sbp_2d595e6cbb09e2364246a71d5cf66ab6955d3436';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====================== STATE ======================
const STATE = {
  // Config / Settings
  config: {
    month: '',            // YYYY-MM
    metaTotal: 240,
    metaTPM: 80,
    metaTPD: 100,
    metaTPS: 60,
    diasUteis: 20,
    diasTrabalhados: 10,
    progAcum: 120,
  },
  // Records: array of { id, date, line, prog, real, desc, source }
  records: [],
  // Equipment: array of { id, name, status }   status: 'green'|'yellow'|'red'
  equipment: [
    { id: 1, name: 'Bobinadeira Principal', status: 'green' },
    { id: 2, name: 'Forno de Secagem',      status: 'yellow' },
    { id: 3, name: 'Ponte Rolante 1',       status: 'green' },
    { id: 4, name: 'Estação de Teste',      status: 'red' },
  ],
  // Obs texts
  obs: [
    'Produção do dia superou a meta diária em +2 unidades, impulsionada por um lote urgente de transformadores TPM. Equipe manteve ritmo acima da média.',
    'Próximo turno com foco reforçado na linha TPD para recuperar desvio acumulado de -5 unidades. Verificar disponibilidade do material de isolamento tipo A.',
    'Tendência de fechamento do mês projetada em 229 unidades (95,4% da meta). Necessário acelerar ritmo nos próximos 10 dias úteis.',
  ],
  manualEntryCount: 1,
  chart: null,
};

// ====================== SEED SAMPLE DATA ======================
function seedSampleData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  STATE.config.month = `${year}-${month}`;

  // Generate 10 days of sample data
  const lines = ['TPM', 'TPD', 'TPS'];
  const progPerDay = [6, 4, 3, 5, 6, 4, 5, 6, 4, 5];
  const realPerDay = [5, 5, 3, 6, 7, 4, 4, 7, 5, 6];
  const tpmRatio = [0.35, 0.30, 0.40, 0.35, 0.40, 0.35, 0.30, 0.40, 0.35, 0.35];

  for (let d = 1; d <= 10; d++) {
    const date = `${year}-${month}-${String(d).padStart(2, '0')}`;
    const prog = progPerDay[d - 1] + Math.floor(Math.random() * 2);
    const real = realPerDay[d - 1] + Math.floor(Math.random() * 2);

    ['TPM', 'TPD', 'TPS'].forEach((line, li) => {
      const ratio = li === 0 ? tpmRatio[d-1] : li === 1 ? 0.40 : 0.25;
      STATE.records.push({
        id: Date.now() + Math.random(),
        date,
        line,
        prog: Math.round(prog * ratio) || 1,
        real: Math.round(real * ratio) || 1,
        desc: `Lote ${d}/${line}`,
        source: 'amostra',
      });
    });
  }
}

// ====================== DB PERSISTENCE (SUPABASE) ======================

async function saveRecordsToDB(records) {
  try {
    // Para simplificar, deletamos registros do mês atual e reinserimos (ou fazemos upsert)
    // No entanto, o mais performático é sincronizar apenas novos/alterados.
    // Para este MVP, vamos inserir apenas o registro novo no ponto de criação.
    const { error } = await supabase.from('production_records').upsert(records);
    if (error) throw error;
  } catch (err) {
    console.error('Erro ao salvar registros:', err);
  }
}

async function loadDataFromDB() {
  try {
    const currentMonth = STATE.config.month;

    // 1. Carregar Config/Metas do mês
    const { data: configData, error: configErr } = await supabase
      .from('config_meta')
      .select('*')
      .eq('month', currentMonth)
      .single();
    
    if (configData) {
      STATE.config = {
        ...STATE.config,
        metaTotal: configData.meta_total,
        metaTPM: configData.meta_tpm,
        metaTPD: configData.meta_tpd,
        metaTPS: configData.meta_tps,
        diasUteis: configData.dias_uteis,
        diasTrabalhados: configData.dias_trabalhados,
        progAcum: configData.prog_acumulado
      };
    }

    // 2. Carregar Registros do mês
    const { data: recordsData, error: recordsErr } = await supabase
      .from('production_records')
      .select('*')
      .gte('date', `${currentMonth}-01`)
      .lte('date', `${currentMonth}-31`);
    
    if (recordsData) {
      STATE.records = recordsData.map(r => ({
        id: r.id,
        date: r.date,
        line: r.line,
        prog: r.prog,
        real: r.real,
        desc: r.description,
        source: r.origin
      }));
    }

    // 3. Carregar Equipamentos
    const { data: equipData, error: equipErr } = await supabase
      .from('equipment_status')
      .select('*');
    if (equipData) {
      STATE.equipment = equipData.map(e => ({
        id: e.id,
        name: e.name,
        status: e.status
      }));
    }

    renderDashboard();
  } catch (err) {
    console.warn('Erro ao carregar do Supabase, usando localStorage/amostra', err);
    loadFromStorage();
  }
}

// Manter localStorage como redundância/cache
function saveToStorage() {
  localStorage.setItem('trael_config',    JSON.stringify(STATE.config));
  localStorage.setItem('trael_records',   JSON.stringify(STATE.records));
  localStorage.setItem('trael_equipment', JSON.stringify(STATE.equipment));
  localStorage.setItem('trael_obs',       JSON.stringify(STATE.obs));
}

function loadFromStorage() {
  try {
    const cfg = localStorage.getItem('trael_config');
    if (cfg) STATE.config = { ...STATE.config, ...JSON.parse(cfg) };
    const rec = localStorage.getItem('trael_records');
    if (rec) STATE.records = JSON.parse(rec);
    const eq = localStorage.getItem('trael_equipment');
    if (eq) STATE.equipment = JSON.parse(eq);
    const obs = localStorage.getItem('trael_obs');
    if (obs) STATE.obs = JSON.parse(obs);
  } catch (e) {
    console.warn('Storage load error', e);
  }
}

// ====================== PAGE NAVIGATION ======================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  if (page === 'dashboard') renderDashboard();
  if (page === 'settings')  renderSettingsPage();
  if (page === 'upload')    renderDataTable();
}

// ====================== DATE HELPERS ======================
function getMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(m, 10) - 1]}/${y}`;
}

function todayStr() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
}

function todayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const hd = document.getElementById('headerDate');
  const hm = document.getElementById('headerMonth');
  const ft = document.getElementById('footerTime');
  if (hd) hd.textContent = dateStr;
  if (hm) hm.textContent = getMonthLabel(STATE.config.month) || `${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  if (ft) ft.textContent = `Última atualização: ${dateStr} ${timeStr}`;
}

// ====================== COMPUTED METRICS ======================
function computeMetrics() {
  const cfg = STATE.config;
  const today = todayDateStr();
  const currentMonthPrefix = cfg.month; // YYYY-MM

  // filter records for current month
  const monthRecords = STATE.records.filter(r => r.date && r.date.startsWith(currentMonthPrefix));

  // total real acumulado
  const totalReal = monthRecords.reduce((s, r) => s + (Number(r.real) || 0), 0);

  // by line
  const byLine = { TPM: { prog: 0, real: 0 }, TPD: { prog: 0, real: 0 }, TPS: { prog: 0, real: 0 } };
  monthRecords.forEach(r => {
    if (byLine[r.line]) {
      byLine[r.line].prog += Number(r.prog) || 0;
      byLine[r.line].real += Number(r.real) || 0;
    }
  });

  // today's records
  const todayRecords = monthRecords.filter(r => r.date === today);
  const todayProg = todayRecords.reduce((s, r) => s + (Number(r.prog) || 0), 0);
  const todayReal = todayRecords.reduce((s, r) => s + (Number(r.real) || 0), 0);

  // day-by-day for chart
  const daysInMonth = new Date(
    parseInt(currentMonthPrefix.split('-')[0]),
    parseInt(currentMonthPrefix.split('-')[1]),
    0
  ).getDate();

  const dailyData = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
    const dayRecs = monthRecords.filter(r => r.date === dateKey);
    dailyData.push({
      day: d,
      prog: dayRecs.reduce((s, r) => s + (Number(r.prog) || 0), 0),
      real: dayRecs.reduce((s, r) => s + (Number(r.real) || 0), 0),
    });
  }

  // acumulado linha
  let acum = 0;
  const acumData = dailyData.map(d => { acum += d.real; return acum; });

  // tendência
  const pct = cfg.metaTotal > 0 ? (totalReal / cfg.metaTotal) * 100 : 0;
  const diasT = cfg.diasTrabalhados || 1;
  const diasU = cfg.diasUteis || 1;
  const ritmoMedio = totalReal / diasT;
  const tendencia = Math.round(ritmoMedio * diasU);

  return {
    metaTotal: cfg.metaTotal,
    progAcum:  cfg.progAcum,
    realAcum:  totalReal,
    saldo:     Math.max(cfg.metaTotal - totalReal, 0),
    pct:       Math.min(pct, 100),
    byLine,
    todayProg, todayReal, todayVar: todayReal - todayProg,
    dailyData, acumData,
    daysInMonth,
    tendencia,
  };
}

// ====================== RENDER DASHBOARD ======================
function renderDashboard() {
  const m = computeMetrics();

  // Meta badge
  setText('metaBadgeValue', m.metaTotal);
  setText('metaBadgeMonth', getMonthLabel(STATE.config.month));

  // KPIs
  setText('kpiMeta',  m.metaTotal);
  setText('kpiProg',  m.progAcum);
  setText('kpiReal',  m.realAcum);
  setText('kpiSaldo', m.saldo);

  // Gauge
  animateGauge(m.pct);

  // Lines
  renderLines(m.byLine);

  // Chart
  renderChart(m);

  // Today bulletin
  const tbDate = document.getElementById('tbDate');
  if (tbDate) tbDate.textContent = todayStr();
  setText('tbProg', m.todayProg);
  setText('tbReal', m.todayReal);
  const tbVar = document.getElementById('tbVar');
  if (tbVar) {
    tbVar.textContent = (m.todayVar >= 0 ? '+' : '') + m.todayVar;
    tbVar.style.color = m.todayVar >= 0 ? 'var(--success)' : 'var(--danger)';
  }
  setText('tbAcum', m.realAcum);
  const tbTend = document.getElementById('tbTend');
  if (tbTend) {
    const tendPct = STATE.config.metaTotal > 0 ? ((m.tendencia / STATE.config.metaTotal) * 100).toFixed(1) : '0';
    tbTend.textContent = `${m.tendencia} (${tendPct}%)`;
    tbTend.style.color = m.tendencia >= STATE.config.metaTotal ? 'var(--success)' : 'var(--warning)';
  }

  // Obs
  renderObs();

  // Equipment
  renderEquipment();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateGauge(pct) {
  const path = document.getElementById('gaugePath');
  const pctEl = document.getElementById('gaugePct');
  const statusEl = document.getElementById('gaugeStatus');
  if (!path) return;

  const total = 157; // half-circle circumference aprox
  const offset = total - (total * pct / 100);

  path.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
  path.style.strokeDashoffset = offset;

  // Animate number
  let current = 0;
  const target = Math.round(pct);
  const step = target / 60;
  const ti = setInterval(() => {
    current = Math.min(current + step, target);
    if (pctEl) pctEl.textContent = Math.round(current) + '%';
    if (current >= target) clearInterval(ti);
  }, 16);

  // Status
  if (statusEl) {
    if (pct >= 80) {
      statusEl.textContent = '✅ No Prazo';
      statusEl.style.background = 'rgba(76,175,80,0.15)';
      statusEl.style.color = 'var(--success)';
    } else if (pct >= 50) {
      statusEl.textContent = '⚠️ Em Andamento';
      statusEl.style.background = 'rgba(255,167,38,0.15)';
      statusEl.style.color = 'var(--warning)';
    } else {
      statusEl.textContent = '🚨 Atenção Necessária';
      statusEl.style.background = 'rgba(239,83,80,0.15)';
      statusEl.style.color = 'var(--danger)';
    }
  }
}

function renderLines(byLine) {
  ['TPM', 'TPD', 'TPS'].forEach(line => {
    const lKey = line.toLowerCase();
    const data = byLine[line] || { prog: 0, real: 0 };
    const meta = STATE.config[`meta${line}`] || 1;
    const pct = Math.min((data.real / meta) * 100, 100);
    const varVal = data.real - data.prog;

    setText(`${lKey}Prog`, data.prog);
    setText(`${lKey}Real`, data.real);
    const varEl = document.getElementById(`${lKey}Var`);
    if (varEl) {
      varEl.textContent = (varVal >= 0 ? '+' : '') + varVal;
      varEl.style.color = varVal >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    const bar = document.getElementById(`${lKey}Bar`);
    if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 300);

    setText(`${lKey}Pct`, pct.toFixed(1) + '%');

    const statusEl = document.getElementById(`${lKey}Status`);
    if (statusEl) {
      if (data.real >= meta)   statusEl.textContent = '✅';
      else if (pct >= 50)      statusEl.textContent = '⚠️';
      else                     statusEl.textContent = '🚨';
    }
  });
}

// ====================== CHART ======================
function renderChart(m) {
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;

  const today = new Date();
  const todayDay = today.getDate();
  const labels = m.dailyData.map(d => d.day);

  const progData = m.dailyData.map(d => d.prog || null);
  const realData = m.dailyData.map(d => d.real || null);
  const acumData = m.acumData;

  const barColors = m.dailyData.map(d => {
    if (d.day === todayDay) return 'rgba(102,187,106,0.9)';
    if (d.day < todayDay)  return 'rgba(46,125,50,0.65)';
    return 'rgba(46,125,50,0.18)';
  });
  const progColors = m.dailyData.map(d =>
    d.day <= todayDay ? 'rgba(144,164,174,0.5)' : 'rgba(144,164,174,0.18)'
  );

  // Safe destroy — detach from DOM before recreating to avoid resize loop
  if (STATE.chart) {
    STATE.chart.destroy();
    STATE.chart = null;
  }

  STATE.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Programado',
          data: progData,
          backgroundColor: progColors,
          borderColor: 'rgba(144,164,174,0.3)',
          borderWidth: 1,
          borderRadius: 3,
          order: 3,
        },
        {
          label: 'Realizado',
          data: realData,
          backgroundColor: barColors,
          borderColor: 'rgba(76,175,80,0.4)',
          borderWidth: 1,
          borderRadius: 3,
          order: 2,
        },
        {
          label: 'Acumulado',
          data: acumData,
          type: 'line',
          borderColor: '#FFA726',
          backgroundColor: 'rgba(255,167,38,0.06)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#FFA726',
          fill: true,
          tension: 0.4,
          order: 1,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,   // CRITICAL: let the container define the height
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C2333',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#E6EDF3',
          bodyColor: '#8B949E',
          padding: 10,
          callbacks: { title: items => `Dia ${items[0].label}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8B949E', font: { size: 11 } },
        },
        y: {
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8B949E', font: { size: 11 }, stepSize: 1 },
          title: { display: true, text: 'Diário', color: '#586069', font: { size: 11 } },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#FFA726', font: { size: 11 } },
          title: { display: true, text: 'Acumulado', color: '#FFA726', font: { size: 11 } },
        },
      },
    },
  });
}

// ====================== OBSERVATIONS ======================
function renderObs() {
  ['obs1Text','obs2Text','obs3Text'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = STATE.obs[i] || '';
  });
}

function toggleEditObs() {
  const display = document.getElementById('obsDisplay');
  const edit    = document.getElementById('obsEdit');
  const showing = display.style.display !== 'none';
  display.style.display = showing ? 'none' : 'block';
  edit.style.display    = showing ? 'block' : 'none';

  if (showing) {
    document.getElementById('obs1Input').value = STATE.obs[0] || '';
    document.getElementById('obs2Input').value = STATE.obs[1] || '';
    document.getElementById('obs3Input').value = STATE.obs[2] || '';
  }
}

function saveObs() {
  STATE.obs[0] = document.getElementById('obs1Input').value;
  STATE.obs[1] = document.getElementById('obs2Input').value;
  STATE.obs[2] = document.getElementById('obs3Input').value;
  saveToStorage();
  toggleEditObs();
  renderObs();
}

// ====================== EQUIPMENT ======================
function renderEquipment() {
  const list = document.getElementById('equipmentList');
  if (!list) return;
  list.innerHTML = '';
  STATE.equipment.forEach(eq => {
    const labels = { green: '🟢 Operacional', yellow: '🟡 Manutenção Preventiva', red: '🔴 Parado / Crítico' };
    const item = document.createElement('div');
    item.className = 'equip-item';
    item.innerHTML = `
      <div class="equip-status-dot ${eq.status}"></div>
      <span class="equip-name">${eq.name}</span>
      <span class="equip-status-label ${eq.status}">${labels[eq.status] || eq.status}</span>
    `;
    list.appendChild(item);
  });
}

function renderEquipmentSettings() {
  const container = document.getElementById('equipmentSettings');
  if (!container) return;
  container.innerHTML = '';
  STATE.equipment.forEach((eq, idx) => {
    const row = document.createElement('div');
    row.className = 'equip-setting-row';
    row.innerHTML = `
      <input type="text" class="form-input" value="${eq.name}" onchange="updateEquipName(${idx}, this.value)" />
      <select class="form-input" onchange="updateEquipStatus(${idx}, this.value)">
        <option value="green"  ${eq.status==='green'  ? 'selected':''}>🟢 Operacional</option>
        <option value="yellow" ${eq.status==='yellow' ? 'selected':''}>🟡 Manutenção</option>
        <option value="red"    ${eq.status==='red'    ? 'selected':''}>🔴 Parado</option>
      </select>
      <button class="btn-del-equip" onclick="removeEquipment(${idx})">✕ Remover</button>
    `;
    container.appendChild(row);
  });
}

async function updateEquipName(idx, val) { 
  STATE.equipment[idx].name = val; 
  await saveEquipToDB(STATE.equipment[idx]);
}

async function updateEquipStatus(idx, val) { 
  STATE.equipment[idx].status = val; 
  await saveEquipToDB(STATE.equipment[idx]);
}

async function saveEquipToDB(eq) {
  try {
    const { error } = await supabase.from('equipment_status').upsert({
      name: eq.name,
      status: eq.status
    });
    if (error) throw error;
  } catch (err) {
    console.error('Erro ao salvar equipamento:', err);
  }
}

async function removeEquipment(idx) {
  const eq = STATE.equipment[idx];
  if (!confirm(`Remover "${eq.name}" do banco de dados?`)) return;
  try {
    const { error } = await supabase.from('equipment_status').delete().eq('name', eq.name);
    if (error) throw error;
    STATE.equipment.splice(idx, 1);
    renderEquipmentSettings();
    renderEquipment();
  } catch (err) {
    alert('Erro ao remover equipamento: ' + err.message);
  }
}

async function addEquipment() {
  const newEq = { name: 'Novo Equipamento ' + Date.now(), status: 'green' };
  try {
    const { data, error } = await supabase.from('equipment_status').insert(newEq).select();
    if (error) throw error;
    STATE.equipment.push({ id: data[0].id, name: data[0].name, status: data[0].status });
    renderEquipmentSettings();
    renderEquipment();
  } catch (err) {
    alert('Erro ao adicionar equipamento: ' + err.message);
  }
}

// ====================== SETTINGS PAGE ======================
function renderSettingsPage() {
  const cfg = STATE.config;
  setValue('configMonth',           cfg.month);
  setValue('configMetaTotal',       cfg.metaTotal);
  setValue('configMetaTPM',         cfg.metaTPM);
  setValue('configMetaTPD',         cfg.metaTPD);
  setValue('configMetaTPS',         cfg.metaTPS);
  setValue('configDiasUteis',       cfg.diasUteis);
  setValue('configDiasTrabalhados', cfg.diasTrabalhados);
  setValue('configProgAcum',        cfg.progAcum);
  renderEquipmentSettings();
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

async function saveSettings() {
  STATE.config.month           = document.getElementById('configMonth').value;
  STATE.config.metaTotal       = parseInt(document.getElementById('configMetaTotal').value) || 0;
  STATE.config.metaTPM         = parseInt(document.getElementById('configMetaTPM').value)   || 0;
  STATE.config.metaTPD         = parseInt(document.getElementById('configMetaTPD').value)   || 0;
  STATE.config.metaTPS         = parseInt(document.getElementById('configMetaTPS').value)   || 0;
  STATE.config.diasUteis       = parseInt(document.getElementById('configDiasUteis').value) || 1;
  STATE.config.diasTrabalhados = parseInt(document.getElementById('configDiasTrabalhados').value) || 0;
  STATE.config.progAcum        = parseInt(document.getElementById('configProgAcum').value)  || 0;

  try {
    const { error } = await supabase.from('config_meta').upsert({
      month: STATE.config.month,
      meta_total: STATE.config.metaTotal,
      meta_tpm: STATE.config.metaTPM,
      meta_tpd: STATE.config.metaTPD,
      meta_tps: STATE.config.metaTPS,
      dias_uteis: STATE.config.diasUteis,
      dias_trabalhados: STATE.config.diasTrabalhados,
      prog_acumulado: STATE.config.progAcum
    });
    if (error) throw error;
    saveToStorage();
    showStatus('settingsStatus', '✅ Configurações salvas no Supabase!', 'success');
    renderDashboard();
  } catch (err) {
    showStatus('settingsStatus', '🚨 Erro ao salvar no banco: ' + err.message, 'error');
  }
}

function resetSettings() {
  if (!confirm('Restaurar configurações padrão? (Os registros de produção não serão apagados)')) return;
  STATE.config = {
    month: STATE.config.month,
    metaTotal: 240, metaTPM: 80, metaTPD: 100, metaTPS: 60,
    diasUteis: 20, diasTrabalhados: 10, progAcum: 120,
  };
  saveToStorage();
  renderSettingsPage();
  showStatus('settingsStatus', '↺ Configurações restauradas para o padrão.', 'info');
}

// ====================== UPLOAD / MANUAL ENTRY ======================
let manualCount = 1;

function addManualEntry() {
  const idx = manualCount++;
  const container = document.getElementById('manualEntries');
  const div = document.createElement('div');
  div.className = 'manual-entry';
  div.dataset.entry = idx;
  div.innerHTML = `
    <div class="entry-header">
      <span class="entry-num">Registro #${idx + 1}</span>
      <button class="btn-remove-entry" onclick="removeManualEntry(${idx})">✕ Remover</button>
    </div>
    <div class="entry-fields">
      <div class="form-group"><label>Data</label><input type="date" class="form-input entry-date" id="entryDate${idx}" /></div>
      <div class="form-group"><label>Linha</label>
        <select class="form-input entry-line" id="entryLine${idx}">
          <option value="">Selecionar...</option>
          <option value="TPM">TPM – Média Força</option>
          <option value="TPD">TPD – Distribuição</option>
          <option value="TPS">TPS – Seco</option>
        </select>
      </div>
      <div class="form-group"><label>Programado</label><input type="number" class="form-input entry-prog" id="entryProg${idx}" min="0" placeholder="0" /></div>
      <div class="form-group"><label>Realizado</label><input type="number" class="form-input entry-real" id="entryReal${idx}" min="0" placeholder="0" /></div>
      <div class="form-group"><label>Descrição / OS</label><input type="text" class="form-input entry-desc" id="entryDesc${idx}" placeholder="Nº da OS..." /></div>
    </div>
  `;
  container.appendChild(div);
}

function removeManualEntry(idx) {
  const el = document.querySelector(`[data-entry="${idx}"]`);
  if (el) el.remove();
}

async function saveManualEntries() {
  const entries = document.querySelectorAll('.manual-entry');
  let newRecords = [];
  let errors = 0;

  entries.forEach(entry => {
    const idx = entry.dataset.entry;
    const date = document.getElementById(`entryDate${idx}`)?.value;
    const line = document.getElementById(`entryLine${idx}`)?.value;
    const prog = parseInt(document.getElementById(`entryProg${idx}`)?.value) || 0;
    const real = parseInt(document.getElementById(`entryReal${idx}`)?.value) || 0;
    const desc = document.getElementById(`entryDesc${idx}`)?.value || '';

    if (!date || !line) { errors++; return; }

    newRecords.push({
      date,
      line,
      prog,
      real,
      description: desc,
      origin: 'manual'
    });
  });

  if (newRecords.length > 0) {
    try {
      const { data, error } = await supabase.from('production_records').insert(newRecords).select();
      if (error) throw error;
      
      // Update local state with the returned records (including IDs)
      data.forEach(r => {
        STATE.records.push({
          id: r.id,
          date: r.date,
          line: r.line,
          prog: r.prog,
          real: r.real,
          desc: r.description,
          source: r.origin
        });
      });

      saveToStorage();
      renderDataTable();
      renderDashboard();
      
      if (errors > 0) {
        showStatus('manualStatus', `⚠️ ${newRecords.length} registro(s) salvos no banco. ${errors} pendentes.`, 'error');
      } else {
        showStatus('manualStatus', `✅ ${newRecords.length} registro(s) salvos no Supabase!`, 'success');
        clearManualForm();
      }
    } catch (err) {
      showStatus('manualStatus', '🚨 Erro ao salvar no banco: ' + err.message, 'error');
    }
  }
}

function clearManualForm() {
  const container = document.getElementById('manualEntries');
  if (!container) return;
  // reset to single empty entry
  manualCount = 1;
  container.innerHTML = `
    <div class="manual-entry" data-entry="0">
      <div class="entry-header">
        <span class="entry-num">Registro #1</span>
        <button class="btn-remove-entry" onclick="removeManualEntry(0)" style="display:none">✕</button>
      </div>
      <div class="entry-fields">
        <div class="form-group"><label>Data</label><input type="date" class="form-input entry-date" id="entryDate0" /></div>
        <div class="form-group"><label>Linha</label>
          <select class="form-input entry-line" id="entryLine0">
            <option value="">Selecionar...</option>
            <option value="TPM">TPM – Média Força</option>
            <option value="TPD">TPD – Distribuição</option>
            <option value="TPS">TPS – Seco</option>
          </select>
        </div>
        <div class="form-group"><label>Programado</label><input type="number" class="form-input entry-prog" id="entryProg0" min="0" placeholder="0" /></div>
        <div class="form-group"><label>Realizado</label><input type="number" class="form-input entry-real" id="entryReal0" min="0" placeholder="0" /></div>
        <div class="form-group"><label>Descrição / OS</label><input type="text" class="form-input entry-desc" id="entryDesc0" placeholder="Nº da OS..." /></div>
      </div>
    </div>
  `;
}

// ====================== FILE UPLOAD ======================
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const statusEl = document.getElementById('uploadStatus');
  statusEl.style.display = 'block';
  statusEl.className = 'upload-status info';
  statusEl.textContent = `⏳ Processando "${file.name}"...`;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      if (ext === 'csv') {
        parseCSV(e.target.result, file.name);
      } else {
        // XLSX
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        parseXLSXRows(rows, file.name);
      }
    } catch (err) {
      showStatus('uploadStatus', `🚨 Erro ao processar o arquivo: ${err.message}`, 'error');
    }
  };
  reader.onerror = () => showStatus('uploadStatus', '🚨 Erro ao ler o arquivo.', 'error');

  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsArrayBuffer(file);
}

async function parseXLSXRows(rows, filename) {
  if (rows.length < 2) {
    showStatus('uploadStatus', '⚠️ Planilha vazia ou sem dados.', 'error');
    return;
  }

  const header = rows[0].map(h => String(h || '').toLowerCase().trim());
  const colMap = {
    date: findCol(header, ['data','date','dt']),
    line: findCol(header, ['linha','line','tipo']),
    prog: findCol(header, ['programado','prog','planned']),
    real: findCol(header, ['realizado','real','actual']),
    desc: findCol(header, ['descricao','desc','os','ordem']),
  };

  let recordsToInsert = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    let date = colMap.date >= 0 ? row[colMap.date] : null;
    let line = colMap.line >= 0 ? String(row[colMap.line] || '').toUpperCase().trim() : '';
    const prog = colMap.prog >= 0 ? (Number(row[colMap.prog]) || 0) : 0;
    const real = colMap.real >= 0 ? (Number(row[colMap.real]) || 0) : 0;
    const desc = colMap.desc >= 0 ? String(row[colMap.desc] || '') : '';

    if (date) {
      if (typeof date === 'number') {
        const jsDate = new Date(Math.round((date - 25569) * 86400 * 1000));
        const y = jsDate.getUTCFullYear();
        const m = String(jsDate.getUTCMonth() + 1).padStart(2,'0');
        const d = String(jsDate.getUTCDate()).padStart(2,'0');
        date = `${y}-${m}-${d}`;
      } else {
        date = String(date).trim();
        const parts = date.split('/');
        if (parts.length === 3) date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }

    if (line.includes('MED') || line.includes('MÉDIA') || line === 'TPM') line = 'TPM';
    else if (line.includes('DIST') || line === 'TPD') line = 'TPD';
    else if (line.includes('SECO') || line === 'TPS') line = 'TPS';

    if (!date || !['TPM','TPD','TPS'].includes(line)) continue;

    recordsToInsert.push({
      date,
      line,
      prog,
      real,
      description: desc,
      origin: `xlsx:${filename}`
    });
  }

  if (recordsToInsert.length > 0) {
    try {
      const { data, error } = await supabase.from('production_records').insert(recordsToInsert).select();
      if (error) throw error;
      
      // Update local state
      data.forEach(r => {
        STATE.records.push({
          id: r.id, date: r.date, line: r.line, prog: r.prog, real: r.real, desc: r.description, source: r.origin
        });
      });

      saveToStorage();
      renderDataTable();
      renderDashboard();
      showStatus('uploadStatus', `✅ ${recordsToInsert.length} registro(s) importados do Supabase!`, 'success');
      showUploadPreview(rows.slice(0, 6), rows[0]);
    } catch (err) {
      showStatus('uploadStatus', `🚨 Erro ao salvar no banco: ${err.message}`, 'error');
    }
  }
}

function parseCSV(text, filename) {
  const lines = text.split('\n').filter(l => l.trim());
  const rows = lines.map(l => l.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, '')));
  parseXLSXRows(rows, filename);
}

function findCol(header, names) {
  for (const name of names) {
    const idx = header.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function showUploadPreview(rows, header) {
  const preview = document.getElementById('uploadPreview');
  if (!preview || !rows.length) return;
  let html = '<table class="data-table"><thead><tr>';
  (rows[0] || []).forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  rows.slice(1).forEach(row => {
    html += '<tr>';
    row.forEach(cell => { html += `<td>${cell}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  preview.style.display = 'block';
  preview.innerHTML = '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Prévia da planilha importada:</p>' + html;
}

// Drag and drop
function initDropZone() {
  const dz = document.getElementById('dropZone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      document.getElementById('fileInput').files = files;
      handleFileUpload({ target: { files } });
    }
  });
}

// ====================== DATA TABLE ======================
function renderDataTable() {
  const tbody = document.getElementById('dataTableBody');
  if (!tbody) return;

  const filterLine = document.getElementById('filterLine')?.value || '';
  const currentMonth = STATE.config.month;
  let records = STATE.records.filter(r => r.date && r.date.startsWith(currentMonth));
  if (filterLine) records = records.filter(r => r.line === filterLine);
  records.sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Nenhum registro encontrado para o mês atual.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const varVal = (Number(r.real) || 0) - (Number(r.prog) || 0);
    const varColor = varVal >= 0 ? 'var(--success)' : 'var(--danger)';
    const varStr = (varVal >= 0 ? '+' : '') + varVal;
    const lineBadgeCls = r.line === 'TPM' ? 'line-badge-tpm' : r.line === 'TPD' ? 'line-badge-tpd' : 'line-badge-tps';
    const [y,m,d] = (r.date || '').split('-');
    const displayDate = d && m && y ? `${d}/${m}/${y}` : r.date;
    return `<tr>
      <td>${displayDate}</td>
      <td><span class="line-badge ${lineBadgeCls}">${r.line}</span></td>
      <td><strong>${r.prog}</strong></td>
      <td><strong style="color:var(--success)">${r.real}</strong></td>
      <td><strong style="color:${varColor}">${varStr}</strong></td>
      <td style="color:var(--text-muted)">${r.desc || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.source === 'manual' ? '✏️ Manual' : r.source?.startsWith('xlsx') ? '📄 Importado' : '🔄 Amostra'}</td>
      <td><button class="btn-del-row" onclick="deleteRecord('${r.id}')">✕</button></td>
    </tr>`;
  }).join('');
}

function filterTable() { renderDataTable(); }

async function deleteRecord(id) {
  if (!confirm('Remover este registro permanentemente do banco de dados?')) return;
  try {
    const { error } = await supabase.from('production_records').delete().eq('id', id);
    if (error) throw error;
    
    STATE.records = STATE.records.filter(r => String(r.id) !== String(id));
    saveToStorage();
    renderDataTable();
    renderDashboard();
  } catch (err) {
    alert('Erro ao excluir: ' + err.message);
  }
}

function exportData() {
  const currentMonth = STATE.config.month;
  const records = STATE.records.filter(r => r.date && r.date.startsWith(currentMonth));
  const headers = ['Data', 'Linha', 'Programado', 'Realizado', 'Variação', 'Descrição', 'Origem'];
  const rows = records.map(r => {
    const v = (Number(r.real)||0) - (Number(r.prog)||0);
    return [r.date, r.line, r.prog, r.real, v, r.desc, r.source];
  });
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trael_producao_${currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ====================== UTILS ======================
function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  el.className = `upload-status ${type}`;
  el.textContent = msg;
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial local load
  loadFromStorage();

  // 2. Try Supabase cloud load
  await loadDataFromDB();

  // 3. Fallback/Defaults
  if (STATE.records.length === 0) {
    seedSampleData();
  }
  if (!STATE.config.month) {
    const now = new Date();
    STATE.config.month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  initDropZone();
  updateClock();
  setInterval(updateClock, 1000);

  renderDashboard();
});
