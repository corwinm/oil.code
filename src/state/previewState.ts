import { PreviewState } from "../constants";

let previewState: PreviewState = {
  previewedFile: null,
  previewedEditor: null,
  cursorListenerDisposable: null,
  isDirectory: false,
  previewUri: null,
  previewEnabled: false,
};

export function getPreviewState(): PreviewState {
  return previewState;
}

export function setPreviewState(state: PreviewState) {
  previewState = state;
}

export function resetPreviewState() {
  previewState.cursorListenerDisposable?.dispose();
  previewState = {
    previewedFile: null,
    previewedEditor: null,
    cursorListenerDisposable: null,
    isDirectory: false,
    previewUri: null,
    previewEnabled: false,
  };
}
