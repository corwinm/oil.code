let disableUpdatePreview = false;

export function updateDisableUpdatePreview(value: boolean) {
  disableUpdatePreview = value;
}

export function isUpdatePreviewDisabled(): boolean {
  return disableUpdatePreview;
}
