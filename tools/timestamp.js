/**
 * A simple tool to get the current server time.
 */
module.exports = {
  name: 'timestamp',
  description: 'Returns the current server timestamp.',
  parameters: {},
  required: [],
  execute: async () => {
    return `Server time: ${new Date().toISOString()}`;
  }
};