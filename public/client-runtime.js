// Jounce Client Runtime
// Provides JSX rendering and client-side utilities

// Import reactivity system for reactive components
import { effect } from './reactivity.js';

// Simple JSX createElement function (h function)
export function h(tag, props, ...children) {
    if (typeof tag === 'function') {
        // Component function - set up lifecycle context for nested components (Session 18)
        const parentContext = currentLifecycleContext;
        const componentContext = {
            mountCallbacks: [],
            unmountCallbacks: [],
            updateCallbacks: [],
            parent: parentContext
        };

        // Set as current context
        currentLifecycleContext = componentContext;

        // Render component (Session 19: Wrap in try-catch for error boundaries)
        let result;
        try {
            result = tag(props, children);
        } catch (error) {
            // Restore parent context
            currentLifecycleContext = parentContext;

            // Forward error to nearest error boundary
            if (currentErrorBoundary) {
                console.error('[h()] Component error caught, forwarding to ErrorBoundary:', error);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'component-error';
                errorDiv.textContent = `Error in component: ${error.message}`;

                // Trigger error boundary handler
                if (currentErrorBoundary.handleError) {
                    currentErrorBoundary.handleError(error);
                }

                return errorDiv;
            }

            // No error boundary - rethrow
            throw error;
        }

        // Restore parent context
        currentLifecycleContext = parentContext;

        // If we have a parent context, merge our callbacks into it
        // This ensures nested component lifecycles are properly managed
        if (parentContext) {
            parentContext.mountCallbacks.push(...componentContext.mountCallbacks);
            parentContext.unmountCallbacks.push(...componentContext.unmountCallbacks);
            parentContext.updateCallbacks.push(...componentContext.updateCallbacks);
        } else if (result instanceof Node) {
            // No parent context - this is a standalone component render
            // Execute onMount after a microtask to ensure DOM is ready
            if (componentContext.mountCallbacks.length > 0) {
                queueMicrotask(() => {
                    componentContext.mountCallbacks.forEach(callback => {
                        try {
                            callback();
                        } catch (error) {
                            console.error('Error in onMount callback:', error);
                        }
                    });
                });
            }

            // Store unmount callbacks
            if (componentContext.unmountCallbacks.length > 0) {
                result.__jounce_unmount = () => {
                    componentContext.unmountCallbacks.forEach(callback => {
                        try {
                            callback();
                        } catch (error) {
                            console.error('Error in onUnmount callback:', error);
                        }
                    });
                };
            }
        }

        return result;
    }

    const element = document.createElement(tag);

    // Set properties
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            // Check if value is a reactive signal
            const isSignal = value && typeof value === 'object' && '_value' in value && '_subscribers' in value;

            if (key === 'className') {
                if (isSignal) {
                    element.className = value.value;
                    effect(() => { element.className = value.value; });
                } else {
                    element.className = value;
                }
            } else if (key === 'class') {
                if (isSignal) {
                    element.className = value.value;
                    effect(() => { element.className = value.value; });
                } else {
                    element.className = value;
                }
            } else if (key.startsWith('on')) {
                const eventName = key.substring(2).toLowerCase();
                element.addEventListener(eventName, value);
            } else if (key === 'style' && typeof value === 'object') {
                if (isSignal) {
                    Object.assign(element.style, value.value);
                    effect(() => { Object.assign(element.style, value.value); });
                } else {
                    Object.assign(element.style, value);
                }
            } else {
                if (isSignal) {
                    element.setAttribute(key, value.value);
                    effect(() => { element.setAttribute(key, value.value); });
                } else {
                    element.setAttribute(key, value);
                }
            }
        }
    }

    // Append children
    for (const child of children.flat()) {
        if (child === null || child === undefined) {
            continue;
        } else if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
            element.appendChild(child);
        } else if (child && typeof child === 'object' && '_value' in child && '_subscribers' in child) {
            // This is a reactive signal! Create a text node and set up auto-update
            const textNode = document.createTextNode(String(child.value));
            element.appendChild(textNode);

            // Set up effect to update text node when signal changes
            effect(() => {
                textNode.textContent = String(child.value);
            });
        }
    }

    return element;
}

// Component Lifecycle Context (Session 18)
// Stores lifecycle hooks for the currently rendering component
let currentLifecycleContext = null;

// Error Boundary Context (Session 19)
// Tracks the current error boundary for error handling
let currentErrorBoundary = null;

// Component lifecycle hooks registry
export function onMount(callback) {
    if (currentLifecycleContext) {
        currentLifecycleContext.mountCallbacks.push(callback);
    } else {
        console.warn('onMount called outside of component render');
    }
}

