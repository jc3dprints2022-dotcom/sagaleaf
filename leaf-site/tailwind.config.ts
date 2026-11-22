import type { Config } from 'tailwindcss'
// Literary palette: charcoal scenes, ivory paper, restrained amber light.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#0e0e10',
        coal: '#17171a',
        shell: '#28292e',
        ivory: '#efe9dc',
        paper: '#dbdbd1',
        dim: '#a29d92',
        amber: '#d39a4e',
        copper: '#b8663a',
        slate: '#4a4d52',
      },
      fontFamily: {
        serif: ['var(--font-literata)', 'Georgia', 'serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-hanken)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
