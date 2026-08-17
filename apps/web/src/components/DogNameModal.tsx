'use client';

import { useState } from 'react';
import { bridge } from '@/game/bridge';
import { ApiRequestError, apiPost } from '@/lib/api';
import { audio } from '@/lib/audio';
import Modal from './Modal';
import { commit, useFarm, type ActionReply } from './farmState';

/**
 * Naming the dog. Also renaming her, which is the same sentence with regret
 * in it — the field pre-fills with the current name so a typo is one edit,
 * not a retype.
 */
export default function DogNameModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const [name, setName] = useState(farm?.user.dogName ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await apiPost<ActionReply & { dogName: string }>('/act/dogName', {
        name: trimmed,
      });
      commit(r);
      audio.bark();
      bridge.toast('good', `${r.dogName} wags. She knows.`);
      onClose();
    } catch (err) {
      audio.error();
      bridge.toast('warn', err instanceof ApiRequestError ? err.message : 'The name did not take.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={farm?.user.dogName ? 'Rename the dog' : 'Name the dog'} onClose={onClose}>
      <p className="lead">
        She has followed you since the first morning. Two to sixteen characters — she has to hear it
        across a field.
      </p>
      <div className="row">
        <input
          value={name}
          maxLength={16}
          autoFocus
          placeholder="Biscuit? Clover? Rusty?"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button type="button" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
          {busy ? '…' : farm?.user.dogName ? 'Rename' : 'Name her'}
        </button>
      </div>

      <style jsx>{`
        .lead {
          margin: 0 0 0.9rem;
          font-size: 0.85rem;
          line-height: 1.5;
          opacity: 0.8;
        }
        .row {
          display: flex;
          gap: 0.5rem;
        }
        input {
          flex: 1;
          min-width: 0;
          padding: 0.6rem 0.8rem;
          border-radius: 12px;
          border: 1px solid rgba(245, 230, 200, 0.25);
          background: rgba(245, 230, 200, 0.08);
          color: #f5e6c8;
          font-size: 0.95rem;
        }
        button {
          padding: 0.6rem 1.1rem;
          border-radius: 12px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        button:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>
    </Modal>
  );
}