export function onUnmount(callback) {
    if (currentLifecycleContext) {
        currentLifecycleContext.unmountCallbacks.push(callback);
    } else {
        console.warn('onUnmount called outside of component render');
    }
}

export function onUpdate(callback) {
    if (currentLifecycleContext) {
        currentLifecycleContext.updateCallbacks.push(callback);
    } else {
        console.warn('onUpdate called outside of component render');
    }
}

export function onError(callback) {
    // Session 19: Error handling hook
    if (currentLifecycleContext) {
        if (!currentLifecycleContext.errorCallbacks) {
            currentLifecycleContext.errorCallbacks = [];
        }
        currentLifecycleContext.errorCallbacks.push(callback);
    } else {
        console.warn('onError called outside of component render');
    }
}

// ErrorBoundary component (Session 19)
// Catches errors in child component tree and displays fallback UI
export function ErrorBoundary(props, passedChildren) {
    const { fallback, children: propsChildren } = props || {};

    // Children can be passed either as second argument or in props
    const children = passedChildren || propsChildren || [];

    // Set up error boundary context
    const parentBoundary = currentErrorBoundary;
    const errorState = {
        error: null,
        hasError: false,
        parent: parentBoundary
    };

    currentErrorBoundary = errorState;

    try {
        // Render children
        const childElements = Array.isArray(children)
            ? children.flat().filter(child => child != null)
            : [children].filter(child => child != null);
        const rendered = document.createElement('div');
        rendered.className = 'error-boundary';

        for (const child of childElements) {
            if (child instanceof Node) {
                rendered.appendChild(child);
            } else if (typeof child === 'string' || typeof child === 'number') {
                rendered.appendChild(document.createTextNode(String(child)));
            }
        }

        // Restore parent boundary
        currentErrorBoundary = parentBoundary;

        // Store error handler on element
        rendered.__errorBoundary = {
            handleError: (error) => {
                console.error('[ErrorBoundary] Caught error:', error);
                errorState.error = error;
                errorState.hasError = true;

                // Call onError callbacks if any
                if (currentLifecycleContext && currentLifecycleContext.errorCallbacks) {
                    currentLifecycleContext.errorCallbacks.forEach(callback => {
                        try {
                            callback(error);
                        } catch (err) {
                            console.error('[ErrorBoundary] Error in onError callback:', err);
                        }
                    });
                }

                // Render fallback UI
                if (fallback) {
                    const fallbackUI = typeof fallback === 'function'
                        ? fallback(error)
                        : fallback;

                    // Replace content with fallback
                    rendered.innerHTML = '';
                    if (fallbackUI instanceof Node) {
                        rendered.appendChild(fallbackUI);
                    } else if (typeof fallbackUI === 'string') {
                        rendered.textContent = fallbackUI;
                    }
                }
            }
        };

        return rendered;
    } catch (error) {
        // Restore parent boundary
        currentErrorBoundary = parentBoundary;

        console.error('[ErrorBoundary] Error during render:', error);
        errorState.error = error;
        errorState.hasError = true;

        // Render fallback UI
        if (fallback) {
            const fallbackUI = typeof fallback === 'function'
                ? fallback(error)
                : fallback;

            if (fallbackUI instanceof Node) {
                return fallbackUI;
            } else if (typeof fallbackUI === 'string') {
                const div = document.createElement('div');
                div.className = 'error-boundary-fallback';
                div.textContent = fallbackUI;
                return div;
            }
        }

        // Default fallback
        const div = document.createElement('div');
        div.className = 'error-boundary-fallback';
        div.style.cssText = 'padding: 20px; border: 2px solid #ff0000; background: #ffe0e0; color: #cc0000;';
        div.innerHTML = `<h3>Something went wrong</h3><pre>${error.message}</pre>`;
        return div;
    }
}

