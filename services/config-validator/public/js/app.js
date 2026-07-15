// Entry point: boot the controller once the DOM is ready.
import { initController } from './controller.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initController);
} else {
  initController();
}
