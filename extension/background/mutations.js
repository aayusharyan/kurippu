/* Serialized note mutations for the service worker.
   One queue owns actor-counter allocation so tabs cannot race a
   read-modify-write of the same note. */
(function (root) {
  'use strict';

  const BG = root.__KurippuBackground = root.__KurippuBackground || {};
  const K = root.Kurippu;

  let mutationQueue = Promise.resolve();

  /** Let the next queued write run whether this one succeeded or failed. */
  function advanceQueue(previousTask) {
    return previousTask.then(() => undefined, () => undefined);
  }

  /** Turn one mutation message into the notes that should be stored. */
  async function buildMutationOutput(msg, replica) {
    const input = msg.op === 'putMany' ? (Array.isArray(msg.notes) ? msg.notes : []) : [msg.note];
    const output = [];
    for (const note of input) {
      if (!K.validNote(note)) continue;
      if (msg.preserveSync) output.push(K.normalizeNote(note));
      else {
        replica.counter++;
        const existing = await K.store.get(note.id);
        const candidate = K.prepareLocalWrite(existing, note, replica.actor, replica.counter, msg.groups);
        if (msg.keepTime && Number.isFinite(note.updated)) candidate.updated = note.updated;
        output.push(...K.mergeNoteSets(existing ? [existing] : [], [candidate]));
      }
    }
    return output;
  }

  /** Write the replica and the resulting notes, advancing the epoch when needed. */
  async function persistMutationResults(output, replica, stored) {
    const values = {
      [K.SYNC_META_KEY]: replica,
      mutationEpoch: (stored.mutationEpoch || 0) + (output.length ? 1 : 0),
    };
    output.forEach((note) => { values[K.NOTE_PREFIX + note.id] = note; });
    if (output.length) await chrome.storage.local.set(values);
  }

  /** Queue one store-mutation message so revisions stay ordered. */
  BG.commitMutation = function commitMutation(msg) {
    const run = async () => {
      const stored = await chrome.storage.local.get([K.SYNC_META_KEY, 'mutationEpoch']);
      const replica = stored[K.SYNC_META_KEY] || { actor: crypto.randomUUID(), counter: 0 };
      const output = await buildMutationOutput(msg, replica);
      await persistMutationResults(output, replica, stored);
      const requested = output.find((note) => note.id === (msg.note && msg.note.id));
      return msg.op === 'putMany' ? { notes: output } : { note: requested || null };
    };
    const result = mutationQueue.then(run, run);
    mutationQueue = advanceQueue(result);
    return result;
  };
})(self);