// Mount a component to the DOM (with lifecycle support - Session 18+20)
// Session 20: NON-reactive mount (reactive rendering requires compiler changes)
// Components render once. Use signals in event handlers for updates.
export function mountComponent(component, selector = '#app') {
    const container = document.querySelector(selector);
    if (!container) {
        console.error(`Mount target "${selector}" not found`);
        return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Create lifecycle context
    const lifecycleContext = {
        mountCallbacks: [],
        unmountCallbacks: [],
        updateCallbacks: []
    };

    // Set as current context
    currentLifecycleContext = lifecycleContext;

    // Render component (called ONCE - signals created once)
    const rendered = typeof component === 'function' ? component() : component;

    // Clear context
    currentLifecycleContext = null;

    if (rendered instanceof Node) {
        container.appendChild(rendered);

        // Execute onMount callbacks after DOM insertion
        lifecycleContext.mountCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in onMount callback:', error);
            }
        });

        // Store unmount callbacks on the element for cleanup
        if (lifecycleContext.unmountCallbacks.length > 0) {
            rendered.__jounce_unmount = () => {
                lifecycleContext.unmountCallbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (error) {
                        console.error('Error in onUnmount callback:', error);
                    }
                });
            };
        }
    } else {
        console.error('Component did not return a valid DOM node');
    }

    return lifecycleContext;
}

