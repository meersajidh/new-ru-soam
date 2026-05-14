import { contextBridge } from 'electron';
import { soam } from './soam';

// Per ADR-202: the renderer's only platform surface is `window.soam`.
// Anything else exposed here is a regression of the trust boundary.
contextBridge.exposeInMainWorld('soam', soam);
