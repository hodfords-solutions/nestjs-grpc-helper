/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { inter: ['Inter', 'sans-serif'] },
      colors: {
        athens: '#FBFBFC',
        snowflake: '#EFF0F2',
        onyx: '#020303',
        gunmetal: '#434D57',
        mist: '#DADEE3',
        ash: '#BBBBBB',
        nimbus: '#99A4B0',
        storm: '#6B7280',
        cloud: '#BDC5CD',
      },
    },
  },
  plugins: [],
};
