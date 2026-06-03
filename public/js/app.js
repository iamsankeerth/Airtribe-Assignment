import { createDashboardSession } from './session/dashboardSession.js';

document.addEventListener('DOMContentLoaded', () => {
  const session = createDashboardSession();
  session.init();
});
