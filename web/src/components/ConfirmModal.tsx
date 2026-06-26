import { useState, useCallback } from 'react';

interface Props { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; }
export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger }: Props) {
  const [closing, setClosing] = useState(false);
  const doCancel = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); onCancel(); }, 150);
  }, [closing, onCancel]);
  if (!open && !closing) return null;
  return (
    <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 ${closing ? 'animate-modal-leave' : 'animate-modal-enter'}`} onClick={doCancel}>
      <div className={`bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-sm w-full p-6 ${closing ? 'animate-modal-content-leave' : 'animate-modal-content-enter'}`} onClick={e => e.stopPropagation()}>
        <h3 className="text-[var(--foreground)] text-base font-bold mb-2">{title}</h3>
        <p className="text-[var(--muted-foreground)] text-sm mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={doCancel} className="px-4 py-2 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)]">取消</button>
          <button onClick={() => { onConfirm(); doCancel(); }} className={`px-4 py-2 text-xs rounded-lg text-white font-medium ${danger ? 'bg-[var(--destructive)] hover:bg-[var(--destructive)]/80' : 'bg-[var(--primary)] hover:bg-[var(--primary)]/80'}`}>确认</button>
        </div>
      </div>
    </div>
  );
}