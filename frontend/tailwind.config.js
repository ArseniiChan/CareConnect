/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Creates a custom breakpoint called 'nav-break' at 850px
        'nav-break': '900px', 
      },
    },
  },
  plugins: [],
}