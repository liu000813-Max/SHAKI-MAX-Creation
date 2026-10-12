import type { Config } from 'tailwindcss';

// Design tokens per SHAKI_AI_Product_Match_UI_UX_Design_Spec_V4.0 (TABLE 1).
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        shaki: {
          purple: '#4B2E6D', // Primary
          purple2: '#6E4A8E', // Secondary
          deep: '#241434',
          soft: '#F4F0FC',
          lavender: '#E9E1F7',
          accent: '#C9A227',
        },
        surface: '#FCFAFD', // Main canvas
        panel: '#F7F4F9', // Cards / sidebars
        ink: '#26212B', // Primary text
        muted: '#6B6670', // Secondary text
        success: '#3E7B57', // Verified / strong match
        warning: '#A66B00', // Medium confidence
        danger: '#A63D40', // Validation / error
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        display: ['Inter', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        btn: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
