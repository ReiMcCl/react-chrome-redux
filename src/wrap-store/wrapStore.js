import {
  DISPATCH_TYPE,
  STATE_TYPE,
  PATCH_STATE_TYPE,
  PORT_INITIALIZED
} from '../constants';

import shallowDiff from './shallowDiff';

/**
 * Responder for promisified results
 * @param  {object} dispatchResult The result from `store.dispatch()`
 * @param  {function} send         The function used to respond to original message
 * @return {undefined}
 */
const promiseResponder = (dispatchResult, send) => {
  Promise
    .resolve(dispatchResult)
    .then((res) => {
      send({
        error: null,
        value: res
      });
    })
    .catch((err) => {
      console.error('error dispatching result:', err);
      send({
        error: err.message,
        value: null
      });
    });
};

export default (store, {
  portName,
  dispatchResponder
}) => {
  if (!portName) {
    throw new Error('portName is required in options');
  }

  const PORT_LIST = {};
  let portCount = 0;

  // set dispatch responder as promise responder
  if (!dispatchResponder) {
    dispatchResponder = promiseResponder;
  }

  /**
   * Respond to dispatches from UI components
   */
  const dispatchResponse = (request, sender, sendResponse) => {
    if (request.type === DISPATCH_TYPE && request.portName === portName) {
      const action = Object.assign({}, request.payload, {
        _sender: sender
      });

      let dispatchResult = null;

      try {
        dispatchResult = store.dispatch(action);
      } catch (e) {
        dispatchResult = Promise.reject(e.message);
        console.error(e);
      }

      dispatchResponder(dispatchResult, sendResponse);
      return true;
    }
  };

  const addPort = (port, subState = {}) => {
    const portI = getPortIndex();

    PORT_LIST[portI] = {
      port: port,
      subState: subState
    };

    return portI;
  }

  const getPortIndex = () => {
    return portCount++;
  }

  const removePort = (port) => {
    delete PORT_LIST[port.id];
  }

  /**
  * Setup for state updates
  */
  const connectState = (port) => {
    if (port.name !== portName) {
      return;
    }

    const portI = addPort(port, {});

    let prevState = store.getState();

    const patchState = () => {
      const state = store.getState();
      const diff = shallowDiff(prevState, state);

      if (diff.length) {
        prevState = state;

        port.postMessage({
          type: PATCH_STATE_TYPE,
          payload: diff,
        });
      }
    };

    // Send patched state down connected port on every redux store state change
    const unsubscribe = store.subscribe(patchState);

    const disconnectState = (port) => {
      removePort(port);
      unsubscribe(port);
    }

    // when the port disconnects, unsubscribe the sendState listener
    port.onDisconnect.addListener(disconnectState);

    // Send store's initial state through port
    port.postMessage({
      type: PORT_INITIALIZED,
      payload: {
        portIndex: portI,
        prevState: prevState
      }
    });
  };

  /**
   * Setup action handler
   */
  chrome.runtime.onMessage.addListener(dispatchResponse);

  /**
   * Setup external action handler
   */
  if (chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener(dispatchResponse);
  } else {
    console.warn('runtime.onMessageExternal is not supported');
  }

  /**
   * Setup extended connection
   */
  chrome.runtime.onConnect.addListener(connectState);

  /**
   * Setup extended external connection
   */
  if (chrome.runtime.onConnectExternal) {
    chrome.runtime.onConnectExternal.addListener(connectState);
  } else {
    console.warn('runtime.onConnectExternal is not supported');
  }
};
