import { PreviewState } from "../constants";

export let previewState: PreviewState = {
  previewedFile: null,
  previewedEditor: null,
  cursorListenerDisposable: null,
  isDirectory: false,
  previewUri: null,
  previewEnabled: false,
};

export function setPreviewState(state: PreviewState) {
  previewState = state;
}

export function resetPreviewState() {
  previewState = {
    previewedFile: null,
    previewedEditor: null,
    cursorListenerDisposable: null,
    isDirectory: false,
    previewUri: null,
    previewEnabled: false,
  };
}
