import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        medicines: resolve(__dirname, 'medicines.html'),
        billing: resolve(__dirname, 'billing.html'),
        customers: resolve(__dirname, 'customers.html'),
        reports: resolve(__dirname, 'reports.html'),
        sales: resolve(__dirname, 'sales.html'),
        settings: resolve(__dirname, 'settings.html'),
      },
    },
  },
});