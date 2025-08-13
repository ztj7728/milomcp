const { parentPort } = require('worker_threads');

/**
 * A generic worker that receives a function body as a string,
 * executes it with the provided arguments, and sends back the result.
 */
parentPort.on('message', async ({ funcString, args }) => {
  try {
    // Reconstruct the function from its string representation.
    // The function will receive a single object 'args' as its parameter.
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction('args', `return (${funcString})(args);`);

    // Execute the function, passing the entire args object as the single argument.
    const result = await func(args);
    
    // Send the result back to the main thread.
    parentPort.postMessage({ status: 'success', result });
  } catch (error) {
    // If an error occurs, send it back to the main thread.
    parentPort.postMessage({ 
      status: 'error', 
      error: {
        message: error.message,
        stack: error.stack
      } 
    });
  }
});