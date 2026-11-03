import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const target = env.VITE_RENDER || 'http://localhost:8080';

	return {
		plugins: [svelte()],
		server: {
			proxy: {
				'/proxy-api': {
					target: target,
					changeOrigin: true,
					secure: false,
					rewrite: (path) => path.replace(/^\/proxy-api/, '/api')
				}
			}
		}
	};
});
