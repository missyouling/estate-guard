Component({
  properties: {
    list: { type: Array, value: [] },
    selected: String,
  },
  data: { open: false },
  methods: {
    show() { this.setData({ open: true }); },
    close() { this.setData({ open: false }); },
    select(e: any) {
      const { id, name } = e.currentTarget.dataset;
      this.triggerEvent('change', { id, name });
      this.setData({ open: false });
    },
  },
});
