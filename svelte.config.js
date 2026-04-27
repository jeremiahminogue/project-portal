import adapter from '@sveltejs/adapter-vercel';
import nodeAdapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: process.env.VERCEL ? adapter() : nodeAdapter()
  }
};

export default config;
