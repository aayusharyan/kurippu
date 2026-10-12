/* Note reconciliation: causal revision metadata and merge helpers.
   Pure logic only: no storage or service-worker calls. Storage and Drive
   code depend on these functions through the shared builder. */
(function (root) {
  'use strict';

  const B = root.__KurippuBuilder;

  const REVISION_GROUPS = {
    content: ['text'],
    appearance: ['color', 'min', 'mode'],
    lifecycle: ['trashed', 'purged'],
  };

  /** Serialize values with sorted object keys for stable comparison. */
  B.canonical = function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(B.canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + B.canonical(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
  };

  /** Small deterministic hash for tie-breaking and legacy revision ids. */
  B.stableHash = function stableHash(value) {
    const text = typeof value === 'string' ? value : B.canonical(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  };

  /** Return the fields controlled by a revision group. */
  function groupValue(note, group) {
    const fixed = new Set(['id', 'created', 'updated', '_sync', ...REVISION_GROUPS.content,
      ...REVISION_GROUPS.appearance, ...REVISION_GROUPS.lifecycle]);
    const keys = group === 'placement'
      ? Object.keys(note).filter((k) => !fixed.has(k))
      : REVISION_GROUPS[group];
    const out = {};
    keys.sort().forEach((k) => { if (note[k] !== undefined) out[k] = note[k]; });
    return out;
  }

  /** Replace one revision group's fields without touching other groups. */
  function replaceGroup(target, source, group) {
    if (group === 'placement') {
      const fixed = new Set(['id', 'created', 'updated', '_sync', ...REVISION_GROUPS.content,
        ...REVISION_GROUPS.appearance, ...REVISION_GROUPS.lifecycle]);
      Object.keys(target).filter((key) => !fixed.has(key)).forEach((key) => delete target[key]);
    } else {
      REVISION_GROUPS[group].forEach((key) => delete target[key]);
    }
    Object.assign(target, groupValue(source, group));
  }

  /** Map a local patch's keys to the revision groups they change. */
  B.groupsForKeys = function groupsForKeys(keys) {
    const groups = new Set();
    keys.forEach((key) => {
      if (REVISION_GROUPS.content.includes(key)) groups.add('content');
      else if (REVISION_GROUPS.appearance.includes(key)) groups.add('appearance');
      else if (REVISION_GROUPS.lifecycle.includes(key)) groups.add('lifecycle');
      else if (!['id', 'created', 'updated', '_sync'].includes(key)) groups.add('placement');
    });
    return [...groups];
  };

  /** Attach deterministic revision metadata to a note, including legacy ones. */
  B.normalizeNote = function normalizeNote(note) {
    if (!note || typeof note !== 'object') return note;
    const copy = { ...note };
    const groups = {}, hashes = {};
    ['content', 'appearance', 'placement', 'lifecycle'].forEach((group) => {
      const current = note._sync && note._sync.groups && note._sync.groups[group];
      const hash = B.stableHash(groupValue(note, group));
      hashes[group] = hash;
      if (current && typeof current === 'object') {
        groups[group] = { ...current };
        const recorded = note._sync.hashes && note._sync.hashes[group];
        if (recorded && recorded !== hash) groups[group]['legacy:' + hash] = 1;
      } else {
        const legacy = 'legacy:' + B.stableHash([note.id, note.updated || 0, groupValue(note, group)]);
        groups[group] = { [legacy]: 1 };
      }
    });
    copy._sync = { v: 1, groups, hashes };
    return copy;
  };

  /** Compare version vectors; null means concurrent divergent edits. */
  B.compareVectors = function compareVectors(a, b) {
    let newer = false, older = false;
    new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((actor) => {
      const av = +(a && a[actor]) || 0, bv = +(b && b[actor]) || 0;
      if (av > bv) newer = true;
      if (av < bv) older = true;
    });
    if (newer && older) return null;
    if (newer) return 1;
    if (older) return -1;
    return 0;
  };

  /** Pick a winner by vector order, then by canonical value, then note A. */
  function pickWinningNote(noteA, noteB, order, valueA, valueB) {
    if (order === 1) return noteA;
    if (order === -1) return noteB;
    if (B.canonical(valueA) >= B.canonical(valueB)) return noteA;
    return noteB;
  }

  /** Merge actor counters from both sides of a group merge. */
  B.mergeVector = function mergeVector(a, b) {
    const out = {};
    new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((actor) => {
      out[actor] = Math.max(+(a && a[actor]) || 0, +(b && b[actor]) || 0);
    });
    return out;
  };

  /** Choose one group's fields by causality, then canonical tie-break. */
  function chooseGroup(a, b, group) {
    const av = a._sync.groups[group], bv = b._sync.groups[group];
    const order = B.compareVectors(av, bv);
    const aValue = groupValue(a, group), bValue = groupValue(b, group);
    const winner = pickWinningNote(a, b, order, aValue, bValue);
    return {
      value: groupValue(winner, group),
      vector: B.mergeVector(av, bv),
      concurrent: order === null && B.canonical(aValue) !== B.canonical(bValue),
      loser: winner === a ? b : a,
    };
  }

  /** Whether a value looks like a persistable note record. */
  B.validNote = function validNote(n) {
    return n && typeof n === 'object' && typeof n.id === 'string' && n.id.length < 64 &&
      (n.purged || (typeof n.text === 'string' && typeof n.url === 'string'));
  };

  /** Reject remote revision metadata that is malformed or oversized. */
  B.validRevision = function validRevision(note) {
    if (!note._sync) return true;
    if (note._sync.v !== 1 || !note._sync.groups || typeof note._sync.groups !== 'object') return false;
    return ['content', 'appearance', 'placement', 'lifecycle'].every((group) => {
      const vector = note._sync.groups[group];
      const actors = vector && typeof vector === 'object' ? Object.keys(vector) : [];
      const hash = note._sync.hashes && note._sync.hashes[group];
      return (!hash || (typeof hash === 'string' && hash.length <= 32)) &&
        actors.length > 0 && actors.length <= 64 && actors.every((actor) =>
          actor.length <= 96 && Number.isSafeInteger(vector[actor]) && vector[actor] > 0);
    });
  };

  /** Merge two versions of one note without relying on wall-clock time. */
  B.mergeNote = function mergeNote(left, right) {
    const a = B.normalizeNote(left), b = B.normalizeNote(right);
    if (!a) return b;
    if (!b) return a;
    const result = {
      id: a.id,
      created: Math.min(+a.created || Infinity, +b.created || Infinity),
      updated: Math.max(+a.updated || 0, +b.updated || 0),
      _sync: { v: 1, groups: {} },
    };
    const conflicts = [];
    ['content', 'appearance', 'placement', 'lifecycle'].forEach((group) => {
      let picked = chooseGroup(a, b, group);
      if (group === 'lifecycle' && (a.purged || b.purged)) {
        const tombstone = a.purged ? a : b;
        picked = { ...picked, value: groupValue(tombstone, group) };
      }
      Object.assign(result, picked.value);
      result._sync.groups[group] = picked.vector;
      if (group === 'content' && picked.concurrent) conflicts.push(picked.loser);
    });
    if (!Number.isFinite(result.created)) delete result.created;
    result._sync.hashes = {};
    ['content', 'appearance', 'placement', 'lifecycle'].forEach((group) => {
      result._sync.hashes[group] = B.stableHash(groupValue(result, group));
    });
    if (result.purged) {
      Object.keys(result).forEach((k) => {
        if (!['id', 'created', 'updated', 'purged', '_sync'].includes(k)) delete result[k];
      });
    }
    return { note: result, conflicts };
  };

  /** Merge note collections and keep conflict copies for concurrent text. */
  B.mergeNoteSets = function mergeNoteSets(...sets) {
    const byId = new Map(), conflictInputs = [];
    sets.flat().forEach((raw) => {
      if (!B.validNote(raw)) return;
      const current = byId.get(raw.id);
      if (!current) byId.set(raw.id, B.normalizeNote(raw));
      else {
        const merged = B.mergeNote(current, raw);
        byId.set(raw.id, merged.note);
        merged.conflicts.forEach((loser) => conflictInputs.push({ original: raw.id, loser }));
      }
    });
    conflictInputs.forEach(({ original, loser }) => {
      if (!loser || loser.purged || typeof loser.text !== 'string') return;
      const normalizedLoser = B.normalizeNote(loser);
      const suffix = B.stableHash([original, groupValue(normalizedLoser, 'content'), normalizedLoser._sync.groups.content]);
      const id = `${original.slice(0, 40)}:conflict:${suffix}`.slice(0, 63);
      if (byId.has(id)) return;
      const copy = B.normalizeNote({
        id, url: 'kurippu/conflicts', site: 'kurippu', path: '/conflicts',
        color: 'paper', created: parseInt(suffix, 36) || 1, updated: parseInt(suffix, 36) || 1,
        text: `${normalizedLoser.text}\n\n[Conflict copy of ${original}]`,
      });
      byId.set(id, copy);
    });
    return [...byId.values()];
  };

  /** Stamp locally changed groups with the worker's actor counter. */
  B.prepareLocalWrite = function prepareLocalWrite(existing, incoming, actor, counter, touchedGroups) {
    const old = existing ? B.normalizeNote(existing) : null;
    const next = B.normalizeNote({ ...incoming, updated: Date.now() });
    const inferred = old
      ? ['content', 'appearance', 'placement', 'lifecycle'].filter((group) =>
        B.canonical(groupValue(old, group)) !== B.canonical(groupValue(next, group)))
      : ['content', 'appearance', 'placement', 'lifecycle'];
    const touched = new Set(touchedGroups && touchedGroups.length ? touchedGroups : inferred);
    ['content', 'appearance', 'placement', 'lifecycle'].forEach((group) => {
      if (old && !touched.has(group)) {
        replaceGroup(next, old, group);
        next._sync.groups[group] = { ...old._sync.groups[group] };
        return;
      }
      const vector = { ...(next._sync.groups[group] || {}) };
      vector[actor] = counter;
      next._sync.groups[group] = vector;
    });
    next._sync.hashes = {};
    ['content', 'appearance', 'placement', 'lifecycle'].forEach((group) => {
      next._sync.hashes[group] = B.stableHash(groupValue(next, group));
    });
    return next;
  };
})(typeof self !== 'undefined' ? self : this);
