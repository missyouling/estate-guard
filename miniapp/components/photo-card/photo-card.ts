Component({
  properties: {
    src: String,
    thumbnail: String,
    type: { type: String, value: 'image' },
    recordNo: Number,
    mediaId: Number,
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.properties.mediaId });
    },
  },
});
