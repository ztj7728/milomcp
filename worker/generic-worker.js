const { parentPort } = require('worker_threads');

/**
 * A generic worker that receives a function body as a string,
 * executes it with the provided arguments, and sends back the result.
 */
parentPort.on('message', async ({ funcString, args }) => {
  try {
    // Reconstruct the function from its string representation.
    // This is a safer way to execute dynamic code than eval().
    // The 'AsyncFunction' constructor allows the reconstructed function to be async.
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction(...Object.keys(args), `return (${funcString})(...Object.values(arguments));`);

    // Execute the function with the provided arguments.
    const result = await func(...Object.values(args));
    
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