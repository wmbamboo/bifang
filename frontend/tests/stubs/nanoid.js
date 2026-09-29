module.exports = {
  nanoid: (size = 21) => `testid${"x".repeat(Math.max(0, size - 6))}`.slice(0, size),
};
