/* Quest window, one view for everyone. */
import { MODULE_ID, L, STATUS, LIVE, DONE, TABS, TYPES, quests, mutate, blank, clean, importJournal } from './store.js';

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const on = (root, evt, sel, fn) => root.addEventListener(evt, (ev) => { const t = ev.target.closest(sel); if (t && root.contains(t)) fn(t, ev); }); /* delegated listener */
const btn = (act, inner, extra = '') => `<button type="button" data-act="${act}" ${extra}>${inner}</button>`;
const dot = (k) => k === 'gold' ? `<span class="dot star" style="color:${STATUS.gold.color}">&#9733;</span>` : `<span class="dot" style="background:${STATUS[k].color}"></span>`;
const label = (k) => L(`Status.${k}`);
const help = () => [...TABS.map((t) => `${t === 'all' ? '' : dot(t === 'done' ? 'gold' : t)} <b>${L(`Tab.${t}`)}</b>: ${L(`Help.${t}`)}`), '', ...TYPES.map((t) => `<b>${L(`Type.${t}`)}</b>: ${L(`Help.${t}`)}`), '', L('Help.note')].join('<br>');

export class QuestTrackerApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'vqt-app', classes: ['vqt'], window: { title: 'VQT.Title', resizable: true, minimizable: true }, position: { width: 380, height: 460 } };

  constructor(...args) {
    super(...args);
    this.tab = 'green';
    this.hide = { objective: false, interlude: false }; /* type filters */
    this.edit = false; /* GM edit mode */
    this.editing = null; /* quest id being edited */
    this.draft = null; /* unsaved new quest */
    this.ask = null; /* { id, kind: finish | delete } */
  }

  async _renderHTML() { return this.html(); }
  _replaceHTML(html, content) { const top = content.querySelector('[data-keep]')?.scrollTop ?? 0; content.innerHTML = html; const el = content.querySelector('[data-keep]'); if (el) el.scrollTop = top; }
  _onFirstRender() { this.bind(this.element); } /* frame persists, content swaps */

  visible() {
    const t = this.tab, want = (q) => t === 'done' ? DONE.includes(q.status) : t === 'all' ? LIVE.includes(q.status) : q.status === t;
    return quests().filter((q) => want(q) && !(t !== 'done' && this.hide[q.type]));
  }

  html() {
    const gm = game.user.isGM, accent = (t) => STATUS[t]?.color ?? '#ffaa00';
    const tabs = TABS.map((t) => `<a class="qtab ${this.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}" style="${this.tab === t ? `color:${accent(t)};border-color:${accent(t)}` : ''}">${L(`Tab.${t}`)}</a>`).join(''); /* .tab and .active are Foundry's */
    const tools = gm ? btn('edit', '<i class="fas fa-feather-pointed"></i>', `class="ic ${this.edit ? 'on' : ''}" title="${L('Edit')}"`) : '';
    // const tools = gm ? btn('import', '<i class="fas fa-file-import"></i>', `class="ic" title="${L('Import')}"`) + btn('edit', '<i class="fas fa-feather-pointed"></i>', `class="ic ${this.edit ? 'on' : ''}" title="${L('Edit')}"`) : ''; /* legacy import, ran once 2026-09-11 */
    const add = !this.edit ? '' : this.draft ? this.editor(this.draft, true) : btn('add', `<i class="fas fa-plus"></i> ${L('Add')}`, 'class="add"');
    const rows = this.visible().map((q) => this.editing === q.id ? this.editor(q) : this.card(q)).join('');
    const filters = ['objective', 'interlude'].map((t) => `<label><input type="checkbox" data-act="hide" data-type="${t}" ${this.hide[t] ? 'checked' : ''}> ${L(`Hide.${t}`)}</label>`).join('');
    return `<div class="head">${filters}<span class="tools">${tools}</span><span class="qhelp" data-tooltip="${esc(help())}">?</span></div>
      <nav class="qtabs">${tabs}</nav>
      <div class="list" data-keep="list">${add}${rows || `<p class="empty">${L(`Empty.${this.tab}`)}</p>`}</div>`;
  }

  /* View card; edit mode adds dots, flag, pen. */
  card(q) {
    const s = STATUS[q.status], id = `data-id="${q.id}"`;
    const picks = LIVE.map((k) => btn('status', '', `class="pick ${q.status === k ? 'cur' : ''}" ${id} data-status="${k}" style="background:${STATUS[k].color}" title="${label(k)}"`)).join('');
    const tools = this.edit ? `<span class="tools">${picks}${btn('finish', '<i class="fas fa-flag-checkered"></i>', `class="ic" ${id} title="${L('Finish')}"`)}${btn('pen', '<i class="fas fa-pen"></i>', `class="ic" ${id} title="${L('EditQuest')}"`)}</span>` : '';
    const ask = this.ask?.id === q.id ? `<div class="ask">${L('FinishAsk')} ${btn('status', `&#9733; ${label('gold')}`, `class="gold" ${id} data-status="gold"`)}${btn('status', label('red'), `class="red" ${id} data-status="red"`)}${btn('cancel', L('Cancel'))}</div>` : '';
    return `<div class="card ${q.note ? 'noted' : ''}" style="border-left-color:${s.color}" ${q.note ? `data-tooltip="${esc(q.note)}"` : ''}><div class="row">${dot(q.status)}<span class="type" style="color:${s.color}">${L(`Type.${q.type}`)}</span>${tools}</div><div class="name">${esc(q.name)}</div>${ask}</div>`;
  }

  /* In place editor; delete asks first. */
  editor(q, isNew = false) {
    const id = `data-id="${q.id}"`, types = TYPES.map((t) => `<option value="${t}" ${q.type === t ? 'selected' : ''}>${L(`Type.${t}`)}</option>`).join('');
    const foot = this.ask?.id === q.id ? `<div class="ask">${L('DeleteAsk')} ${btn('remove', L('Delete'), `class="red" ${id}`)}${btn('cancel', L('Cancel'))}</div>`
      : `<div class="row">${btn('save', `<i class="fas fa-save"></i> ${L('Save')}`, `class="gold" ${id}`)}${btn('cancel', L('Cancel'))}${isNew ? '' : btn('trash', '<i class="fas fa-trash"></i>', `class="ic" ${id} title="${L('Delete')}"`)}</div>`;
    return `<div class="card edit" data-edit="${q.id}" style="border-left-color:${STATUS[q.status].color}">
      <input type="text" name="name" maxlength="60" placeholder="${L('Name')}" value="${esc(q.name)}">
      <textarea name="note" maxlength="256" placeholder="${L('Note')}">${esc(q.note)}</textarea>
      <select name="type">${types}</select>${foot}</div>`;
  }

  bind(root) {
    on(root, 'change', '[data-act="hide"]', (el) => { this.hide[el.dataset.type] = el.checked; this.render(); });
    on(root, 'click', '[data-act]:not([data-act="hide"])', (el) => this.act(el.dataset.act, el.dataset));
    root.addEventListener('keydown', (ev) => { const card = ev.target.closest('[data-edit]'); if (!card) return; if (ev.key === 'Enter' && ev.target.name === 'name') this.act('save', { id: card.dataset.edit }); if (ev.key === 'Escape') this.act('cancel', {}); });
  }

  async act(act, ds) {
    if (!game.user.isGM && act !== 'tab') return;
    const map = {
      tab: () => { this.tab = ds.tab; this.ask = null; this.draft = null; },
      edit: () => { this.edit = !this.edit; this.editing = this.draft = this.ask = null; },
      add: () => { this.draft = blank(this.tab === 'done' ? 'gold' : this.tab === 'all' ? 'green' : this.tab); this.editing = this.ask = null; },
      pen: () => { this.editing = ds.id; this.draft = this.ask = null; },
      finish: () => { this.ask = { id: ds.id, kind: 'finish' }; },
      trash: () => { this.ask = { id: ds.id, kind: 'delete' }; },
      cancel: () => { if (this.ask) this.ask = null; else this.editing = this.draft = null; },
      status: () => this.setStatus(ds.id, ds.status),
      save: () => this.save(ds.id),
      remove: () => this.remove(ds.id),
      // import: () => this.import(), /* legacy import, button parked above */
    };
    if (!map[act]) return;
    await map[act]();
    this.render();
  }

  async setStatus(id, status) { await mutate((l) => { const q = l.find((q) => q.id === id); if (q) q.status = status; }); this.ask = null; }
  async remove(id) { await mutate((l) => l.findSplice((q) => q.id === id)); this.editing = this.ask = null; }

  /* Card fields in; new quests on top. */
  async save(id) {
    const el = this.element.querySelector(`[data-edit="${id}"]`), val = (n) => el?.querySelector(`[name="${n}"]`)?.value ?? '';
    const fields = { name: val('name'), note: val('note'), type: val('type') };
    if (!fields.name.trim()) return ui.notifications.warn(L('NeedName'));
    await mutate((l) => { const q = l.find((q) => q.id === id); if (q) Object.assign(q, clean({ ...q, ...fields })); else if (this.draft?.id === id) l.unshift(clean({ ...this.draft, ...fields })); });
    this.editing = this.draft = this.ask = null;
  }

  async import() {
    const [u = '', p = ''] = game.settings.get(MODULE_ID, 'legacy').split('|');
    const r = await DialogV2.prompt({ window: { title: L('Import') }, rejectClose: false,
      content: `<p>${L('ImportHint')}</p><input type="text" name="uuid" placeholder="JournalEntry.xxxxxxxxxxxxxxxx" value="${esc(u)}"><input type="text" name="page" placeholder="${L('PageName')}" value="${esc(p)}">`,
      ok: { label: L('Import'), callback: (ev, b) => ({ uuid: b.form.elements.uuid.value.trim(), page: b.form.elements.page.value.trim() }) } });
    if (!r?.uuid) return;
    await game.settings.set(MODULE_ID, 'legacy', `${r.uuid}|${r.page}`);
    try { ui.notifications.info(game.i18n.format('VQT.Imported', { n: await importJournal(r.uuid, r.page) })); }
    catch (e) { ui.notifications.error(e.message); }
  }
}
