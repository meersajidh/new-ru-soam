// import { contextBridge, ipcRenderer, webFrame } from 'electron';

// contextBridge.exposeInMainWorld('electronAPI', {
//   platform: process.platform,
// });

// contextBridge.exposeInMainWorld('zoomAPI', {
//   set: (factor: number) => webFrame.setZoomFactor(factor),
//   get: () => webFrame.getZoomFactor(),
// });

// contextBridge.exposeInMainWorld('windowControls', {
//   minimize: () => ipcRenderer.send('window:minimize'),
//   maximize: () => ipcRenderer.send('window:maximize'),
//   close: () => ipcRenderer.send('window:close'),
// });
