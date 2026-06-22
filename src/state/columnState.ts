let _detailsVisible = true;

export function getDetailsVisible(): boolean {
  return _detailsVisible;
}

export function setDetailsVisible(v: boolean): void {
  _detailsVisible = v;
}

export function toggleDetailsVisible(): void {
  _detailsVisible = !_detailsVisible;
}
