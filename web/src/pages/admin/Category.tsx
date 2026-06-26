import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Category } from '@/types';

export default function Category() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', icon: '', sort_order: 0 });
  const [newName, setNewName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/category');
      if (res.data.code === 0) setItems(res.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error('请输入分类名称'); return; }
    try {
      await api.post('/admin/category', { name: newName.trim(), sort_order: items.length + 1 });
      toast.success('添加成功');
      setNewName('');
      load();
    } catch (err: any) { toast.error(err.response?.data?.message || '添加失败'); }
  };

  const handleEdit = (item: Category) => {
    setEditingId(item.id);
    setForm({ name: item.name, icon: item.icon || '', sort_order: item.sort_order });
  };

  const handleSave = async (id: number) => {
    try {
      await api.put(`/admin/category/${id}`, form);
      toast.success('保存成功');
      setEditingId(null);
      load();
    } catch (err: any) { toast.error(err.response?.data?.message || '保存失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return;
    try {
      await api.delete(`/admin/category/${id}`);
      toast.success('已删除');
      load();
    } catch (err: any) { toast.error(err.response?.data?.message || '删除失败'); }
  };

  return (
    <div>
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">分类管理</h2>

      <div className="border border-[var(--border)] rounded-xl p-4 mb-4 flex gap-2 bg-[var(--card)]">
        <input type="text" placeholder="新分类名称" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
        <button onClick={handleAdd}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 transition-colors whitespace-nowrap">
          添加
        </button>
      </div>

      <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm bg-[var(--card)]">
        {loading ? (
          <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">暂无分类</div>
        ) : (
          <div className="space-y-2 p-3">
            {items.map((item) => (
              <div key={item.id} className="bg-[var(--card)]/70 rounded-xl p-4 border border-[var(--border)] flex items-center gap-4">
                {editingId === item.id ? (
                  <>
                    <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all" />
                    <input value={form.icon} onChange={e => setForm(p => ({...p, icon: e.target.value}))}
                      placeholder="图标名" className="w-24 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all" />
                    <input type="number" value={form.sort_order} onChange={e => setForm(p => ({...p, sort_order: +e.target.value}))}
                      className="w-16 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none text-center" />
                    <button onClick={() => handleSave(item.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">保存</button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-medium">取消</button>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">{item.icon || '📁'}</span>
                    <div className="flex-1">
                      <span className="text-[var(--foreground)] text-sm font-medium">{item.name}</span>
                      <span className="text-[var(--muted-foreground)] text-xs ml-2">排序: {item.sort_order}</span>
                    </div>
                    <button onClick={() => handleEdit(item)}
                      className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors">编辑</button>
                    <button onClick={() => handleDelete(item.id)}
                      className="px-2 py-1 rounded-lg bg-[var(--destructive)]/10 hover:bg-[var(--destructive)]/20 transition-colors" title="删除">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--destructive)]"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