// RPC Client for calling server functions
export class RPCClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async call(functionName, params = {}) {
        const response = await fetch(`${this.baseUrl}/rpc/${functionName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            throw new Error(`RPC call failed: ${response.statusText}`);
        }

        return await response.json();
    }
}

// Jounce Router - Client-side routing with browser history API
export class JounceRouter {
    constructor() {
        this.routes = new Map(); // path -> render function
        this.currentPath = window.location.pathname;
        this.params = {};

        // Listen to popstate (back/forward buttons)
        window.addEventListener('popstate', () => {
            this.handleRoute(window.location.pathname);
        });
    }

    // Register a route with a render function
    route(path, renderFn) {
        this.routes.set(path, renderFn);
    }

    // Navigate to a path (pushes to history)
    navigate(path) {
        if (path !== this.currentPath) {
            window.history.pushState({}, '', path);
            this.handleRoute(path);
        }
    }

    // Handle route change - find matching route and render
    handleRoute(path) {
        this.currentPath = path;

        // Try exact match first
        if (this.routes.has(path)) {
            const renderFn = this.routes.get(path);
            renderFn();
            return;
        }

        // Try pattern matching for dynamic routes like /user/:id
        for (const [pattern, renderFn] of this.routes) {
            const params = this.matchRoute(pattern, path);
            if (params) {
                this.params = params;
                renderFn();
                return;
            }
        }

        // No match - render 404
        this.render404();
    }

    // Match a route pattern against actual path
    // Pattern: /user/:id, Path: /user/123 -> { id: "123" }
    matchRoute(pattern, path) {
        const patternParts = pattern.split('/').filter(p => p);
        const pathParts = path.split('/').filter(p => p);

        if (patternParts.length !== pathParts.length) {
            return null;
        }

        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                // Dynamic segment
                const paramName = patternParts[i].slice(1);
                params[paramName] = pathParts[i];
            } else if (patternParts[i] !== pathParts[i]) {
                // Static segment doesn't match
                return null;
            }
        }

        return params;
    }

    // Get URL parameter by name
    getParam(name) {
        return this.params[name] || '';
    }

    // Get current path
    getCurrentPath() {
        return this.currentPath;
    }

    // 404 handler
    render404() {
        const appEl = document.getElementById('app');
        if (appEl) {
            appEl.innerHTML = '<h1>404 - Page Not Found</h1>';
        }
    }

    // Start the router - call this after routes are registered
    start() {
        this.handleRoute(this.currentPath);
    }
}

// Global router instance
let globalRouter = null;

// Get or create global router
export function getRouter() {
    if (!globalRouter) {
        globalRouter = new JounceRouter();
    }
    return globalRouter;
}

// Convenience function for navigation
export function navigate(path) {
    getRouter().navigate(path);
}

// ==================== WebSocket Client ====================

// WebSocket client with automatic reconnection
class WebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.ws = null;
        this.state = 'disconnected';
        this.reconnectEnabled = options.reconnectEnabled !== false;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 1000;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.messageHandlers = [];
        this.stateHandlers = [];
        this.rooms = [];
    }

    // Connect to WebSocket server
    connect() {
        if (this.state === 'connected' || this.state === 'connecting') {
            return;
        }

        this.state = 'connecting';
        this.notifyStateChange();

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connected to', this.url);
                this.state = 'connected';
                this.reconnectAttempts = 0;
                this.notifyStateChange();
                this.flushMessageQueue();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.notifyMessageHandlers(message);
                } catch (error) {
                    console.error('[WebSocket] Error parsing message:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
            };

            this.ws.onclose = () => {
                console.log('[WebSocket] Connection closed');
                this.state = 'disconnected';
                this.notifyStateChange();

                // Attempt reconnection if enabled
                if (this.reconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    setTimeout(() => this.connect(), this.reconnectDelay);
                }
            };
        } catch (error) {
            console.error('[WebSocket] Connection failed:', error);
            this.state = 'disconnected';
            this.notifyStateChange();
        }
    }

    // Disconnect from WebSocket server
    disconnect() {
        if (this.ws) {
            this.reconnectEnabled = false;
            this.state = 'disconnecting';
            this.notifyStateChange();
            this.ws.close();
            this.ws = null;
        }
    }

    // Send message to server
    send(type, data) {
        const message = {
            type,
            data,
            timestamp: Date.now(),
            id: Math.random().toString(36).substring(7)
        };

        if (this.state === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            // Queue message for sending when connection is ready
            this.messageQueue.push(message);
        }
    }

    // Send queued messages
    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.state === 'connected') {
            const message = this.messageQueue.shift();
            this.ws.send(JSON.stringify(message));
        }
    }

    // Register message handler
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    // Register state change handler
    onStateChange(handler) {
        this.stateHandlers.push(handler);
    }

    // Notify message handlers
    notifyMessageHandlers(message) {
        this.messageHandlers.forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                console.error('[WebSocket] Error in message handler:', error);
            }
        });
    }

    // Notify state change handlers
    notifyStateChange() {
        this.stateHandlers.forEach(handler => {
            try {
                handler(this.state);
            } catch (error) {
                console.error('[WebSocket] Error in state change handler:', error);
            }
        });
    }

    // Join a room
    joinRoom(room) {
        if (!this.rooms.includes(room)) {
            this.rooms.push(room);
            this.send('join_room', { room });
        }
    }

    // Leave a room
    leaveRoom(room) {
        const index = this.rooms.indexOf(room);
        if (index > -1) {
            this.rooms.splice(index, 1);
            this.send('leave_room', { room });
        }
    }

    // Broadcast to room
    broadcast(room, type, data) {
        this.send('broadcast', { room, type, data });
    }

    // Get current state
    getState() {
        return this.state;
    }

    // Check if connected
    isConnected() {
        return this.state === 'connected';
    }
}

// Suspense component (Session 19)
// Shows fallback UI while async operations are pending
export function Suspense(props, passedChildren) {
    const { fallback, children: propsChildren } = props || {};
    const children = passedChildren || propsChildren || [];

    const container = document.createElement('div');
    container.className = 'suspense-boundary';

    // State management for suspense
    let isLoading = true;
    let loadingTimeout = null;

    // Render fallback initially
    const renderFallback = () => {
        container.innerHTML = '';
        if (fallback instanceof Node) {
            container.appendChild(fallback);
        } else if (typeof fallback === 'string') {
            container.textContent = fallback;
        } else if (typeof fallback === 'function') {
            const fallbackUI = fallback();
            if (fallbackUI instanceof Node) {
                container.appendChild(fallbackUI);
            }
        } else {
            // Default loading fallback
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'suspense-fallback';
            loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: #666;';
            loadingDiv.innerHTML = '<p>Loading...</p>';
            container.appendChild(loadingDiv);
        }
    };

    // Render children
    const renderChildren = () => {
        container.innerHTML = '';
        const childElements = Array.isArray(children)
            ? children.flat().filter(child => child != null)
            : [children].filter(child => child != null);

        for (const child of childElements) {
            if (child instanceof Node) {
                container.appendChild(child);
            } else if (typeof child === 'string' || typeof child === 'number') {
                container.appendChild(document.createTextNode(String(child)));
            }
        }
        isLoading = false;
    };

    // Initially show fallback, then switch to children after microtask
    // This allows async operations in onMount to complete first
    renderFallback();

    // Use a short timeout to allow onMount hooks to run and signal loading
    loadingTimeout = setTimeout(() => {
        renderChildren();
    }, 0);

    // Store render functions for external control
    container.__suspense = {
        showFallback: () => {
            if (!isLoading) {
                isLoading = true;
                renderFallback();
            }
        },
        showChildren: () => {
            if (isLoading) {
                renderChildren();
            }
        },
        isLoading: () => isLoading
    };

    // Cleanup on unmount
    container.__jounce_unmount = () => {
        if (loadingTimeout) {
            clearTimeout(loadingTimeout);
        }
    };

    return container;
}

// Export for window.Jounce global
if (typeof window !== 'undefined') {
    window.Jounce = {
        h,
        mountComponent,
        onMount,
        onUnmount,
        onUpdate,
        onError,
        ErrorBoundary,
        Suspense,
        RPCClient,
        JounceRouter,
        getRouter,
        navigate,
        WebSocketClient,
    };
}
