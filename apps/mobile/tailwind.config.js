/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0d0d0d',
        surface: {
          primary: '#171717',
          secondary: '#212121',
          tertiary: '#2f2f2f',
          hover: '#383838',
        },
        border: {
          light: '#2e2e2e',
          medium: '#424242',
        },
        text: {
          primary: '#ececec',
          secondary: '#b4b4b4',
          tertiary: '#8e8e8e',
        },
        brand: {
          green: '#10a37f',
          greenHover: '#1a7f64',
          accent: '#009688',
        },
      },
    },
  },
  plugins: [],
};
