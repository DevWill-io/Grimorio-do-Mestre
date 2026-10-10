/* ============================================================
   GRIMÓRIO DO MESTRE — script.js
   Organização:
   1.  Armazenamento seguro (localStorage)
   2.  Utilidades genéricas
   3.  Notificações (toast) e modal de confirmação
   4.  Navegação por abas
   5.  Módulo: Rolador de Dados
   6.  Módulo: Fichas de Personagem
   7.  Módulo: Ferramentas do Mestre
   8.  Bootstrap
   ============================================================ */

(() => {
  'use strict';

  /* ==========================================================
     1. ARMAZENAMENTO SEGURO
     Todas as leituras/escritas passam por aqui para que a
     aplicação continue funcional mesmo sem localStorage ou com
     JSON corrompido — nada de quebrar a UI.
     ========================================================== */

  const STORAGE_KEYS = {
    history:    'grimorio.history.v1',
    sheets:     'grimorio.sheets.v1',
    initiative: 'grimorio.initiative.v1'
  };

  /** Testa disponibilidade do localStorage (modo privado, cota, etc.). */
  const storageAvailable = (() => {
    try {
      const probe = '__grimorio_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })();

  /** Lê JSON do storage com fallback silencioso em caso de erro. */
  const readJSON = (key, fallback) => {
    if (!storageAvailable) return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      // Dados corrompidos: descarta e usa o fallback
      try { window.localStorage.removeItem(key); } catch { /* noop */ }
      return fallback;
    }
  };

  /** Grava JSON no storage; devolve false se não for possível. */
  const writeJSON = (key, value) => {
    if (!storageAvailable) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  /* ==========================================================
     2. UTILIDADES GENÉRICAS
     ========================================================== */

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Gera id único simples (suficiente para uso local). */
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  /** Escapa HTML para inserção segura de texto digitado pelo usuário. */
  const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  /** Formata timestamp em pt-BR (hora:minuto:segundo). */
  const formatTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  /** Lê ou escreve em caminho aninhado via string "a.b.0.c". */
  const getPath = (obj, path) =>
    path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

  const setPath = (obj, path, value) => {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    const last = parts[parts.length - 1];
    cur[/^\d+$/.test(last) ? Number(last) : last] = value;
  };

  /* ==========================================================
     3. TOAST & MODAL DE CONFIRMAÇÃO
     ========================================================== */

  const toastEl = $('#toast');
  let toastTimer = null;

  /** Exibe notificação rápida. type: 'info' | 'success' | 'error' */
  const showToast = (message, type = 'info') => {
    if (!toastEl) return;
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = `toast is-visible${type !== 'info' ? ` is-${type}` : ''}`;
    toastEl.hidden = false;
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('is-visible');
      window.setTimeout(() => { toastEl.hidden = true; }, 240);
    }, 2600);
  };

  const modalBackdrop = $('#modalBackdrop');
  const modalTitleEl  = $('#modalTitle');
  const modalMsgEl    = $('#modalMessage');
  const modalConfirm  = $('#modalConfirm');
  const modalCancel   = $('#modalCancel');
  let modalResolver = null;

  /** Abre o modal e devolve Promise<boolean> com a escolha do usuário. */
  const confirmAction = (title, message, confirmLabel = 'Confirmar') => {
    if (!modalBackdrop) return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    if (modalResolver) { modalResolver(false); modalResolver = null; }

    modalTitleEl.textContent = title;
    modalMsgEl.textContent = message;
    modalConfirm.textContent = confirmLabel;
    modalBackdrop.hidden = false;
    // Foco no botão de cancelar por segurança (ação destrutiva)
    window.setTimeout(() => modalCancel?.focus(), 40);

    return new Promise((resolve) => { modalResolver = resolve; });
  };

  const closeModal = (result) => {
    if (!modalBackdrop) return;
    modalBackdrop.hidden = true;
    if (modalResolver) { modalResolver(result); modalResolver = null; }
  };

  if (modalBackdrop) {
    modalConfirm?.addEventListener('click', () => closeModal(true));
    modalCancel?.addEventListener('click', () => closeModal(false));
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalBackdrop.hidden) closeModal(false);
    });
  }

  /* ==========================================================
     4. NAVEGAÇÃO POR ABAS
     ========================================================== */

  const initTabs = () => {
    const tabs = $$('.tab');
    const panels = $$('.panel');
    if (!tabs.length) return;

    const activate = (name, moveFocus = false) => {
      tabs.forEach((tab) => {
        const on = tab.dataset.tab === name;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on && moveFocus) tab.focus();
      });
      panels.forEach((panel) => {
        const on = panel.id === `panel-${name}`;
        panel.hidden = !on;
        panel.classList.toggle('is-active', on);
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activate(tab.dataset.tab));
    });

    // Navegação por setas dentro do tablist (padrão ARIA)
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        activate(tabs[next].dataset.tab, true);
      });
    });
  };

  /* ==========================================================
     5. MÓDULO: ROLADOR DE DADOS
     ========================================================== */

  const Dice = (() => {
    const MAX_DICE = 100;
    const MAX_FACES = 1000;
    const HISTORY_LIMIT = 60;

    const resultEl  = $('#diceResult');
    const formEl    = $('#formulaForm');
    const inputEl   = $('#formulaInput');
    const errorEl   = $('#formulaError');
    const historyEl = $('#historyList');
    const clearBtn  = $('#btnClearHistory');
    const quickWrap = $('#quickDice');

    let history = readJSON(STORAGE_KEYS.history, []);
    if (!Array.isArray(history)) history = [];

    let rolling = false;

    /* ---- Parser de fórmula ----
       Sintaxe aceita: [N]dM, números inteiros e operadores + / -
       Ex.: "2d6+3", "1d20+5", "4d8-2", "1d20+1d6+2", "10"        */
    const parseFormula = (raw) => {
      const clean = String(raw ?? '').replace(/\s+/g, '').toLowerCase();
      if (!clean) return { error: 'Digite uma fórmula para rolar.' };
      if (!/^[0-9d+\-]+$/.test(clean)) {
        return { error: 'Caracteres inválidos. Use apenas números, "d", "+" e "-".' };
      }

      const tokens = clean.match(/[+-]?[^+-]+/g);
      if (!tokens) return { error: 'Fórmula inválida.' };

      const terms = [];
      for (const token of tokens) {
        let body = token;
        let sign = 1;
        if (body.startsWith('+')) body = body.slice(1);
        else if (body.startsWith('-')) { sign = -1; body = body.slice(1); }
        if (!body) return { error: 'Fórmula inválida: operador sem termo.' };

        const diceMatch = body.match(/^(\d*)d(\d+)$/);
        if (diceMatch) {
          const count = diceMatch[1] === '' ? 1 : Number(diceMatch[1]);
          const faces = Number(diceMatch[2]);
          if (count < 1 || count > MAX_DICE) {
            return { error: `Quantidade de dados deve ficar entre 1 e ${MAX_DICE}.` };
          }
          if (faces < 2 || faces > MAX_FACES) {
            return { error: `Lados do dado devem ficar entre 2 e ${MAX_FACES}.` };
          }
          terms.push({ kind: 'dice', sign, count, faces });
        } else if (/^\d+$/.test(body)) {
          const value = Number(body);
          if (value > 100000) return { error: 'Modificador numérico muito alto.' };
          terms.push({ kind: 'flat', sign, value });
        } else {
          return { error: `Termo inválido: "${body}".` };
        }
      }

      if (!terms.length) return { error: 'Fórmula inválida.' };
      return { terms };
    };

    /** Executa os termos sorteados e devolve total + detalhamento. */
    const rollTerms = (terms) => {
      let total = 0;
      const parts = [];

      for (const term of terms) {
        if (term.kind === 'flat') {
          total += term.sign * term.value;
          parts.push({
            label: `${term.sign < 0 ? '−' : ''}${term.value}`,
            rolls: null
          });
          continue;
        }

        const rolls = [];
        let sum = 0;
        for (let i = 0; i < term.count; i += 1) {
          const r = 1 + Math.floor(Math.random() * term.faces);
          rolls.push(r);
          sum += r;
        }
        total += term.sign * sum;
        parts.push({
          label: `${term.sign < 0 ? '−' : ''}${term.count}d${term.faces}`,
          rolls,
          sum,
          sign: term.sign
        });
      }

      return { total, parts };
    };

    /** Monta a string de detalhamento exibida abaixo do total. */
    const formatDetail = (parts) => parts.map((p) => {
      if (!p.rolls) return p.label;
      const joined = p.rolls.join(', ');
      return `${p.label} [${joined}]`;
    }).join('  |  ');

    /* ---- Histórico ---- */
    const renderHistory = () => {
      if (!historyEl) return;
      if (!history.length) {
        historyEl.innerHTML = '<li class="empty-state">Nenhuma rolagem registrada ainda.</li>';
        return;
      }
      historyEl.innerHTML = history.map((item) => `
        <li class="history-item">
          <div class="history-meta">
            <span class="history-formula">${escapeHTML(item.formula)}</span>
            <span class="history-time">${escapeHTML(formatTime(item.timestamp))}</span>
          </div>
          <span class="history-total">${escapeHTML(String(item.total))}</span>
        </li>
      `).join('');
    };

    const pushHistory = (formula, total) => {
      history.unshift({ id: uid(), formula, total, timestamp: Date.now() });
      if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
      writeJSON(STORAGE_KEYS.history, history);
      renderHistory();
    };

    const clearHistory = async () => {
      if (!history.length) { showToast('O histórico já está vazio.'); return; }
      const ok = await confirmAction(
        'Limpar histórico',
        'Todas as rolagens registradas serão removidas definitivamente. Continuar?',
        'Limpar'
      );
      if (!ok) return;
      history = [];
      writeJSON(STORAGE_KEYS.history, history);
      renderHistory();
      showToast('Histórico limpo.', 'success');
    };

    /* ---- Interface de rolagem ---- */
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    const hideError = () => {
      if (!errorEl) return;
      errorEl.hidden = true;
      errorEl.textContent = '';
    };

    /** Anima a área de resultado e, ao final, exibe o total obtido. */
    const animateRoll = (formula, result) => new Promise((resolve) => {
      if (!resultEl) { resolve(); return; }
      resultEl.classList.add('is-rolling');
      resultEl.innerHTML = '<p class="rolling-text">🎲 rolando…</p>';
      window.setTimeout(() => {
        resultEl.classList.remove('is-rolling');
        resultEl.innerHTML = `
          <p class="result-formula">${escapeHTML(formula)}</p>
          <p class="result-total">${escapeHTML(String(result.total))}</p>
          <p class="result-detail">${escapeHTML(formatDetail(result.parts))}</p>
        `;
        resolve();
      }, 520);
    });

    /** Rola uma fórmula digitada/externa. */
    const roll = async (rawFormula, { silent = false } = {}) => {
      if (rolling) return;
      const parsed = parseFormula(rawFormula);
      if (parsed.error) {
        showError(parsed.error);
        return;
      }
      hideError();

      rolling = true;
      const result = rollTerms(parsed.terms);
      await animateRoll(String(rawFormula).trim(), result);
      pushHistory(String(rawFormula).trim(), result.total);
      rolling = false;
      if (!silent) showToast(`Resultado: ${result.total}`, 'success');
    };

    const bind = () => {
      // Dados rápidos
      quickWrap?.addEventListener('click', (e) => {
        const btn = e.target.closest('.die-btn');
        if (!btn) return;
        const faces = btn.dataset.die;
        if (inputEl) inputEl.value = `1d${faces}`;
        roll(`1d${faces}`);
      });

      // Fórmula personalizada
      formEl?.addEventListener('submit', (e) => {
        e.preventDefault();
        roll(inputEl?.value ?? '');
      });

      inputEl?.addEventListener('input', hideError);

      clearBtn?.addEventListener('click', clearHistory);

      renderHistory();
    };

    return { bind };
  })();

  /* ==========================================================
     6. MÓDULO: FICHAS DE PERSONAGEM
     ========================================================== */

  const Sheets = (() => {
    const ATTRS = [
      { key: 'for', label: 'Força',        abbr: 'FOR' },
      { key: 'des', label: 'Destreza',     abbr: 'DES' },
      { key: 'con', label: 'Constituição', abbr: 'CON' },
      { key: 'int', label: 'Inteligência', abbr: 'INT' },
      { key: 'sab', label: 'Sabedoria',    abbr: 'SAB' },
      { key: 'car', label: 'Carisma',      abbr: 'CAR' }
    ];

    const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    // Referências do DOM
    const systemSelect  = $('#systemSelect');
    const attrsGrid     = $('#attrsGrid');
    const systemPanel   = $('#systemPanel');
    const attackBody    = $('#attackBody');
    const btnAddAttack  = $('#btnAddAttack');
    const savedListEl   = $('#savedSheets');

    const nameInput     = $('#charName');
    const raceInput     = $('#charRace');
    const classInput    = $('#charClass');
    const levelInput    = $('#charLevel');
    const inventoryArea = $('#charInventory');

    const btnNew  = $('#btnNewSheet');
    const btnLoad = $('#btnLoadSheet');
    const btnSave = $('#btnSaveSheet');

    // Estado do módulo
    let savedSheets = readJSON(STORAGE_KEYS.sheets, []);
    if (!Array.isArray(savedSheets)) savedSheets = [];
    let selectedSheetId = null;

    /* ---- Fábrica de ficha vazia (mantém ambos os sistemas) ---- */
    const emptySheet = (system = 'dnd5e') => ({
      id: null,
      name: '',
      system,
      race: '',
      klass: '',
      level: 1,
      attrs: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
      dnd: {
        hp: 0,
        hpMax: 0,
        ca: 10,
        prof: 2,
        speed: 9,
        slots: SLOT_LEVELS.map(() => ({ total: 0, used: 0 }))
      },
      t20: { pv: 0, pvMax: 0, pm: 0, pmMax: 0, defesa: 10 },
      attacks: [],
      inventory: ''
    });

    let current = emptySheet();

    /* ---- Cálculos ---- */
    /** Modificador D&D/T20: floor((valor - 10) / 2). */
    const abilityMod = (value) => Math.floor((Number(value) - 10) / 2);

    /** Bônus de proficiência sugerido pelo nível (D&D 5e). */
    const profBonusFor = (level) => 2 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 4);

    const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

    /* ---- Renderização: atributos ---- */
    const renderAttrs = () => {
      if (!attrsGrid) return;
      attrsGrid.innerHTML = ATTRS.map((attr) => {
        const value = current.attrs[attr.key] ?? 10;
        const mod = abilityMod(value);
        const modClass = mod > 0 ? 'is-positive' : mod < 0 ? 'is-negative' : '';
        return `
          <div class="attr-box">
            <label for="attr-${attr.key}">${attr.abbr} — ${attr.label}</label>
            <input type="number" id="attr-${attr.key}" min="1" max="40"
                   value="${escapeHTML(String(value))}" data-attr="${attr.key}"
                   aria-label="${attr.label}">
            <span class="attr-mod ${modClass}" data-mod-for="${attr.key}">${signed(mod)}</span>
          </div>
        `;
      }).join('');
    };

    /** Atualiza apenas os badges de modificador (sem re-render completo). */
    const refreshModBadges = () => {
      ATTRS.forEach((attr) => {
        const badge = attrsGrid?.querySelector(`[data-mod-for="${attr.key}"]`);
        if (!badge) return;
        const mod = abilityMod(current.attrs[attr.key]);
        badge.textContent = signed(mod);
        badge.classList.toggle('is-positive', mod > 0);
        badge.classList.toggle('is-negative', mod < 0);
      });
    };

    /* ---- Renderização: painel específico de sistema ---- */
    const renderSystemPanel = () => {
      if (!systemPanel) return;

      if (current.system === 'dnd5e') {
        const dnd = current.dnd;
        systemPanel.innerHTML = `
          <h2 class="card-title"><span aria-hidden="true">🛡️</span> Estatísticas — D&amp;D 5e</h2>

          <div class="stat-grid">
            <div class="stat-box">
              <label for="dndHp">HP atual</label>
              <input type="number" id="dndHp" data-bind="dnd.hp" value="${dnd.hp}">
            </div>
            <div class="stat-box">
              <label for="dndHpMax">HP máximo</label>
              <input type="number" id="dndHpMax" data-bind="dnd.hpMax" value="${dnd.hpMax}">
            </div>
            <div class="stat-box">
              <label for="dndCa">Classe de Armadura (CA)</label>
              <input type="number" id="dndCa" data-bind="dnd.ca" value="${dnd.ca}">
            </div>
            <div class="stat-box">
              <label for="dndProf">Bônus de Proficiência</label>
              <input type="number" id="dndProf" data-bind="dnd.prof" value="${dnd.prof}">
            </div>
            <div class="stat-box">
              <label for="dndSpeed">Deslocamento (m)</label>
              <input type="number" id="dndSpeed" data-bind="dnd.speed" value="${dnd.speed}">
            </div>
          </div>

          <h3 class="sub-title">Espaços de Magia</h3>
          <div class="slots-grid">
            ${SLOT_LEVELS.map((lvl, i) => {
              const slot = dnd.slots[i] ?? { total: 0, used: 0 };
              return `
                <div class="slot-box">
                  <span>Nível ${lvl}</span>
                  <div class="stat-pair">
                    <label class="sr-only" for="slotTotal${lvl}">Slots totais nível ${lvl}</label>
                    <input type="number" id="slotTotal${lvl}" min="0" max="20"
                           data-bind="dnd.slots.${i}.total" value="${slot.total}"
                           title="Total de espaços" aria-label="Total de espaços nível ${lvl}">
                    <label class="sr-only" for="slotUsed${lvl}">Slots usados nível ${lvl}</label>
                    <input type="number" id="slotUsed${lvl}" min="0" max="20"
                           data-bind="dnd.slots.${i}.used" value="${slot.used}"
                           title="Espaços usados" aria-label="Espaços usados nível ${lvl}">
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        return;
      }

      // Tormenta 20
      const t20 = current.t20;
      systemPanel.innerHTML = `
        <h2 class="card-title"><span aria-hidden="true">🔥</span> Estatísticas — Tormenta 20</h2>

        <div class="stat-grid">
          <div class="stat-box">
            <label for="t20Pv">PV atual</label>
            <input type="number" id="t20Pv" data-bind="t20.pv" value="${t20.pv}">
          </div>
          <div class="stat-box">
            <label for="t20PvMax">PV máximo</label>
            <input type="number" id="t20PvMax" data-bind="t20.pvMax" value="${t20.pvMax}">
          </div>
          <div class="stat-box">
            <label for="t20Pm">PM atual</label>
            <input type="number" id="t20Pm" data-bind="t20.pm" value="${t20.pm}">
          </div>
          <div class="stat-box">
            <label for="t20PmMax">PM máximo</label>
            <input type="number" id="t20PmMax" data-bind="t20.pmMax" value="${t20.pmMax}">
          </div>
          <div class="stat-box">
            <label for="t20Def">Defesa</label>
            <input type="number" id="t20Def" data-bind="t20.defesa" value="${t20.defesa}">
          </div>
        </div>

        <p class="reminder">
          ⚔️ <strong>Lembrete T20:</strong> testes de perícia e ataques somam
          <strong>metade do nível</strong> (arredondado para baixo).
          Nível ${Number(current.level) || 1} → bônus de
          <strong>+${Math.floor((Number(current.level) || 1) / 2)}</strong>.
        </p>
      `;
    };

    /* ---- Renderização: tabela de ataques ---- */
    const renderAttacks = () => {
      if (!attackBody) return;
      if (!current.attacks.length) {
        attackBody.innerHTML = `
          <tr><td colspan="4" class="empty-state">Nenhuma arma registrada. Adicione abaixo.</td></tr>
        `;
        return;
      }
      attackBody.innerHTML = current.attacks.map((atk, i) => `
        <tr data-attack-id="${escapeHTML(atk.id)}">
          <td><input type="text" data-attack-field="name"   data-attack-index="${i}"
                     value="${escapeHTML(atk.name)}" placeholder="Ex.: Espada longa"
                     aria-label="Nome da arma ${i + 1}"></td>
          <td><input type="text" data-attack-field="damage" data-attack-index="${i}"
                     value="${escapeHTML(atk.damage)}" placeholder="1d8+3"
                     aria-label="Dano da arma ${i + 1}"></td>
          <td><input type="text" data-attack-field="bonus"  data-attack-index="${i}"
                     value="${escapeHTML(atk.bonus)}" placeholder="+5"
                     aria-label="Bônus de ataque da arma ${i + 1}"></td>
          <td>
            <button type="button" class="row-remove" data-remove-attack="${i}"
                    title="Remover arma" aria-label="Remover arma ${i + 1}">✕</button>
          </td>
        </tr>
      `).join('');
    };

    /* ---- Renderização: identidade + inventário ---- */
    const renderIdentity = () => {
      if (nameInput)     nameInput.value = current.name;
      if (raceInput)     raceInput.value = current.race;
      if (classInput)    classInput.value = current.klass;
      if (levelInput)    levelInput.value = current.level;
      if (inventoryArea) inventoryArea.value = current.inventory;
      if (systemSelect)  systemSelect.value = current.system;
    };

    /* ---- Renderização completa ---- */
    const renderAll = () => {
      renderIdentity();
      renderAttrs();
      renderSystemPanel();
      renderAttacks();
    };

    /* ---- Lista de fichas salvas ---- */
    const renderSaved = () => {
      if (!savedListEl) return;
      if (!savedSheets.length) {
        savedListEl.innerHTML = '<li class="empty-state">Nenhuma ficha salva ainda.</li>';
        return;
      }
      savedListEl.innerHTML = savedSheets.map((sheet) => {
        const systemLabel = sheet.system === 'dnd5e' ? 'D&D 5e' : 'Tormenta 20';
        const selected = sheet.id === selectedSheetId ? ' is-selected' : '';
        return `
          <li>
            <div class="saved-item${selected}" data-sheet-id="${escapeHTML(sheet.id)}"
                 role="button" tabindex="0"
                 aria-label="Selecionar ficha ${escapeHTML(sheet.name || 'sem nome')}">
              <div class="saved-info">
                <span class="saved-name">${escapeHTML(sheet.name || 'Sem nome')}</span>
                <span class="saved-sub">${systemLabel} · Nível ${escapeHTML(String(sheet.level))}</span>
              </div>
              <button type="button" class="saved-delete" data-delete-sheet="${escapeHTML(sheet.id)}"
                      title="Apagar ficha" aria-label="Apagar ficha ${escapeHTML(sheet.name || 'sem nome')}">🗑</button>
            </div>
          </li>
        `;
      }).join('');
    };

    /* ---- Ações ---- */
    const newSheet = async () => {
      const ok = await confirmAction(
        'Nova ficha',
        'Os dados não salvos no formulário atual serão perdidos. Criar uma nova ficha?',
        'Criar'
      );
      if (!ok) return;
      current = emptySheet(systemSelect?.value ?? 'dnd5e');
      selectedSheetId = null;
      renderAll();
      renderSaved();
      showToast('Nova ficha criada.', 'success');
    };

    const saveSheet = async () => {
      const name = (nameInput?.value ?? '').trim();
      if (!name) {
        showToast('Informe um nome para o personagem antes de salvar.', 'error');
        nameInput?.focus();
        return;
      }

      // Coleta o estado atual do DOM para o objeto
      syncFromDOM();
      current.name = name;

      // Já existe uma ficha com esse nome e não é a atual? Confirma sobrescrita.
      const sameName = savedSheets.find((s) => s.id !== current.id && s.name.toLowerCase() === name.toLowerCase());

      const isEditing = Boolean(current.id);
      const message = sameName
        ? `Já existe uma ficha chamada "${sameName.name}". Deseja sobrescrevê-la?`
        : isEditing
          ? `Atualizar a ficha "${current.name}"?`
          : `Salvar a ficha "${current.name}"?`;

      const ok = await confirmAction('Salvar ficha', message, 'Salvar');
      if (!ok) return;

      const record = JSON.parse(JSON.stringify(current));
      if (!record.id) record.id = uid();
      record.updatedAt = Date.now();

      if (sameName) {
        // Substitui a ficha de mesmo nome
        const idx = savedSheets.findIndex((s) => s.id === sameName.id);
        savedSheets[idx] = { ...record, id: sameName.id };
        current.id = sameName.id;
      } else {
        const idx = savedSheets.findIndex((s) => s.id === record.id);
        if (idx >= 0) savedSheets[idx] = record;
        else savedSheets.unshift(record);
        current.id = record.id;
      }

      const okWrite = writeJSON(STORAGE_KEYS.sheets, savedSheets);
      renderSaved();
      showToast(
        okWrite ? `Ficha "${record.name}" salva.` : 'Ficha salva apenas em memória (storage indisponível).',
        okWrite ? 'success' : 'error'
      );
    };

    const loadSheet = async (id) => {
      const target = id ?? selectedSheetId;
      if (!target) {
        showToast('Selecione uma ficha na lista para carregar.', 'error');
        return;
      }
      const sheet = savedSheets.find((s) => s.id === target);
      if (!sheet) { showToast('Ficha não encontrada.', 'error'); return; }

      // Garante compatibilidade com fichas antigas / campos ausentes
      const base = emptySheet(sheet.system);
      current = {
        ...base,
        ...sheet,
        attrs:   { ...base.attrs,   ...(sheet.attrs   || {}) },
        dnd:     { ...base.dnd,     ...(sheet.dnd     || {}),
                   slots: Array.isArray(sheet.dnd?.slots)
                     ? base.dnd.slots.map((s, i) => ({ ...s, ...(sheet.dnd.slots[i] || {}) }))
                     : base.dnd.slots },
        t20:     { ...base.t20,     ...(sheet.t20     || {}) },
        attacks: Array.isArray(sheet.attacks) ? sheet.attacks : []
      };

      selectedSheetId = current.id;
      renderAll();
      renderSaved();
      showToast(`Ficha "${current.name}" carregada.`, 'success');
    };

    const deleteSheet = async (id) => {
      const sheet = savedSheets.find((s) => s.id === id);
      if (!sheet) return;
      const ok = await confirmAction(
        'Apagar ficha',
        `A ficha "${sheet.name}" será removida permanentemente. Continuar?`,
        'Apagar'
      );
      if (!ok) return;

      savedSheets = savedSheets.filter((s) => s.id !== id);
      if (selectedSheetId === id) selectedSheetId = null;
      if (current.id === id) current.id = null;
      writeJSON(STORAGE_KEYS.sheets, savedSheets);
      renderSaved();
      showToast('Ficha apagada.', 'success');
    };

    /* ---- Sincronização DOM → estado ---- */
    /** Lê os campos de identidade, ataques e inventário para `current`. */
    const syncFromDOM = () => {
      if (nameInput)     current.name      = nameInput.value;
      if (raceInput)     current.race      = raceInput.value;
      if (classInput)    current.klass     = classInput.value;
      if (levelInput)    current.level     = Math.max(1, Number(levelInput.value) || 1);
      if (inventoryArea) current.inventory = inventoryArea.value;
    };

    /* ---- Bindings ---- */
    const bind = () => {
      // Troca de sistema: preserva os dados de ambos no objeto
      systemSelect?.addEventListener('change', () => {
        syncFromDOM();
        current.system = systemSelect.value;
        renderSystemPanel();
      });

      // Identidade
      nameInput?.addEventListener('input', () => { current.name = nameInput.value; });
      raceInput?.addEventListener('input', () => { current.race = raceInput.value; });
      classInput?.addEventListener('input', () => { current.klass = classInput.value; });

      // Nível: recalcula bônus de proficiência (D&D) e lembrete (T20)
      levelInput?.addEventListener('input', () => {
        const lvl = Math.max(1, Math.min(20, Number(levelInput.value) || 1));
        current.level = lvl;
        current.dnd.prof = profBonusFor(lvl);
        renderSystemPanel();
      });

      inventoryArea?.addEventListener('input', () => {
        current.inventory = inventoryArea.value;
      });

      // Atributos (delegação de evento)
      attrsGrid?.addEventListener('input', (e) => {
        const input = e.target.closest('[data-attr]');
        if (!input) return;
        const key = input.dataset.attr;
        const raw = Number(input.value);
        current.attrs[key] = Number.isFinite(raw) ? raw : 10;
        refreshModBadges();
      });

      // Campos do painel de sistema (delegação com data-bind)
      systemPanel?.addEventListener('input', (e) => {
        const el = e.target.closest('[data-bind]');
        if (!el) return;
        const value = el.type === 'number' ? Number(el.value) || 0 : el.value;
        setPath(current, el.dataset.bind, value);
      });

      // Ataques: adicionar
      btnAddAttack?.addEventListener('click', () => {
        current.attacks.push({ id: uid(), name: '', damage: '', bonus: '' });
        renderAttacks();
        // Foca no primeiro campo da linha recém-criada
        const rows = attackBody?.querySelectorAll('tr');
        rows?.[rows.length - 1]?.querySelector('input')?.focus();
      });

      // Ataques: editar e remover (delegação)
      attackBody?.addEventListener('input', (e) => {
        const input = e.target.closest('[data-attack-field]');
        if (!input) return;
        const idx = Number(input.dataset.attackIndex);
        const field = input.dataset.attackField;
        if (current.attacks[idx]) current.attacks[idx][field] = input.value;
      });

      attackBody?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-attack]');
        if (!btn) return;
        const idx = Number(btn.dataset.removeAttack);
        current.attacks.splice(idx, 1);
        renderAttacks();
      });

      // Barra de ações
      btnNew?.addEventListener('click', newSheet);
      btnSave?.addEventListener('click', saveSheet);
      btnLoad?.addEventListener('click', () => loadSheet());

      // Lista de fichas salvas
      savedListEl?.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-delete-sheet]');
        if (delBtn) {
          e.stopPropagation();
          deleteSheet(delBtn.dataset.deleteSheet);
          return;
        }
        const item = e.target.closest('[data-sheet-id]');
        if (!item) return;
        selectedSheetId = item.dataset.sheetId;
        renderSaved();
      });

      savedListEl?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('[data-sheet-id]');
        if (!item) return;
        e.preventDefault();
        selectedSheetId = item.dataset.sheetId;
        renderSaved();
        loadSheet(selectedSheetId);
      });

      // Duplo clique carrega direto — atalho de conveniência
      savedListEl?.addEventListener('dblclick', (e) => {
        const item = e.target.closest('[data-sheet-id]');
        if (item) loadSheet(item.dataset.sheetId);
      });

      renderAll();
      renderSaved();
    };

    return { bind };
  })();

  /* ==========================================================
     7. MÓDULO: FERRAMENTAS DO MESTRE
     ========================================================== */

  const GM = (() => {
    /* ---- Dados para o gerador de NPC ---- */
    const NPC_NAMES = [
      'Alaric Vento-Negro', 'Bruma de Ferro', 'Célia Sombraverde', 'Doran Martelo-Rúnico',
      'Elara Luar-de-Prata', 'Fenrir Cinza-Fria', 'Gwendolyn Folha-Alta', 'Halvard Três-Dedos',
      'Iria Canto-de-Cobre', 'Jorund Barba-de-Gelo', 'Kaelen Olho-de-Corvo', 'Lyra Chama-Pálida',
      'Maelis Véu-Noturno', 'Nerys Passo-Leve', 'Ordo Punho-de-Pedra', 'Perrin Dente-de-Lobo',
      'Quíntia Véu-Dourado', 'Rurik Sangue-de-Sal', 'Selene Voz-de-Trovão', 'Torvald Pé-de-Vento',
      'Ulrica Mão-de-Ferro', 'Vasco Lâmina-Torta', 'Wren Sopro-de-Fada', 'Yara Chifre-de-Onix'
    ];

    const NPC_TRAITS = [
      'Fala com sotaque arrastado e nunca olha nos olhos.',
      'Coleciona botões de metal e oferece um a cada novo conhecido.',
      'Ri alto em momentos completamente inapropriados.',
      'Tem medo irracional de gatos — qualquer gato.',
      'Repete a última palavra que ouve antes de responder.',
      'Sempre carrega um mapa que jura estar desatualizado.',
      'Desconfia de magia, mas usa um amuleto "que não é mágico".',
      'Fuma um cachimbo que solta fumaça colorida por acidente.',
      'Conta vantagem sobre feitos que claramente não realizou.',
      'Fala baixo, forçando os outros a se aproximarem.',
      'Oferece comida a estranhos como forma de avaliação.',
      'Tem uma cicatriz que inventa uma história diferente a cada vez.',
      'Nunca bebe álcool — e explica o motivo em detalhes.',
      'Escreve tudo o que ouve num caderninho surrado.',
      'Trata animais como se fossem nobres de linhagem antiga.',
      'Responde perguntas com outras perguntas.',
      'Assobia sempre a mesma melodia desafinada.',
      'Guarda moedas numa bolsa que chacoalha alto demais.',
      'É obcecado por ordem alfabética — inclusive de nomes.',
      'Finge não entender o idioma comum quando lhe convém.',
      'Sempre chega cinco minutos atrasado, sem falhar.',
      'Acredita que tem sorte e culpa o destino por tudo.',
      'Fala de si mesmo na terceira pessoa.',
      'Tem um tique de bater no ombro esquerdo antes de mentir.'
    ];

    /* ---- Referências do DOM ---- */
    const initForm   = $('#initForm');
    const initNameIn = $('#initName');
    const initValIn  = $('#initValue');
    const initList   = $('#initList');
    const btnSort    = $('#btnSortInit');
    const btnNext    = $('#btnNextTurn');
    const btnClear   = $('#btnClearInit');

    const npcNameEl  = $('#npcName');
    const npcTraitEl = $('#npcTrait');
    const npcCard    = $('#npcCard');
    const btnNpc     = $('#btnNpc');

    /* ---- Estado ---- */
    let combatants = readJSON(STORAGE_KEYS.initiative, []);
    if (!Array.isArray(combatants)) combatants = [];
    let turnIndex = combatants.length ? 0 : -1;

    /* ---- Persistência ---- */
    const persist = () => writeJSON(STORAGE_KEYS.initiative, combatants);

    /* ---- Renderização da iniciativa ---- */
    const renderInit = () => {
      if (!initList) return;
      if (!combatants.length) {
        initList.innerHTML = '<li class="empty-state">Nenhum combatente na ordem. Adicione acima.</li>';
        return;
      }
      initList.innerHTML = combatants.map((c, i) => {
        const isCurrent = i === turnIndex;
        return `
          <li class="init-item${isCurrent ? ' is-current' : ''}">
            <span class="init-index">${i + 1}</span>
            <span class="init-name">${escapeHTML(c.name)}</span>
            ${isCurrent ? '<span class="init-badge">Turno</span>' : ''}
            <span class="init-value">${escapeHTML(String(c.init))}</span>
            <button type="button" class="row-remove" data-remove-init="${escapeHTML(c.id)}"
                    title="Remover combatente"
                    aria-label="Remover ${escapeHTML(c.name)} da iniciativa">✕</button>
          </li>
        `;
      }).join('');
    };

    /* ---- Ações ---- */
    const addCombatant = (name, init) => {
      combatants.push({ id: uid(), name: name.trim(), init: Number(init) || 0 });
      if (turnIndex === -1) turnIndex = 0;
      sortCombatants();
      persist();
      renderInit();
    };

    /** Ordena por iniciativa decrescente; empate mantém ordem alfabética. */
    const sortCombatants = () => {
      combatants.sort((a, b) => (b.init - a.init) || a.name.localeCompare(b.name, 'pt-BR'));
      if (combatants.length) turnIndex = Math.min(Math.max(turnIndex, 0), combatants.length - 1);
      else turnIndex = -1;
    };

    const nextTurn = () => {
      if (!combatants.length) { showToast('Nenhum combatente na ordem.', 'error'); return; }
      turnIndex = (turnIndex + 1) % combatants.length;
      persist();
      renderInit();
    };

    const clearInitiative = async () => {
      if (!combatants.length) { showToast('A ordem já está vazia.'); return; }
      const ok = await confirmAction(
        'Limpar iniciativa',
        'Todos os combatentes serão removidos da ordem. Continuar?',
        'Limpar'
      );
      if (!ok) return;
      combatants = [];
      turnIndex = -1;
      persist();
      renderInit();
      showToast('Ordem de iniciativa limpa.', 'success');
    };

    const removeCombatant = (id) => {
      const idx = combatants.findIndex((c) => c.id === id);
      if (idx < 0) return;
      combatants.splice(idx, 1);
      if (turnIndex >= combatants.length) turnIndex = combatants.length ? 0 : -1;
      persist();
      renderInit();
    };

    /* ---- Gerador de NPC ---- */
    const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const generateNPC = () => {
      if (!npcNameEl || !npcTraitEl) return;
      npcNameEl.textContent  = randomFrom(NPC_NAMES);
      npcTraitEl.textContent = randomFrom(NPC_TRAITS);
      // Reinicia a animação removendo/reflow/adding a classe
      if (npcCard) {
        npcCard.classList.remove('is-refreshing');
        void npcCard.offsetWidth; // força reflow
        npcCard.classList.add('is-refreshing');
      }
    };

    /* ---- Bindings ---- */
    const bind = () => {
      initForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (initNameIn?.value ?? '').trim();
        if (!name) { showToast('Informe o nome do combatente.', 'error'); initNameIn?.focus(); return; }
        addCombatant(name, initValIn?.value ?? 0);
        if (initNameIn) initNameIn.value = '';
        if (initValIn)  initValIn.value = '10';
        initNameIn?.focus();
        showToast('Combatente adicionado.', 'success');
      });

      btnSort?.addEventListener('click', () => {
        sortCombatants();
        persist();
        renderInit();
        showToast('Ordem reorganizada.', 'success');
      });

      btnNext?.addEventListener('click', nextTurn);
      btnClear?.addEventListener('click', clearInitiative);

      initList?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-init]');
        if (!btn) return;
        removeCombatant(btn.dataset.removeInit);
      });

      btnNpc?.addEventListener('click', generateNPC);

      // Estado inicial
      sortCombatants();
      renderInit();
      generateNPC();
    };

    return { bind };
  })();

  /* ==========================================================
     8. BOOTSTRAP
     ========================================================== */

  const init = () => {
    // Banner de aviso quando não há persistência
    const banner = $('#storageBanner');
    if (banner && !storageAvailable) banner.hidden = false;

    initTabs();
    Dice.bind();
    Sheets.bind();
    GM.bind();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();